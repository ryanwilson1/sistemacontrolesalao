/**
 * A RPC `atualizar_com_versao` contra um Postgres DE VERDADE.
 *
 * ---------------------------------------------------------------
 * Por que este teste existe — e por que ele roda Postgres
 * ---------------------------------------------------------------
 * A segunda auditoria encontrou um defeito que nenhum teste em memória
 * poderia pegar: a RPC montava `set preco = $1->>'preco'`, e `->>`
 * devolve TEXT. O Postgres não tem cast de atribuição de text para
 * numeric/boolean/timestamptz/date — TODA edição de coluna não-texto
 * nas oito tabelas versionadas falhava com 42804. Remarcar horário,
 * mudar preço, arquivar cliente: quebrados.
 *
 * Só campos de texto passavam, então o defeito parecia intermitente —
 * a pior categoria de bug para diagnosticar por relato.
 *
 * Este arquivo sobe um Postgres em WASM (@electric-sql/pglite), cria o
 * pedaço relevante do esquema, instala AS DUAS versões da função — a
 * original de `09-concorrencia.sql` e a corrigida de
 * `12-correcao-esquema.sql` — e prova:
 *
 *   1. que a original falha exatamente como diagnosticado;
 *   2. que a corrigida grava cada tipo certo;
 *   3. que a trava de versão continua funcionando nela.
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

const db = new PGlite()

/* ------------------------------------------------------------------ */
/* Esquema mínimo: a tabela clientes real + os apoios da RPC           */
/* ------------------------------------------------------------------ */

await db.exec(`
  create table clientes (
    id             text primary key,
    criado_em      timestamptz not null default now(),
    atualizado_em  timestamptz not null default now(),
    nome           text not null,
    telefone       text,
    nascimento     date,
    observacoes    text,
    aceita_contato boolean not null default true,
    ativo          boolean not null default true,
    versao         integer not null default 1
  );

  -- As funções de permissão que a RPC consulta. Aqui sempre "sim":
  -- o que está em teste é o cast, não o RLS.
  create function equipe_autorizada() returns boolean language sql as 'select true';
  create function acesso_so_agenda() returns boolean language sql as 'select false';

  insert into clientes (id, nome, telefone, ativo, versao)
  values ('cli-1', 'Maria', '11999990000', true, 1);
`)

/* ------------------------------------------------------------------ */
/* As duas versões da função, extraídas dos arquivos reais             */
/* ------------------------------------------------------------------ */

const dir = join(import.meta.dirname, '..', 'supabase')

function extrairFuncao(arquivo: string): string {
  const sql = readFileSync(join(dir, arquivo), 'utf8')
  const inicio = sql.indexOf('create or replace function atualizar_com_versao')
  if (inicio === -1) throw new Error(`função não encontrada em ${arquivo}`)
  const fim = sql.indexOf('end $fn$;', inicio)
  if (fim === -1) throw new Error(`fim da função não encontrado em ${arquivo}`)
  return sql.slice(inicio, fim + 'end $fn$;'.length)
}

const versaoOriginal = extrairFuncao('09-concorrencia.sql')
const versaoCorrigida = extrairFuncao('12-correcao-esquema.sql')

/* ------------------------------------------------------------------ */
console.log('\n── 1 · a versão ORIGINAL falha como diagnosticado\n')

await db.exec(versaoOriginal)

{
  // Campo de texto passa — é o que fazia o defeito parecer intermitente.
  const { rows } = await db.query(
    `select atualizar_com_versao('clientes','cli-1','{"observacoes":"cliente antiga"}'::jsonb, 1) as r`,
  )
  ok(rows.length === 1, 'edição só-texto passa na original', 'por isso parecia intermitente')
}

{
  let mensagem = ''
  try {
    await db.query(
      `select atualizar_com_versao('clientes','cli-1','{"ativo":"false"}'::jsonb, null)`,
    )
  } catch (e) {
    mensagem = (e as Error).message
  }
  ok(
    /type boolean.*type text|42804/i.test(mensagem),
    'arquivar (ativo=false) QUEBRA na original',
    mensagem.split('\n')[0],
  )
}

{
  let mensagem = ''
  try {
    await db.query(
      `select atualizar_com_versao('clientes','cli-1','{"nascimento":"1990-05-10"}'::jsonb, null)`,
    )
  } catch (e) {
    mensagem = (e as Error).message
  }
  ok(
    /type date.*type text|42804/i.test(mensagem),
    'data de nascimento QUEBRA na original',
    mensagem.split('\n')[0],
  )
}

/* ------------------------------------------------------------------ */
console.log('\n── 2 · a versão CORRIGIDA grava cada tipo certo\n')

await db.exec(versaoCorrigida)

{
  const { rows } = await db.query<{ r: { ativo: boolean; versao: number } }>(
    `select atualizar_com_versao('clientes','cli-1','{"ativo":false,"atualizado_em":"2026-08-12T10:00:00Z"}'::jsonb, null) as r`,
  )
  ok(rows[0].r.ativo === false, 'boolean gravado como boolean', `ativo=${rows[0].r.ativo}`)
}

{
  const { rows } = await db.query<{ r: { nascimento: string } }>(
    `select atualizar_com_versao('clientes','cli-1','{"nascimento":"1990-05-10"}'::jsonb, null) as r`,
  )
  ok(String(rows[0].r.nascimento).startsWith('1990-05-10'), 'date gravado como date')
}

{
  // Mistura de tipos numa chamada só — o caso real do formulário.
  const { rows } = await db.query<{ r: { nome: string; ativo: boolean } }>(
    `select atualizar_com_versao('clientes','cli-1',
       '{"nome":"Maria Silva","ativo":true,"telefone":"11888887777"}'::jsonb, null) as r`,
  )
  ok(
    rows[0].r.nome === 'Maria Silva' && rows[0].r.ativo === true,
    'texto + boolean na mesma edição',
  )
}

{
  const { rows } = await db.query<{ ativo: boolean; telefone: string }>(
    `select ativo, telefone from clientes where id = 'cli-1'`,
  )
  ok(
    rows[0].ativo === true && rows[0].telefone === '11888887777',
    'o banco confirma a persistência (não só o retorno da função)',
  )
}

/* ------------------------------------------------------------------ */
console.log('\n── 3 · a trava de versão sobreviveu à correção\n')

{
  // A versão atual no banco avançou? O gatilho de versão não existe
  // neste esquema mínimo, então ela continua 1 — e é exatamente o que
  // a trava precisa para o teste: declarar a versão errada tem de falhar.
  let mensagem = ''
  try {
    await db.query(
      `select atualizar_com_versao('clientes','cli-1','{"nome":"X"}'::jsonb, 99)`,
    )
  } catch (e) {
    mensagem = (e as Error).message
  }
  ok(
    /alterado em outro dispositivo/i.test(mensagem),
    'versão errada é recusada com a mensagem de conflito',
  )
}

{
  let mensagem = ''
  try {
    await db.query(
      `select atualizar_com_versao('lancamentos_falsa','cli-1','{"nome":"X"}'::jsonb, null)`,
    )
  } catch (e) {
    mensagem = (e as Error).message
  }
  ok(/nao permitida/i.test(mensagem), 'a whitelist de tabelas continua de pé')
}

{
  let mensagem = ''
  try {
    await db.query(
      `select atualizar_com_versao('clientes','cli-1','{"versao":999,"id":"outro"}'::jsonb, null)`,
    )
  } catch (e) {
    mensagem = (e as Error).message
  }
  ok(
    /nenhuma alteracao/i.test(mensagem),
    '`versao` e `id` continuam sendo descartados do delta',
  )
}

/* ------------------------------------------------------------------ */

await db.close()

console.log(`\n${'─'.repeat(60)}`)
if (falhas === 0) console.log(`TODOS OS ${testes} TESTES PASSARAM — num Postgres real.`)
else {
  console.log(`${falhas} de ${testes} FALHARAM`)
  process.exit(1)
}
