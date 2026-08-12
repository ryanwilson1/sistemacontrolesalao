/**
 * Estorno de atendimento — o inverso exato da conclusão.
 *
 * A pergunta que este arquivo responde é a única que importa quando se
 * apaga um atendimento concluído: **o dinheiro volta a bater?**
 *
 * Não basta o agendamento sumir. Se a receita ficar, o mês fecha
 * inflado. Se a entrada do caixa ficar, a gaveta não confere. Se a
 * baixa de estoque ficar, o produto some da prateleira sem ter sido
 * usado. Se a ficha ficar, a cliente tem histórico de um atendimento
 * que nunca houve.
 *
 * O teste mede o estado ANTES de concluir, conclui, estorna, e exige
 * que tudo tenha voltado ao número exato de antes.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

let testes = 0
let falhas = 0

function ok(condicao: boolean, rotulo: string, detalhe = '') {
  testes += 1
  if (condicao) console.log(`  ok  ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
  else {
    falhas += 1
    console.log(`  FALHOU  ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

const dir = join(import.meta.dirname, '..', 'supabase')
const ler = (a: string) => readFileSync(join(dir, a), 'utf8')
const adaptar = (sql: string) =>
  sql
    .replace(/^create extension .*$/gim, '')
    .replace(/^\s*revoke .*$/gim, '')
    .replace(/^\s*grant .*$/gim, '')

const db = new PGlite({ extensions: { btree_gist } })
await db.exec('create extension if not exists btree_gist;')
await db.exec(adaptar(ler('01-esquema.sql')))
await db.exec(
  adaptar(ler('12-correcao-esquema.sql')).replace(
    /create or replace function atualizar_com_versao[\s\S]*$/,
    '',
  ),
)

// Stubs das funções de permissão (vivem no 02/10, que dependem do
// esquema `auth` do Supabase). Aqui liberam tudo: o que está em teste é
// a mecânica do estorno, não o RLS.
await db.exec(`
  create or replace function equipe_com_acesso_completo() returns boolean language sql as 'select true';
`)

await db.exec(adaptar(ler('14-estorno-atendimento.sql')))

/* ---------------- cenário ---------------- */
await db.exec(`
  insert into profissionais (id, nome, papel, cor) values ('prof-1','Emely','proprietaria','#C98F98');
  insert into clientes (id, nome, telefone) values ('cli-1','Emely','11996711018');
  insert into categorias (id, nome) values ('cat-1','Cabelo');
  insert into servicos (id, categoria_id, nome, duracao_minutos, preco)
    values ('srv-1','cat-1','corte + escova',60,100);
  insert into fornecedores (id, nome) values ('for-1','Distribuidora');
  insert into produtos (id, nome, unidade, quantidade, quantidade_minima, preco_custo, preco_medio, preco_venda)
    values ('prod-1','Shampoo','ml',1000,100,50,50,80);

  insert into caixas (id, data, situacao, aberto_em, valor_abertura)
    values ('cx-1', current_date, 'aberto', now(), 122.50);

  insert into agendamentos (id, cliente_id, profissional_id, servico_id, inicio, fim, situacao, preco, desconto, protocolo)
    values ('ag-1','cli-1','prof-1','srv-1',
            now(), now() + interval '1 hour', 'confirmado', 100, 0, 'TESTE1');
`)

async function numero(sql: string): Promise<number> {
  const { rows } = await db.query<{ v: string }>(sql)
  return Number(rows[0]?.v ?? 0)
}

const estoqueAntes = await numero(`select quantidade::text as v from produtos where id='prod-1'`)

/* ---------------- conclui, à mão, como a RPC faz ---------------- */
console.log('\n── 1 · o atendimento é concluído e gera as cinco consequências\n')

await db.exec(`
  update agendamentos set situacao='concluido', finalizado_em=now() where id='ag-1';

  insert into procedimentos (id, cliente_id, agendamento_id, servico_id, profissional_id, data, produtos)
    values ('proc-1','cli-1','ag-1','srv-1','prof-1', now(), '[]'::jsonb);

  insert into fotos (id, cliente_id, procedimento_id, momento, conteudo)
    values ('foto-1','cli-1','proc-1','antes','base64aaa');

  insert into movimentos (id, produto_id, tipo, quantidade, motivo, agendamento_id)
    values ('mv-est-1','prod-1','consumo',30,'Consumo em atendimento','ag-1');
  update produtos set quantidade = quantidade - 30 where id='prod-1';

  insert into lancamentos (id, agendamento_id, cliente_id, tipo, situacao, categoria, descricao, valor, forma, vencimento, pago_em)
    values ('lan-1','ag-1','cli-1','receita','recebido','Serviços','corte + escova · Emely',100,'dinheiro',current_date, now());

  insert into pontos (id, cliente_id, agendamento_id, pontos, motivo)
    values ('pt-1','cli-1','ag-1',100,'atendimento');

  insert into movimentos_caixa (id, caixa_id, tipo, forma, descricao, valor, agendamento_id)
    values ('mvc-1','cx-1','entrada','dinheiro','corte + escova',100,'ag-1');
`)

ok(await numero(`select count(*)::text as v from lancamentos where agendamento_id='ag-1'`) === 1, 'receita lançada')
ok(await numero(`select count(*)::text as v from movimentos_caixa where agendamento_id='ag-1'`) === 1, 'entrada no caixa')
ok(await numero(`select quantidade::text as v from produtos where id='prod-1'`) === estoqueAntes - 30, 'estoque baixado')
ok(await numero(`select count(*)::text as v from fotos where procedimento_id='proc-1'`) === 1, 'foto ligada à ficha')

/* ---------------- estorna ---------------- */
console.log('\n── 2 · o estorno desfaz TUDO e o financeiro volta a bater\n')

const { rows: resultado } = await db.query<{ r: Record<string, unknown> }>(
  `select estornar_atendimento('ag-1', true) as r`,
)

ok(await numero(`select count(*)::text as v from lancamentos where agendamento_id='ag-1'`) === 0, 'receita desfeita')
ok(await numero(`select count(*)::text as v from movimentos_caixa where agendamento_id='ag-1'`) === 0, 'entrada do caixa desfeita')
ok(await numero(`select count(*)::text as v from pontos where agendamento_id='ag-1'`) === 0, 'pontos desfeitos')
ok(await numero(`select count(*)::text as v from procedimentos where agendamento_id='ag-1'`) === 0, 'ficha desfeita')
ok(
  await numero(`select count(*)::text as v from fotos where id='foto-1'`) === 0,
  'foto saiu junto pelo cascade da ficha',
)
ok(
  await numero(`select quantidade::text as v from produtos where id='prod-1'`) === estoqueAntes,
  'produto voltou para a prateleira',
  `${estoqueAntes} unidades`,
)
ok(await numero(`select count(*)::text as v from agendamentos where id='ag-1'`) === 0, 'agendamento excluído')
ok(resultado[0].r.excluido === true, 'a função relata a exclusão', JSON.stringify(resultado[0].r))

/* ---------------- a gaveta ---------------- */
{
  const gaveta = await numero(`
    select ((select valor_abertura from caixas where id='cx-1')
      + coalesce(sum(case when forma='dinheiro'
                          then valor * (case tipo when 'entrada' then 1 else -1 end)
                          else 0 end),0))::text as v
      from movimentos_caixa where caixa_id='cx-1'`)
  ok(gaveta === 122.5, 'a gaveta voltou ao troco inicial exato', `R$ ${gaveta}`)
}

/* ---------------- estorno SEM excluir ---------------- */
console.log('\n── 3 · estornar sem excluir devolve o agendamento a "confirmado"\n')

await db.exec(`
  insert into agendamentos (id, cliente_id, profissional_id, servico_id, inicio, fim, situacao, preco, desconto, protocolo)
    values ('ag-2','cli-1','prof-1','srv-1', now() + interval '3 hours', now() + interval '4 hours', 'concluido', 80, 0, 'TESTE2');
  insert into lancamentos (id, agendamento_id, cliente_id, tipo, situacao, categoria, descricao, valor, forma, vencimento)
    values ('lan-2','ag-2','cli-1','receita','recebido','Serviços','x',80,'pix',current_date);
`)

await db.query(`select estornar_atendimento('ag-2', false)`)

{
  const { rows } = await db.query<{ situacao: string; finalizado_em: string | null }>(
    `select situacao, finalizado_em from agendamentos where id='ag-2'`,
  )
  ok(rows[0].situacao === 'confirmado', 'voltou para confirmado', rows[0].situacao)
  ok(rows[0].finalizado_em === null, 'a marca de finalização foi limpa')
  ok(await numero(`select count(*)::text as v from lancamentos where agendamento_id='ag-2'`) === 0, 'e a receita saiu junto')
}

/* ---------------- caixa fechado: recusa ---------------- */
console.log('\n── 4 · caixa já fechado: o estorno RECUSA em vez de reescrever\n')

await db.exec(`
  insert into caixas (id, data, situacao, aberto_em, fechado_em, valor_abertura, valor_informado)
    values ('cx-velho', current_date - 1, 'fechado', now() - interval '1 day', now() - interval '20 hours', 100, 300);
  insert into agendamentos (id, cliente_id, profissional_id, servico_id, inicio, fim, situacao, preco, desconto, protocolo)
    values ('ag-3','cli-1','prof-1','srv-1', now() - interval '1 day', now() - interval '23 hours', 'concluido', 200, 0, 'TESTE3');
  insert into movimentos_caixa (id, caixa_id, tipo, forma, descricao, valor, agendamento_id)
    values ('mvc-3','cx-velho','entrada','dinheiro','x',200,'ag-3');
`)

{
  let mensagem = ''
  try {
    await db.query(`select estornar_atendimento('ag-3', true)`)
  } catch (e) {
    mensagem = (e as Error).message
  }
  ok(/ja foi fechado/i.test(mensagem), 'recusa com explicação sobre o caixa fechado', mensagem.split('\n')[0])
  ok(
    await numero(`select count(*)::text as v from agendamentos where id='ag-3'`) === 1,
    'e NADA foi desfeito — a transação inteira voltou atrás',
  )
  ok(
    await numero(`select count(*)::text as v from movimentos_caixa where agendamento_id='ag-3'`) === 1,
    'a entrada do caixa fechado continua intacta',
  )
}

await db.close()

console.log(`\n${'─'.repeat(60)}`)
if (falhas === 0) console.log(`TODOS OS ${testes} TESTES PASSARAM — num Postgres real.`)
else {
  console.log(`${falhas} de ${testes} FALHARAM`)
  process.exit(1)
}
