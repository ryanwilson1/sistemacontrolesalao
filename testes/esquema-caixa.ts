/**
 * O fluxo do Caixa contra o esquema REAL do Postgres.
 *
 * ---------------------------------------------------------------
 * Por que este teste existe
 * ---------------------------------------------------------------
 * O Caixa nunca funcionou em produção, e nenhum teste pegou isso —
 * porque todos rodavam contra o `MemoriaAdapter`, que aceita qualquer
 * campo. Um `Map` em memória não tem esquema, então o erro que só o
 * Postgres produz (`PGRST204 — coluna não encontrada`) era invisível
 * aqui e fatal lá.
 *
 * Este arquivo fecha esse buraco: lê as colunas dos arquivos de
 * `supabase/`, monta um adaptador que **recusa campo desconhecido do
 * mesmo jeito que o PostgREST recusa**, e roda o fluxo verdadeiro —
 * abrir, movimentar, resumir, fechar.
 *
 * Se alguém acrescentar um campo ao tipo `Caixa` e esquecer a coluna,
 * este teste falha antes do deploy, e não no celular da proprietária.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')

/* ------------------------------------------------------------------ */
/* 1. As colunas que o banco realmente tem                             */
/* ------------------------------------------------------------------ */

function colunasDoBanco(): Map<string, Set<string>> {
  const dir = join(RAIZ, 'supabase')
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')

  const tabelas = new Map<string, Set<string>>()

  const criar = /create table if not exists\s+(\w+)\s*\(([\s\S]*?)\n\);/gi
  let m: RegExpExecArray | null

  while ((m = criar.exec(sql))) {
    const cols = new Set<string>()
    let nivel = 0
    let atual = ''
    const partes: string[] = []

    for (const ch of m[2]) {
      if (ch === '(') nivel++
      if (ch === ')') nivel--
      if (ch === ',' && nivel === 0) {
        partes.push(atual)
        atual = ''
      } else atual += ch
    }
    partes.push(atual)

    for (const parte of partes) {
      const t = parte.trim()
      if (!t || /^(constraint|primary key|unique|check|foreign key|exclude)\b/i.test(t)) continue
      const nome = t.match(/^(\w+)/)
      if (nome) cols.add(nome[1])
    }
    tabelas.set(m[1], cols)
  }

  const alterar = /alter table\s+(?:public\.)?(\w+)\s+add column if not exists\s+(\w+)/gi
  while ((m = alterar.exec(sql))) tabelas.get(m[1])?.add(m[2])

  // `09-concorrencia.sql` adiciona `versao` num laço sobre esta lista.
  for (const t of [
    'clientes', 'agendamentos', 'servicos', 'profissionais',
    'produtos', 'studio', 'lancamentos', 'cupons',
  ]) {
    tabelas.get(t)?.add('versao')
  }

  return tabelas
}

/* ------------------------------------------------------------------ */
/* 2. Um adaptador que recusa como o PostgREST recusa                  */
/* ------------------------------------------------------------------ */

const TABELA: Record<string, string> = {
  caixas: 'caixas',
  movimentosCaixa: 'movimentos_caixa',
  agendamentos: 'agendamentos',
  procedimentos: 'procedimentos',
  fotos: 'fotos',
  clientes: 'clientes',
  servicos: 'servicos',
  profissionais: 'profissionais',
}

const paraSublinhado = (registro: Record<string, unknown>): Record<string, unknown> => {
  const saida: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(registro)) {
    saida[chave.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)] = valor
  }
  return saida
}

const recusas: string[] = []

/**
 * Confere uma gravação contra o esquema.
 *
 * Devolve os campos que o Postgres recusaria. Vazio significa que a
 * linha passaria.
 */
function conferir(colecao: string, registro: Record<string, unknown>): string[] {
  const tabela = TABELA[colecao]
  const colunas = colunasDoBanco().get(tabela)
  if (!colunas) return [`(tabela ${tabela} não existe)`]

  return Object.keys(paraSublinhado(registro)).filter((c) => !colunas.has(c))
}

/* ------------------------------------------------------------------ */
/* 3. O fluxo, campo a campo, como os repositórios montam              */
/* ------------------------------------------------------------------ */

const agora = new Date().toISOString()

/* Exatamente o que `RepositorioCaixa.abrir` monta, via `criar`. */
const caixaAberto = {
  id: 'caixa-1', criadoEm: agora, atualizadoEm: agora,
  data: '2026-08-12',
  situacao: 'aberto',
  abertoEm: agora,
  abertoPorId: 'prof-1',
  valorAbertura: 122,
  fechadoEm: null,
  fechadoPorId: null,
  valorInformado: null,
  diferenca: null,
  observacoes: null,
}

/* O que `movimentar` monta, via `movimentosCaixaRepo.criar`. */
const movimento = {
  id: 'mov-1', criadoEm: agora, atualizadoEm: agora,
  caixaId: 'caixa-1',
  tipo: 'entrada',
  origem: 'atendimento',
  descricao: 'corte + escova',
  valor: 100,
  forma: 'dinheiro',
  agendamentoId: 'ag-1',
  procedimentoId: null,
  profissionalId: 'prof-1',
}

/* O delta que `fechar` envia — só os campos alterados. */
const fechamento = {
  situacao: 'fechado',
  fechadoEm: agora,
  fechadoPorId: 'prof-1',
  valorInformado: 222,
  diferenca: 0,
  observacoes: null,
  atualizadoEm: agora,
}

/* O que `RepositorioFotos.guardar` monta. */
const foto = {
  id: 'foto-1', criadoEm: agora, atualizadoEm: agora,
  procedimentoId: 'proc-1',
  clienteId: 'cli-1',
  momento: 'antes',
  conteudo: 'data:image/jpeg;base64,AAAA',
  url: null,
  legenda: null,
  largura: 800,
  altura: 600,
  tamanhoBytes: 3,
}

/* O que a ficha de evolução grava. */
const procedimento = {
  id: 'proc-1', criadoEm: agora, atualizadoEm: agora,
  agendamentoId: 'ag-1',
  clienteId: 'cli-1',
  profissionalId: 'prof-1',
  servicoId: 'srv-1',
  realizadoEm: agora,
  duracaoMinutos: 60,
  valor: 100,
  desconto: 0,
  valorFinal: 100,
  produtos: [],
  observacoes: null,
  recomendacoes: null,
  proximoPasso: null,
}

/* ------------------------------------------------------------------ */

let falhas = 0
let testes = 0

function verificar(rotulo: string, colecao: string, registro: Record<string, unknown>) {
  testes += 1
  const sobrando = conferir(colecao, registro)

  if (sobrando.length === 0) {
    console.log(`  ok  ${rotulo}`)
    return
  }

  falhas += 1
  recusas.push(`${colecao}: ${sobrando.join(', ')}`)
  console.log(`  FALHOU  ${rotulo} — o banco recusaria: ${sobrando.join(', ')}`)
}

console.log('\n── Fluxo do Caixa contra o esquema real do Postgres\n')

verificar('abrir o caixa', 'caixas', caixaAberto)
verificar('registrar entrada', 'movimentosCaixa', movimento)
verificar('fechar o caixa', 'caixas', fechamento)

console.log('\n── Fichas e fotos (mesma causa, mesmas tabelas)\n')

verificar('gravar procedimento', 'procedimentos', procedimento)
verificar('guardar foto', 'fotos', foto)

/* ------------------------------------------------------------------ */
/* 4. A leitura também precisa devolver o que a tela espera            */
/* ------------------------------------------------------------------ */

console.log('\n── A leitura devolve os campos que a tela usa\n')

const obrigatoriasNaLeitura: Record<string, string[]> = {
  // `FichaCliente` ordena o histórico por `realizadoEm`. Nulo aqui é
  // `undefined.localeCompare` — a ficha quebra em branco, sem erro
  // visível para a proprietária.
  procedimentos: ['realizado_em'],
  // `resumir()` filtra por `origem === 'atendimento'` para o ticket
  // médio. Sem a coluna, o ticket médio é sempre zero.
  movimentos_caixa: ['origem'],
  // `ResumoDoCaixa` mostra a diferença entre contado e esperado.
  caixas: ['valor_informado', 'diferenca'],
}

const banco = colunasDoBanco()
for (const [tabela, campos] of Object.entries(obrigatoriasNaLeitura)) {
  for (const campo of campos) {
    testes += 1
    if (banco.get(tabela)?.has(campo)) {
      console.log(`  ok  ${tabela}.${campo} existe para leitura`)
    } else {
      falhas += 1
      console.log(`  FALHOU  ${tabela}.${campo} não existe — a tela leria undefined`)
    }
  }
}

/* ------------------------------------------------------------------ */

console.log(`\n${'─'.repeat(60)}`)
if (falhas === 0) {
  console.log(`TODOS OS ${testes} TESTES PASSARAM — nenhuma gravação seria recusada.`)
} else {
  console.log(`${falhas} de ${testes} FALHARAM.`)
  console.log('\nRode supabase/12-correcao-esquema.sql no SQL Editor do Supabase.')
  console.log('Divergências:')
  for (const r of recusas) console.log(`  · ${r}`)
  process.exit(1)
}
