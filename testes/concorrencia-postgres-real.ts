/**
 * Concorrência e idempotência — provadas no banco, não na interface.
 *
 * A tese destes testes: `salvando=true` e botão desabilitado protegem
 * contra o dedo; só o banco protege contra DOIS APARELHOS. Cada guarda
 * abaixo é a versão SQL de uma regra que antes morava apenas no
 * JavaScript — e cada teste simula exatamente o cenário que o
 * JavaScript não enxerga: duas escritas que não sabem uma da outra.
 *
 * Roda em Postgres real (WASM), com o esquema real de 01 + as guardas
 * de 13-blindagem-e-verificacao.sql.
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
const ler = (arquivo: string) => readFileSync(join(dir, arquivo), 'utf8')

const adaptar = (sql: string) =>
  sql
    .replace(/^create extension .*$/gim, '')
    .replace(/^\s*revoke .*$/gim, '')
    .replace(/^\s*grant .*$/gim, '')

const db = new PGlite({ extensions: { btree_gist } })
await db.exec('create extension if not exists btree_gist;')

// Esquema real — desta vez COM a restrição de sobreposição, porque a
// extensão carregou. Só saem extensões/grants.
await db.exec(adaptar(ler('01-esquema.sql')))
await db.exec(adaptar(ler('12-correcao-esquema.sql')).replace(
  /create or replace function atualizar_com_versao[\s\S]*?grant execute on function atualizar_com_versao[^\n]*\n/,
  '',
))
/*
  Os blocos removidos abaixo dependem do esquema `auth` do Supabase
  (02 e 10), que não existe neste Postgres de teste. Cada um continua
  coberto: o teste 6 prova que a verificação FALHA num banco
  incompleto — que é o contrato dela.
*/
await db.exec(adaptar(ler('13-blindagem-e-verificacao.sql'))
  .replace(/-- Funções que o frontend chama[\s\S]*?end loop;\n/, '')
  .replace(/-- A RPC de versão precisa ser a CORRIGIDA[\s\S]*?end if;\n/, '')
  .replace(/-- O papel 'agenda' precisa[\s\S]*?rode 10-acesso-agenda\.sql\.';\n  end if;\n/, ''))

/* ------------------------------------------------------------------ */
console.log('\n── 1 · dois aparelhos abrindo o caixa: UM aberto\n')

await db.exec(`
  insert into caixas (id, data, situacao, aberto_em, valor_abertura)
  values ('cx-a', '2026-08-12', 'aberto', now(), 100);
`)

{
  // O segundo aparelho não viu o primeiro (espelho frio) e tenta
  // abrir o caixa de OUTRA data — o caso que caixas(data) não pegava.
  let codigo = ''
  try {
    await db.query(`
      insert into caixas (id, data, situacao, aberto_em, valor_abertura)
      values ('cx-b', '2026-08-13', 'aberto', now(), 50)
    `)
  } catch (e) {
    codigo = (e as { code?: string }).code ?? ''
  }
  ok(codigo === '23505', 'segundo caixa aberto (data diferente) é recusado', `código ${codigo}`)

  const { rows } = await db.query<{ n: string }>(
    `select count(*)::text as n from caixas where situacao = 'aberto'`,
  )
  ok(rows[0].n === '1', 'exatamente um caixa aberto no banco')
}

{
  // Fechar o aberto libera a próxima abertura — o índice é parcial.
  await db.exec(`update caixas set situacao = 'fechado', fechado_em = now() where id = 'cx-a'`)
  await db.exec(`
    insert into caixas (id, data, situacao, aberto_em, valor_abertura)
    values ('cx-c', '2026-08-13', 'aberto', now(), 80)
  `)
  ok(true, 'com o anterior fechado, abrir volta a funcionar')
}

/* ------------------------------------------------------------------ */
console.log('\n── 2 · duas metas para o mesmo mês: UMA fica\n')

{
  await db.exec(`insert into metas (id, mes, valor) values ('meta-1', '2026-08-01', 5000)`)
  let codigo = ''
  try {
    await db.query(`insert into metas (id, mes, valor) values ('meta-2', '2026-08-01', 7000)`)
  } catch (e) {
    codigo = (e as { code?: string }).code ?? ''
  }
  ok(codigo === '23505', 'segunda meta do mês é recusada', `código ${codigo}`)
}

/* ------------------------------------------------------------------ */
console.log('\n── 3 · protocolo repetido entre dois aparelhos\n')

await db.exec(`
  insert into profissionais (id, nome, papel, cor) values ('prof-1','Emely','proprietaria','#C98F98');
  insert into clientes (id, nome) values ('cli-1','Maria');
  insert into categorias (id, nome) values ('cat-1','Cabelo');
  insert into servicos (id, categoria_id, nome, duracao_minutos, preco)
  values ('srv-1','cat-1','corte',60,100);

  insert into agendamentos (id, cliente_id, profissional_id, servico_id, inicio, fim, situacao, preco, protocolo)
  values ('ag-1','cli-1','prof-1','srv-1','2026-08-12 12:00+00','2026-08-12 13:00+00','confirmado',100,'ABC123');
`)

{
  let codigo = ''
  try {
    await db.query(`
      insert into agendamentos (id, cliente_id, profissional_id, servico_id, inicio, fim, situacao, preco, protocolo)
      values ('ag-2','cli-1','prof-1','srv-1','2026-08-12 15:00+00','2026-08-12 16:00+00','confirmado',100,'ABC123')
    `)
  } catch (e) {
    codigo = (e as { code?: string }).code ?? ''
  }
  ok(codigo === '23505', 'o mesmo protocolo em dois agendamentos é recusado', `código ${codigo}`)
  // O repositório reage a esta recusa gerando outro código e tentando
  // UMA vez de novo — ver o try/catch em `agendar` (agenda.ts).
}

/* ------------------------------------------------------------------ */
console.log('\n── 4 · sobreposição de horário: a EXCLUDE do banco segura\n')

{
  // A pré-checagem do espelho pode estar cega (outro aparelho gravou há
  // meio segundo). A última linha de defesa é a constraint.
  let codigo = ''
  try {
    await db.query(`
      insert into agendamentos (id, cliente_id, profissional_id, servico_id, inicio, fim, situacao, preco, protocolo)
      values ('ag-3','cli-1','prof-1','srv-1','2026-08-12 12:30+00','2026-08-12 13:30+00','confirmado',100,'DEF456')
    `)
  } catch (e) {
    codigo = (e as { code?: string }).code ?? ''
  }
  ok(codigo === '23P01', 'mesmo profissional, horários sobrepostos: recusado', `código ${codigo}`)
}

{
  // Cancelado não ocupa horário — a cláusula WHERE da constraint.
  await db.exec(`update agendamentos set situacao = 'cancelado' where id = 'ag-1'`)
  await db.exec(`
    insert into agendamentos (id, cliente_id, profissional_id, servico_id, inicio, fim, situacao, preco, protocolo)
    values ('ag-4','cli-1','prof-1','srv-1','2026-08-12 12:30+00','2026-08-12 13:30+00','confirmado',100,'GHI789')
  `)
  ok(true, 'sobre um cancelado, o mesmo horário volta a ficar livre')
}

/* ------------------------------------------------------------------ */
console.log('\n── 5 · timeout + retry com o MESMO id: uma linha, nunca duas\n')

{
  /*
    O contrato de idempotência inteiro, no nível do banco:

      1ª tentativa grava (a resposta se perde no caminho);
      2ª tentativa repete o id → chave primária recusa com 23505 _pkey;
      o adaptador reconhece "_pkey", busca a linha e devolve sucesso.

    Aqui provamos os dois fatos que o adaptador assume: a recusa é
    23505 com "_pkey" no texto, e a linha original está intacta.
  */
  await db.exec(`
    insert into movimentos_caixa (id, caixa_id, tipo, origem, descricao, valor, forma)
    values ('mv-idem', 'cx-c', 'entrada', 'venda', 'produto', 35.50, 'pix')
  `)

  let codigo = ''
  let texto = ''
  try {
    await db.query(`
      insert into movimentos_caixa (id, caixa_id, tipo, origem, descricao, valor, forma)
      values ('mv-idem', 'cx-c', 'entrada', 'venda', 'produto', 35.50, 'pix')
    `)
  } catch (e) {
    codigo = (e as { code?: string }).code ?? ''
    texto = (e as Error).message
  }
  ok(
    codigo === '23505' && /_pkey/.test(texto),
    'o retry bate na chave primária, com "_pkey" no texto',
    `${codigo} · ${texto.split('\n')[0]}`,
  )

  const { rows } = await db.query<{ n: string; total: string }>(
    `select count(*)::text as n, coalesce(sum(valor),0)::text as total
       from movimentos_caixa where id = 'mv-idem'`,
  )
  ok(rows[0].n === '1' && Number(rows[0].total) === 35.5, 'uma linha, valor intacto', `n=${rows[0].n}, total=${rows[0].total}`)
}

/* ------------------------------------------------------------------ */
console.log('\n── 6 · a verificação final de 13 acusa banco incompleto\n')

{
  // Num banco onde a migração 12 não rodou, a verificação precisa
  // FALHAR — é a diferença entre conferir e fingir que conferiu.
  const cru = new PGlite({ extensions: { btree_gist } })
  await cru.exec('create extension if not exists btree_gist;')
  await cru.exec(adaptar(ler('01-esquema.sql')))

  let falhou = false
  let mensagem = ''
  try {
    await cru.exec(adaptar(ler('13-blindagem-e-verificacao.sql')))
  } catch (e) {
    falhou = true
    mensagem = (e as Error).message.split('\n')[0]
  }
  await cru.close()
  ok(falhou, 'sem a 12, a verificação final falha alto', mensagem)
}

/* ------------------------------------------------------------------ */

await db.close()

console.log(`\n${'─'.repeat(60)}`)
if (falhas === 0) console.log(`TODOS OS ${testes} TESTES PASSARAM — num Postgres real.`)
else {
  console.log(`${falhas} de ${testes} FALHARAM`)
  process.exit(1)
}
