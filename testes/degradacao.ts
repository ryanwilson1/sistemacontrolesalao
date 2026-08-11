/**
 * Degradação com o uso — testes de acúmulo.
 *
 * Cada bloco reproduz uma jornada real da proprietária e mede se algo
 * cresce sem parar. Não medem velocidade (isso exige navegador); medem
 * a causa da lentidão relatada: estrutura que só engorda.
 *
 * Todos falham no código anterior e passam no corrigido.
 */

import { cache, CHAVES_POR_COLECAO, AFETADOS_POR_AGENDAMENTO } from '../src/hooks/dados/cache'

let falhas = 0
let total = 0

const grupo = (nome: string) => console.log(`\n── ${nome}`)

function ok(descricao: string, condicao: boolean, detalhe = '') {
  total++
  if (condicao) console.log(`  ok  ${descricao}${detalhe ? ` — ${detalhe}` : ''}`)
  else {
    falhas++
    console.log(` FALHA ${descricao}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

/** Quantas entradas o cache guarda agora. */
function tamanhoDoCache(): number {
  let n = 0
  // Sem API de tamanho de propósito: o cache não deveria expor isso à
  // aplicação. Aqui contamos pela porta da frente, chave por chave.
  for (let i = 0; i < 5000; i++) {
    if (cache.ler(`agenda:dia-${i}`) !== undefined) n++
  }
  return n
}

/* ==================================================================
   1 · Um dia inteiro trocando de data
   ==================================================================
   A agenda usa o período na chave: `agenda:2026-08-11...`. Cada dia
   visitado criava uma entrada permanente, guardando a lista completa
   de agendamentos daquele dia. Nada as removia.
   ================================================================== */
grupo('1 · navegar entre datas não engorda para sempre')

cache.limpar()

// 600 dias visitados — menos do que parece: são duas semanas passando
// dia a dia, ida e volta, várias vezes.
for (let i = 0; i < 600; i++) {
  cache.gravar(`agenda:dia-${i}`, [{ id: i, cliente: 'x'.repeat(200) }])
}

const guardadas = tamanhoDoCache()

ok(
  'o cache para de crescer num teto',
  guardadas <= 200,
  `${guardadas} entradas depois de 600 dias visitados`,
)

ok('e continua guardando o que foi visto por último', cache.ler('agenda:dia-599') !== undefined)

/* ==================================================================
   2 · A tela aberta agora nunca é descartada
   ==================================================================
   Podar é bom até jogar fora o que está na tela: seria justamente a
   releitura que o cache existe para evitar.
   ================================================================== */
grupo('2 · a poda respeita quem está na tela')

cache.limpar()

const CHAVE_NA_TELA = 'agenda:dia-0'
cache.gravar(CHAVE_NA_TELA, ['o dia que a proprietária está olhando'])

// Alguém inscrito = tela montada.
const cancelar = cache.inscrever(CHAVE_NA_TELA, () => {})

for (let i = 1; i < 600; i++) {
  cache.gravar(`agenda:dia-${i}`, [{ id: i }])
}

ok(
  'a chave com tela aberta sobrevive à poda',
  cache.ler(CHAVE_NA_TELA) !== undefined,
)

cancelar()
cache.limpar()

/* ==================================================================
   3 · Uma ação não pode invalidar o sistema inteiro
   ==================================================================
   Com Postgres, cada tabela que muda gera o próprio aviso. Repetir a
   cascata no mapa do tempo real multiplicava o trabalho: seis avisos
   × doze prefixos para uma ação só.
   ================================================================== */
grupo('3 · o tempo real é cirúrgico')

const doAgendamento = CHAVES_POR_COLECAO.agendamentos ?? []

ok(
  'agendamento invalida poucas áreas',
  doAgendamento.length <= 4,
  `${doAgendamento.length} prefixos: ${doAgendamento.join(', ')}`,
)

for (const proibido of ['caixa', 'financeiro', 'produtos', 'procedimentos', 'clientes']) {
  ok(
    `agendamento NÃO invalida ${proibido}`,
    !doAgendamento.includes(proibido),
  )
}

ok(
  'nenhuma coleção dispara mais que 3 áreas',
  Object.values(CHAVES_POR_COLECAO).every((lista) => lista.length <= 3),
  `maior: ${Math.max(...Object.values(CHAVES_POR_COLECAO).map((l) => l.length))}`,
)

/* ==================================================================
   4 · Quem grava continua vendo o resultado na hora
   ==================================================================
   A cascata larga não foi apagada — mudou de lugar. Ela é o que faz a
   tela de quem CLICOU responder sem esperar a volta do servidor.
   ================================================================== */
grupo('4 · a cascata de quem grava foi preservada')

ok(
  'concluir um atendimento ainda atualiza caixa e financeiro',
  AFETADOS_POR_AGENDAMENTO.includes('caixa') &&
    AFETADOS_POR_AGENDAMENTO.includes('financeiro'),
)

ok(
  'e continua sendo mais larga que a do tempo real',
  AFETADOS_POR_AGENDAMENTO.length > doAgendamento.length,
  `${AFETADOS_POR_AGENDAMENTO.length} contra ${doAgendamento.length}`,
)

/* ==================================================================
   5 · Invalidar não deixa lixo para trás
   ==================================================================
   A busca em voo é solta junto — senão o refetch se penduraria na
   leitura antiga e repovoaria a tela com dado velho.
   ================================================================== */
grupo('5 · invalidar limpa valor e busca em voo')

cache.limpar()

cache.gravar('agenda:x', ['velho'])
cache.registrarBusca('agenda:x', Promise.resolve(['velho']))

cache.invalidar('agenda')

ok('o valor saiu', cache.ler('agenda:x') === undefined)
ok('a busca em voo saiu', cache.emVoo('agenda:x') === undefined)

cache.limpar()

/* ================================================================== */

console.log(
  falhas === 0
    ? `\nTODOS OS ${total} TESTES PASSARAM`
    : `\n${falhas} FALHA(S) de ${total}`,
)

if (falhas > 0) process.exit(1)
