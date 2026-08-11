/**
 * Segunda varredura — testes de regressão.
 *
 * Cada bloco aqui nasceu de uma falha encontrada na auditoria
 * independente, não de uma suposição. O teste falha no código antigo e
 * passa no corrigido — que é a única prova que vale.
 */

import { faixaDoDia, faixaDeDias } from '../src/utils/datas'
import { normalizarInstante } from '../src/services/storage/instantes'

let falhas = 0
let total = 0

const grupo = (nome: string) => console.log(`\n── ${nome}`)

function ok(descricao: string, condicao: boolean, detalhe = '') {
  total++
  if (condicao) {
    console.log(`  ok  ${descricao}${detalhe ? ` — ${detalhe}` : ''}`)
  } else {
    falhas++
    console.log(` FALHA ${descricao}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

/* ==================================================================
   1 · Formato de data vindo do PostgREST
   ==================================================================

   O banco devolve `2026-08-11T14:00:00+00:00`. O sistema monta as
   faixas com `toISOString()`, que produz `2026-08-11T14:00:00.000Z`.
   Os dois representam o MESMO instante e são comparados como TEXTO
   em `noPeriodo`.

   Texto diferente para instante igual é uma bomba com relógio.
   ================================================================== */
grupo('1 · instantes do banco viram forma canônica')

ok(
  'offset +00:00 vira Z',
  normalizarInstante('2026-08-11T14:00:00+00:00') === '2026-08-11T14:00:00.000Z',
  normalizarInstante('2026-08-11T14:00:00+00:00'),
)

ok(
  'offset -03:00 vira o UTC correspondente',
  normalizarInstante('2026-08-11T11:00:00-03:00') === '2026-08-11T14:00:00.000Z',
  normalizarInstante('2026-08-11T11:00:00-03:00'),
)

ok(
  'microssegundos do Postgres não quebram',
  normalizarInstante('2026-08-11T14:00:00.123456+00:00') === '2026-08-11T14:00:00.123Z',
  normalizarInstante('2026-08-11T14:00:00.123456+00:00'),
)

ok(
  'data pura (nascimento, validade) fica intacta',
  normalizarInstante('1990-04-23') === '1990-04-23',
)

ok('hora pura (jornada) fica intacta', normalizarInstante('09:30') === '09:30')
ok('texto comum fica intacto', normalizarInstante('Escova progressiva') === 'Escova progressiva')
ok('nulo fica nulo', normalizarInstante(null) === null)
ok('número fica número', normalizarInstante(250) === 250)

/* ==================================================================
   2 · A borda do dia
   ==================================================================

   Aqui o bug aparece de verdade. Um agendamento exatamente na virada
   do dia é comparado com o limite da faixa, e a diferença de formato
   decide errado — em ambas as direções.
   ================================================================== */
grupo('2 · agendamento na virada do dia cai no dia certo')

const dia = new Date(2026, 7, 11) // 11/08/2026, hora local
const { de, ate } = faixaDoDia(dia)

/* Como o PostgREST devolveria a meia-noite local deste dia. */
const meiaNoiteDoDia = new Date(2026, 7, 11, 0, 0, 0)
const comoOBancoDevolve = meiaNoiteDoDia
  .toISOString()
  .replace(/\.\d{3}Z$/, '+00:00')

const cru = comoOBancoDevolve >= de && comoOBancoDevolve < ate
const normalizado = (() => {
  const v = normalizarInstante(comoOBancoDevolve) as string
  return v >= de && v < ate
})()

ok(
  'sem normalizar, a comparação de texto erra',
  cru === false,
  'é o bug que esta correção fecha',
)
ok('normalizado, o agendamento entra no próprio dia', normalizado === true)

/* A outra ponta: a meia-noite do dia SEGUINTE não pode vazar para cá. */
const meiaNoiteSeguinte = new Date(2026, 7, 12, 0, 0, 0)
const seguinteComoOBanco = meiaNoiteSeguinte
  .toISOString()
  .replace(/\.\d{3}Z$/, '+00:00')

const vazouCru = seguinteComoOBanco >= de && seguinteComoOBanco < ate
const vazouNormalizado = (() => {
  const v = normalizarInstante(seguinteComoOBanco) as string
  return v >= de && v < ate
})()

ok('sem normalizar, o dia seguinte vaza para este', vazouCru === true, 'o mesmo bug, ao contrário')
ok('normalizado, o dia seguinte fica de fora', vazouNormalizado === false)

/* ==================================================================
   3 · Fuso não-UTC no projeto Supabase
   ==================================================================

   Supabase nasce em UTC, mas o fuso é ajustável no painel. Se alguém
   mudar para America/Sao_Paulo, o PostgREST passa a responder com
   `-03:00` — e a comparação de texto deixa de errar só na borda para
   errar o dia inteiro.
   ================================================================== */
grupo('3 · projeto com fuso -03:00 continua correto')

/*
  A verdade é calculada com `Date`, não digitada.

  A primeira versão deste teste afirmava em que direção o texto erra —
  e errou, porque a direção depende do fuso de QUEM RODA o teste. Um
  teste que afirma o formato do bug em vez do comportamento correto é
  um teste que mente em outra máquina.

  O que importa afirmar é só isto: depois de normalizar, a classificação
  bate com o instante de verdade. Em qualquer fuso.
*/
const casos = [
  '2026-08-12T01:00:00-03:00',
  '2026-08-11T23:30:00-03:00',
  '2026-08-11T00:00:00+00:00',
  '2026-08-10T23:59:59+00:00',
  '2026-08-11T12:00:00.654321+00:00',
]

for (const bruto of casos) {
  const instante = new Date(bruto).getTime()
  const verdade = instante >= new Date(de).getTime() && instante < new Date(ate).getTime()

  const texto = normalizarInstante(bruto) as string
  const pelaComparacaoDeTexto = texto >= de && texto < ate

  ok(
    `${bruto} classificado igual ao instante real`,
    pelaComparacaoDeTexto === verdade,
    verdade ? 'dentro do dia' : 'fora do dia',
  )
}

/* ==================================================================
   4 · Faixas de vários dias
   ================================================================== */
grupo('4 · faixa de semana também respeita a borda')

const semana = faixaDeDias(new Date(2026, 7, 9), new Date(2026, 7, 15))
const domingoMeiaNoite = normalizarInstante(
  new Date(2026, 7, 9, 0, 0, 0).toISOString().replace(/\.\d{3}Z$/, '+00:00'),
) as string

ok(
  'o primeiro instante da semana está dentro dela',
  domingoMeiaNoite >= semana.de && domingoMeiaNoite < semana.ate,
)

/* ================================================================== */


/* ==================================================================
   5 · A grade do link não pode ser repovoada com dado velho
   ==================================================================

   O cenário que motiva este teste é o do Instagram:

     a cliente A abre o link e a grade começa a carregar
     ↓
     a cliente B fecha as 15h nesse instante
     ↓
     o aviso chega e invalida 'horarios'

   Se a releitura se pendurasse na busca que já estava no ar, a tela de
   A voltaria a mostrar as 15h — o horário que acabou de sair. Ela
   tocaria e levaria erro.
   ================================================================== */
grupo('5 · invalidação solta a busca em andamento')

{
  const { cache } = await import('../src/hooks/dados/cache')

  let leituras = 0
  const grade = (horarios: string[]) => {
    leituras++
    return new Promise<string[]>((resolver) => setTimeout(() => resolver(horarios), 10))
  }

  const CHAVE = 'horarios:grade:2026-08-11'

  /* A primeira leitura sai, ainda com as 15h livres. */
  const primeira = cache.registrarBusca(CHAVE, grade(['14:00', '15:00']))

  /* Outra cliente fecha as 15h. */
  cache.invalidar('horarios')

  /* Quem chega agora não pode receber a busca antiga. */
  const emVooDepois = cache.emVoo(CHAVE)
  ok('a busca antiga foi solta do registro', emVooDepois === undefined)

  const segunda = cache.registrarBusca(CHAVE, grade(['14:00']))

  const [antiga, nova] = await Promise.all([primeira, segunda])

  ok('houve de fato duas leituras', leituras === 2, `${leituras} leituras`)
  ok('a leitura nova não traz mais as 15h', !nova.includes('15:00'), nova.join(', '))
  ok('a antiga permanece intacta para quem a esperava', antiga.includes('15:00'))

  cache.limpar()
}

/* ==================================================================
   6 · Deduplicação continua valendo quando nada invalidou
   ==================================================================
   A correção acima não pode ter desfeito o ganho de desempenho.
   ================================================================== */
grupo('6 · sem invalidação, uma busca serve a todos')

{
  const { cache } = await import('../src/hooks/dados/cache')

  let leituras = 0
  const buscar = () => {
    leituras++
    return new Promise<number>((resolver) => setTimeout(() => resolver(42), 10))
  }

  const CHAVE = 'painel:resumo'

  const pedidos = [1, 2, 3, 4].map(
    () => cache.emVoo<number>(CHAVE) ?? cache.registrarBusca(CHAVE, buscar()),
  )

  const respostas = await Promise.all(pedidos)

  ok('quatro telas, uma leitura só', leituras === 1, `${leituras} leitura(s)`)
  ok('todas receberam o mesmo resultado', respostas.every((r) => r === 42))

  cache.limpar()
}

console.log(
  falhas === 0
    ? `\nRESUMO FINAL: ${total} testes, nenhuma falha`
    : `\nRESUMO FINAL: ${falhas} FALHA(S) de ${total}`,
)

if (falhas > 0) process.exit(1)
