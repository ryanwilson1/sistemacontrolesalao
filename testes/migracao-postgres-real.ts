/**
 * A migração 12 executada de ponta a ponta num Postgres real.
 *
 * Este é o teste que faltava para a afirmação mais importante do
 * relatório: "rode 12-correcao-esquema.sql e o Caixa funciona". Até
 * aqui ela se apoiava em análise estática; aqui ela roda de verdade:
 *
 *   1. sobe o esquema REAL de `01-esquema.sql` (Postgres em WASM);
 *   2. semeia dados como a produção os tem HOJE — caixa nas colunas
 *      antigas, ficha gravada pela RPC com `data`/`formula`,
 *      movimento sem `origem`;
 *   3. executa `12-correcao-esquema.sql` INTEIRO;
 *   4. confere o backfill, o gatilho e as gravações no formato que o
 *      frontend envia;
 *   5. executa a migração DE NOVO, para provar a idempotência;
 *   6. remarca um agendamento pela RPC corrigida — timestamptz e
 *      numeric na mesma chamada, o caso que quebrava.
 *
 * O que fica de fora, e por quê: extensões (btree_gist), RLS/policies
 * (dependem do esquema `auth` do Supabase) e Realtime. São removidos
 * do SQL antes de rodar — o teste cobre ESTRUTURA e DADOS, não
 * permissão. A permissão continua sendo validada no projeto real.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

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
const ler = (arquivo: string) => readFileSync(join(dir, arquivo), 'utf8')

/** Tira do SQL o que não existe fora do Supabase. */
function adaptarParaTeste(sql: string): string {
  return (
    sql
      // Extensões: gen_random_uuid é nativo desde o PG 13.
      .replace(/^create extension .*$/gim, '')
      // A restrição de sobreposição exige btree_gist.
      .replace(
        /alter table agendamentos drop constraint if exists agendamento_sem_sobreposicao;[\s\S]*?\)\);/,
        '',
      )
      // Papéis do Supabase não existem aqui; os grants são recriados
      // no projeto real ao rodar o arquivo original.
      .replace(/^\s*revoke .*$/gim, '')
      .replace(/^\s*grant .*$/gim, '')
  )
}

const db = new PGlite()

/* ------------------------------------------------------------------ */
console.log('\n── 0 · o esquema real de 01-esquema.sql sobe limpo\n')

await db.exec(adaptarParaTeste(ler('01-esquema.sql')))
ok(true, '01-esquema.sql executou sem erro')

// Apoios que a seção 7 da migração consulta (moram no 02, que depende
// do esquema `auth` do Supabase — aqui viram stubs permissivos).
// A coluna `versao` vem do 09-concorrencia.sql, que depende dos mesmos
// papéis do Supabase; aqui entra só o pedaço estrutural que a RPC usa.
await db.exec(`
  create or replace function equipe_autorizada() returns boolean language sql as 'select true';
  create or replace function acesso_so_agenda() returns boolean language sql as 'select false';

  alter table clientes      add column if not exists versao integer not null default 1;
  alter table agendamentos  add column if not exists versao integer not null default 1;
  alter table servicos      add column if not exists versao integer not null default 1;
`)

/* ------------------------------------------------------------------ */
console.log('\n── 1 · dados como a produção tem HOJE (colunas antigas)\n')

await db.exec(`
  insert into profissionais (id, nome, papel, cor)
  values ('prof-1', 'Emely', 'proprietaria', '#C98F98');

  insert into clientes (id, nome, telefone)
  values ('cli-1', 'Daila Freitas', '11973712707');

  insert into categorias (id, nome) values ('cat-1', 'Cabelo');

  insert into servicos (id, categoria_id, nome, duracao_minutos, preco)
  values ('srv-1', 'cat-1', 'corte + escova', 60, 100);

  insert into agendamentos (
    id, cliente_id, profissional_id, servico_id,
    inicio, fim, situacao, preco, protocolo
  ) values (
    'ag-1', 'cli-1', 'prof-1', 'srv-1',
    '2026-08-12 12:30:00+00', '2026-08-12 13:30:00+00',
    'concluido', 100, 'PROTO-1'
  );

  -- O caixa que a produção teria SE a abertura tivesse funcionado por
  -- fora do sistema (colunas antigas): é o pior caso para o backfill.
  insert into caixas (id, data, aberto_em, valor_abertura, situacao,
                      valor_fechamento, responsavel, observacao)
  values ('cx-legado', '2026-08-10', '2026-08-10 11:00:00+00', 50,
          'fechado', 172.50, 'prof-1', 'primeiro dia');

  -- Movimento gravado pela RPC concluir_atendimento: sem origem.
  insert into movimentos_caixa (id, caixa_id, tipo, forma, descricao, valor, agendamento_id)
  values ('mv-legado', 'cx-legado', 'entrada', 'dinheiro', 'corte + escova', 100, 'ag-1');

  -- Ficha gravada pela mesma RPC: data e formula, sem realizado_em.
  insert into procedimentos (id, cliente_id, agendamento_id, servico_id,
                             profissional_id, data, formula, produtos)
  values ('proc-legado', 'cli-1', 'ag-1', 'srv-1', 'prof-1',
          '2026-08-12 12:30:00+00', 'progressiva 2:1', '[]'::jsonb);

  insert into fotos (id, cliente_id, procedimento_id, momento, conteudo)
  values ('foto-legada', 'cli-1', 'proc-legado', 'antes', 'base64aaaa');
`)
ok(true, 'dados legados semeados (caixa antigo, ficha da RPC, movimento sem origem)')

/* ------------------------------------------------------------------ */
console.log('\n── 2 · 12-correcao-esquema.sql executa INTEIRO\n')

await db.exec(adaptarParaTeste(ler('12-correcao-esquema.sql')))
ok(true, 'a migração rodou sem erro — o bloco final de conferência não lançou')

/* ------------------------------------------------------------------ */
console.log('\n── 3 · o backfill preservou o passado\n')

{
  const { rows } = await db.query<{
    valor_informado: string
    observacoes: string
    aberto_por_id: string
  }>(`select valor_informado, observacoes, aberto_por_id from caixas where id = 'cx-legado'`)

  ok(Number(rows[0].valor_informado) === 172.5, 'valor_fechamento → valor_informado', rows[0].valor_informado)
  ok(rows[0].observacoes === 'primeiro dia', 'observacao → observacoes')
  ok(rows[0].aberto_por_id === 'prof-1', 'responsavel que casa com profissional vira aberto_por_id')
}

{
  const { rows } = await db.query<{ origem: string }>(
    `select origem from movimentos_caixa where id = 'mv-legado'`,
  )
  ok(rows[0].origem === 'atendimento', 'movimento da RPC ganhou origem=atendimento')
}

{
  const { rows } = await db.query<{
    realizado_em: string
    valor_final: string
    duracao_minutos: number
    recomendacoes: string
  }>(`select realizado_em, valor_final, duracao_minutos, recomendacoes
        from procedimentos where id = 'proc-legado'`)

  ok(rows[0].realizado_em !== null, 'ficha legada ganhou realizado_em', String(rows[0].realizado_em))
  ok(Number(rows[0].valor_final) === 100, 'valor_final veio do agendamento')
  ok(rows[0].duracao_minutos === 60, 'duração calculada do agendamento')
  ok(rows[0].recomendacoes === 'progressiva 2:1', 'formula → recomendacoes')
}

/* ------------------------------------------------------------------ */
console.log('\n── 4 · o fluxo do Caixa NO FORMATO DO FRONTEND grava e lê\n')

await db.exec(`
  insert into caixas (id, data, situacao, aberto_em, aberto_por_id,
                      valor_abertura, observacoes)
  values ('cx-novo', '2026-08-12', 'aberto', now(), 'prof-1', 122.00, null);

  insert into movimentos_caixa (id, caixa_id, tipo, origem, descricao,
                                valor, forma, agendamento_id,
                                procedimento_id, profissional_id)
  values ('mv-1', 'cx-novo', 'entrada', 'atendimento', 'corte', 100.00,
          'dinheiro', null, null, 'prof-1'),
         ('mv-2', 'cx-novo', 'entrada', 'venda', 'produto', 35.50,
          'pix', null, null, 'prof-1'),
         ('mv-3', 'cx-novo', 'saida', 'sangria', 'troco banco', 20.00,
          'dinheiro', null, null, 'prof-1');
`)

{
  // A conferência matemática do item 13 do briefing, no banco:
  // gaveta = abertura + entradas em dinheiro − saídas em dinheiro.
  const { rows } = await db.query<{ gaveta: string }>(`
    select (select valor_abertura from caixas where id = 'cx-novo')
         + coalesce(sum(case when forma = 'dinheiro'
                             then valor * (case tipo when 'entrada' then 1 else -1 end)
                             else 0 end), 0) as gaveta
      from movimentos_caixa where caixa_id = 'cx-novo'
  `)
  ok(Number(rows[0].gaveta) === 202, 'gaveta = 122 + 100 − 20 = 202 (pix fora, como o resumo calcula)', rows[0].gaveta)
}

{
  // O fechamento como o frontend envia (delta do atualizar).
  await db.exec(`
    update caixas set situacao = 'fechado', fechado_em = now(),
           fechado_por_id = 'prof-1', valor_informado = 202.00,
           diferenca = 0.00, atualizado_em = now()
     where id = 'cx-novo'
  `)
  const { rows } = await db.query<{ situacao: string; diferenca: string }>(
    `select situacao, diferenca from caixas where id = 'cx-novo'`,
  )
  ok(rows[0].situacao === 'fechado' && Number(rows[0].diferenca) === 0, 'fechamento persiste')
}

{
  // Um insert NO ESTILO DA RPC (colunas antigas) depois da migração:
  // o gatilho tem de completar as novas — é o futuro que não pode
  // voltar a quebrar.
  await db.exec(`
    insert into movimentos_caixa (id, caixa_id, tipo, forma, descricao, valor, agendamento_id)
    values ('mv-rpc', 'cx-novo', 'entrada', 'cartao', 'progressiva', 250, 'ag-1');
  `)
  const { rows } = await db.query<{ origem: string }>(
    `select origem from movimentos_caixa where id = 'mv-rpc'`,
  )
  ok(rows[0].origem === 'atendimento', 'gatilho preenche origem para inserts da RPC')
}

/* ------------------------------------------------------------------ */
console.log('\n── 5 · rodar a migração DE NOVO não muda nada (idempotência)\n')

const antes = await db.query<{ n: string }>(
  `select count(*)::text as n from movimentos_caixa`,
)
await db.exec(adaptarParaTeste(ler('12-correcao-esquema.sql')))
const depois = await db.query<{ n: string }>(
  `select count(*)::text as n from movimentos_caixa`,
)
ok(antes.rows[0].n === depois.rows[0].n, 'segunda execução: mesmos dados, nenhum erro')

{
  const { rows } = await db.query<{ valor_informado: string }>(
    `select valor_informado from caixas where id = 'cx-legado'`,
  )
  ok(Number(rows[0].valor_informado) === 172.5, 'o backfill não sobrescreveu na segunda passada')
}

/* ------------------------------------------------------------------ */
console.log('\n── 6 · remarcar pela RPC corrigida: timestamptz + numeric juntos\n')

{
  const { rows } = await db.query<{ r: { inicio: string; preco: string } }>(`
    select atualizar_com_versao('agendamentos', 'ag-1',
      '{"inicio":"2026-08-13T14:00:00Z","fim":"2026-08-13T15:00:00Z","preco":150,"atualizado_em":"2026-08-12T10:00:00Z"}'::jsonb,
      null) as r
  `)
  ok(
    String(rows[0].r.inicio).includes('2026-08-13') && Number(rows[0].r.preco) === 150,
    'remarcação grava instante e preço com os tipos certos',
  )
}

{
  // `::text` porque o driver devolve Date — e Date.toString() imprime
  // no fuso local, onde '2026-08-13' vira 'Aug 13 2026'.
  const { rows } = await db.query<{ inicio: string; preco: string }>(
    `select inicio::text as inicio, preco from agendamentos where id = 'ag-1'`,
  )
  ok(
    String(rows[0].inicio).includes('2026-08-13') && Number(rows[0].preco) === 150,
    'e o banco confirma a remarcação persistida',
  )
}

/* ------------------------------------------------------------------ */

await db.close()

console.log(`\n${'─'.repeat(60)}`)
if (falhas === 0) console.log(`TODOS OS ${testes} TESTES PASSARAM — migração validada num Postgres real.`)
else {
  console.log(`${falhas} de ${testes} FALHARAM`)
  process.exit(1)
}
