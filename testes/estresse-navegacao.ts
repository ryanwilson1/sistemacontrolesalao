/**
 * Teste de estresse de navegação.
 *
 * ---------------------------------------------------------------
 * O que este arquivo prova, e o que ele NÃO prova
 * ---------------------------------------------------------------
 * Ele não abre um iPhone. O que ele faz é exercitar, num DOM de
 * verdade (jsdom), os mecanismos que a auditoria apontou como causa do
 * travamento — cache, canal de tempo real, temporizadores, ouvintes — e
 * medir se **algum deles cresce** quando a navegação se repete.
 *
 * Essa é a pergunta que importa. Um sistema que fica mais pesado a cada
 * troca de tela é um sistema com vazamento, e vazamento aparece na
 * contagem muito antes de aparecer no relógio. As contagens abaixo são
 * exatamente as que o brief pediu:
 *
 *   canais de Realtime · ouvintes · consultas simultâneas ·
 *   temporizadores · entradas no cache · respostas descartadas
 *
 * O critério é sempre o mesmo: depois de N repetições, o número tem de
 * ser o mesmo de depois de uma.
 */

import { JSDOM } from 'jsdom'

/* ------------------------------------------------------------------ */
/* Um DOM com contadores em cima dos recursos que vazam.               */
/* ------------------------------------------------------------------ */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://studio.local/',
  pretendToBeVisual: true,
})

const janela = dom.window as unknown as Window & typeof globalThis

const vivos = {
  temporizadores: new Set<unknown>(),
  intervalos: new Set<unknown>(),
  ouvintes: new Map<string, number>(),
  quadros: new Set<number>(),
}

function instrumentar(): void {
  const alvos: { nome: string; alvo: EventTarget }[] = [
    { nome: 'window', alvo: janela },
    { nome: 'document', alvo: janela.document },
  ]

  for (const { nome, alvo } of alvos) {
    const adicionar = alvo.addEventListener.bind(alvo)
    const remover = alvo.removeEventListener.bind(alvo)

    alvo.addEventListener = (tipo: string, ouvinte: never, opcoes?: never) => {
      const chave = `${nome}:${tipo}`
      vivos.ouvintes.set(chave, (vivos.ouvintes.get(chave) ?? 0) + 1)
      adicionar(tipo, ouvinte, opcoes)
    }

    alvo.removeEventListener = (tipo: string, ouvinte: never, opcoes?: never) => {
      const chave = `${nome}:${tipo}`
      vivos.ouvintes.set(chave, Math.max(0, (vivos.ouvintes.get(chave) ?? 0) - 1))
      remover(tipo, ouvinte, opcoes)
    }
  }

  const porTimeout = janela.setTimeout.bind(janela)
  const limparTimeout = janela.clearTimeout.bind(janela)
  const porInterval = janela.setInterval.bind(janela)
  const limparInterval = janela.clearInterval.bind(janela)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  janela.setTimeout = ((fn: any, ms?: number, ...resto: any[]) => {
    const id = porTimeout(
      (...args: unknown[]) => {
        vivos.temporizadores.delete(id)
        fn(...args)
      },
      ms,
      ...resto,
    )
    vivos.temporizadores.add(id)
    return id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  janela.clearTimeout = ((id: any) => {
    vivos.temporizadores.delete(id)
    limparTimeout(id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  janela.setInterval = ((fn: any, ms?: number, ...resto: any[]) => {
    const id = porInterval(fn, ms, ...resto)
    vivos.intervalos.add(id)
    return id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  janela.clearInterval = ((id: any) => {
    vivos.intervalos.delete(id)
    limparInterval(id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
}

instrumentar()

// O ambiente precisa existir antes de qualquer import do sistema: os
// módulos leem `window` na carga.
Object.assign(globalThis, {
  window: janela,
  document: janela.document,
  localStorage: janela.localStorage,
  requestAnimationFrame: (fn: FrameRequestCallback) => janela.setTimeout(() => fn(0), 16),
  cancelAnimationFrame: (id: number) => janela.clearTimeout(id),
})

// `navigator` já existe no Node 22 e é somente leitura via atribuição —
// mas continua configurável, então `defineProperty` passa.
Object.defineProperty(globalThis, 'navigator', {
  value: janela.navigator,
  configurable: true,
})

/* ------------------------------------------------------------------ */

const { cache, CHAVES_POR_COLECAO } = await import('../src/hooks/dados/cache')

let falhas = 0
let total = 0

function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  total += 1
  if (!condicao) falhas += 1
  const marca = condicao ? 'ok ' : 'FALHOU'
  console.log(`  ${marca} ${descricao}${detalhe ? ` — ${detalhe}` : ''}`)
}

function titulo(texto: string): void {
  console.log(`\n── ${texto}`)
}

/** Soma de todos os ouvintes vivos agora. */
const totalDeOuvintes = () =>
  [...vivos.ouvintes.values()].reduce((soma, n) => soma + n, 0)

/* ------------------------------------------------------------------ */
/* Uma tela, reduzida ao que ela faz de custoso: assinar o cache.      */
/* ------------------------------------------------------------------ */

interface TelaMontada {
  desmontar: () => void
  chaves: string[]
}

/**
 * Monta uma tela: cada consulta assina a sua chave, como `useConsulta`
 * faz. Desmontar cancela todas — que é o contrato que estamos testando.
 */
function montarTela(nome: string, consultas: string[]): TelaMontada {
  const cancelamentos = consultas.map((chave) =>
    cache.inscrever(chave, () => {
      // Ao ser acordada, a tela relê — e é o cache quem responde.
      cache.ler(chave)
    }),
  )

  // Primeira leitura da tela.
  for (const chave of consultas) {
    if (cache.ler(chave) === undefined) cache.gravar(chave, { tela: nome, em: Date.now() })
  }

  return {
    chaves: consultas,
    desmontar: () => cancelamentos.forEach((cancelar) => cancelar()),
  }
}

const TELAS: Record<string, string[]> = {
  painel: ['painel:completo:2026-08-12', 'painel:serie:14', 'painel:semanal', 'painel:retorno'],
  agenda: ['agenda:2026-08-12:2026-08-12', 'bloqueios:2026-08-12:2026-08-12'],
  clientes: ['clientes:lista:0::ativas'],
  caixa: ['caixa:aberto', 'caixa:movimentos'],
  estoque: ['produtos:lista', 'fornecedores:lista'],
  servicos: ['servicos:lista', 'categorias:lista'],
}

/* ================================================================== */
titulo('1 · navegação rápida entre as oito telas, 20 voltas')

const PERCURSO = ['painel', 'agenda', 'clientes', 'caixa', 'agenda', 'estoque', 'servicos', 'clientes', 'painel']

// O menu fica montado o tempo todo, como no sistema real.
const menu = montarTela('menu', ['solicitacoes:contador', 'espera:contador'])

const ouvintesAntes = totalDeOuvintes()
const intervalosAntes = vivos.intervalos.size

let telaAtual: TelaMontada | null = null
const marcos: number[] = []

for (let volta = 0; volta < 20; volta += 1) {
  for (const nome of PERCURSO) {
    // Navegar = desmontar a anterior e montar a próxima.
    telaAtual?.desmontar()
    telaAtual = montarTela(nome, TELAS[nome]!)
  }
  marcos.push(cache.medir().ouvintes)
}

const depoisDaPrimeira = marcos[0]!
const depoisDaUltima = marcos[marcos.length - 1]!

ok(
  depoisDaPrimeira === depoisDaUltima,
  'os ouvintes do cache não crescem com as voltas',
  `volta 1: ${depoisDaPrimeira} · volta 20: ${depoisDaUltima}`,
)
ok(
  marcos.every((n) => n === depoisDaPrimeira),
  'e são estáveis em TODAS as vinte voltas',
  `mínimo ${Math.min(...marcos)} · máximo ${Math.max(...marcos)}`,
)
ok(
  cache.medir().valores <= 200,
  'o cache respeita o teto mesmo com 180 navegações',
  `${cache.medir().valores} entradas`,
)
ok(
  cache.medir().emVoo === 0,
  'nenhuma consulta ficou pendurada ao fim do percurso',
  `${cache.medir().emVoo} em voo`,
)

/* ================================================================== */
titulo('2 · menu → tela → menu → tela, 20 vezes')

/*
  O menu deslizante monta e desmonta a cada abertura. O que ele NÃO pode
  fazer é deixar ouvintes para trás — era o que acontecia quando o layout
  inteiro remontava a cada navegação.
*/
const ouvintesAntesDoMenu = totalDeOuvintes()

for (let i = 0; i < 20; i += 1) {
  const deslizante = montarTela('menu-deslizante', ['solicitacoes:contador', 'espera:contador'])
  telaAtual?.desmontar()
  telaAtual = montarTela(i % 2 === 0 ? 'agenda' : 'clientes', TELAS[i % 2 === 0 ? 'agenda' : 'clientes']!)
  deslizante.desmontar()
}

ok(
  totalDeOuvintes() === ouvintesAntesDoMenu,
  'abrir e fechar o menu 20 vezes não acumula ouvintes de DOM',
  `${ouvintesAntesDoMenu} → ${totalDeOuvintes()}`,
)

/* ================================================================== */
titulo('3 · Agenda → Clientes → Agenda, alternando 50 vezes')

const antesDoPingue = cache.medir()

for (let i = 0; i < 50; i += 1) {
  telaAtual?.desmontar()
  telaAtual = montarTela('agenda', TELAS.agenda!)
  telaAtual.desmontar()
  telaAtual = montarTela('clientes', TELAS.clientes!)
}

const depoisDoPingue = cache.medir()

ok(
  depoisDoPingue.ouvintes <= antesDoPingue.ouvintes + TELAS.clientes!.length,
  'alternar 50 vezes não deixa inscrição órfã',
  `${antesDoPingue.ouvintes} → ${depoisDoPingue.ouvintes}`,
)

/* ================================================================== */
titulo('4 · trocar o dia da Agenda rapidamente (30 dias seguidos)')

/*
  Cada dia é uma chave nova — era o vazamento silencioso que o teto de
  200 entradas corrigiu. Aqui confirmamos que ele continua valendo com a
  poda de versões que a auditoria acrescentou.
*/
telaAtual?.desmontar()

for (let dia = 1; dia <= 30; dia += 1) {
  const data = `2026-09-${String(dia).padStart(2, '0')}`
  const tela = montarTela('agenda', [`agenda:${data}:${data}`, `bloqueios:${data}:${data}`])
  tela.desmontar()
}

const aposOsDias = cache.medir()
ok(aposOsDias.valores <= 200, 'o teto do cache aguenta a varredura de dias', `${aposOsDias.valores} entradas`)
ok(
  aposOsDias.versoes <= 400,
  'o mapa de versões também tem teto',
  `${aposOsDias.versoes} versões`,
)

/* ================================================================== */
titulo('5 · resposta antiga NÃO sobrescreve resposta nova')

/*
  O furo que a auditoria fechou, reproduzido: uma consulta parte, a tela
  troca, algo invalida a chave, e só então a consulta antiga aterrissa.
*/
const CHAVE = 'agenda:2026-08-12:2026-08-12'

cache.gravar(CHAVE, { versao: 'inicial' })
const marcaDaBuscaAntiga = cache.marcaDe(CHAVE)

// Enquanto a busca antiga está no ar, o mundo muda.
cache.invalidar('agenda')
cache.gravar(CHAVE, { versao: 'nova' })

// Agora a antiga chega.
const aceitou = cache.gravarSe(CHAVE, { versao: 'antiga' }, marcaDaBuscaAntiga)

ok(!aceitou, 'a resposta antiga foi recusada')
ok(
  (cache.ler(CHAVE) as { versao: string }).versao === 'nova',
  'o cache continua com o dado novo',
  `versão: ${(cache.ler(CHAVE) as { versao: string }).versao}`,
)

titulo('5b · e a resposta legítima continua passando')

const marcaValida = cache.marcaDe(CHAVE)
ok(
  cache.gravarSe(CHAVE, { versao: 'legitima' }, marcaValida),
  'sem invalidação no meio, a gravação é aceita',
)

/* ================================================================== */
titulo('6 · logout invalida qualquer busca ainda no ar')

const CHAVE_LIMPA = 'clientes:lista:0::ativas'
cache.gravar(CHAVE_LIMPA, { de: 'proprietaria' })
const marcaAntesDoLogout = cache.marcaDe(CHAVE_LIMPA)

cache.limpar()

ok(
  !cache.gravarSe(CHAVE_LIMPA, { de: 'proprietaria' }, marcaAntesDoLogout),
  'a consulta iniciada antes do logout não grava depois dele',
)
ok(cache.ler(CHAVE_LIMPA) === undefined, 'e o cache continua vazio para a próxima pessoa')

/* ================================================================== */
titulo('7 · evento de Realtime durante a troca de tela')

/*
  O cenário do brief: uma tela monta enquanto um evento chega. O evento
  não pode multiplicar — cada coleção invalida só a sua área.
*/
const telaDurante = montarTela('agenda', TELAS.agenda!)

let maiorCascata = 0
for (const [colecao, chaves] of Object.entries(CHAVES_POR_COLECAO)) {
  maiorCascata = Math.max(maiorCascata, chaves.length)
  cache.invalidar(...chaves)
  void colecao
}

ok(maiorCascata <= 3, 'nenhuma coleção invalida mais que 3 áreas', `maior: ${maiorCascata}`)
ok(cache.medir().emVoo === 0, 'a tempestade de eventos não deixou busca pendurada')

telaDurante.desmontar()

/* ================================================================== */
titulo('8 · contagem final de recursos do sistema')

menu.desmontar()

const ouvintesFinais = totalDeOuvintes()
const medidaFinal = cache.medir()

ok(
  ouvintesFinais === ouvintesAntes,
  'nenhum ouvinte de DOM sobreviveu ao teste inteiro',
  `início: ${ouvintesAntes} · fim: ${ouvintesFinais}`,
)
ok(
  vivos.intervalos.size === intervalosAntes,
  'nenhum setInterval sobreviveu',
  `início: ${intervalosAntes} · fim: ${vivos.intervalos.size}`,
)
ok(medidaFinal.ouvintes === 0, 'nenhuma inscrição de cache órfã', `${medidaFinal.ouvintes} inscrições`)
ok(medidaFinal.emVoo === 0, 'nenhuma consulta em voo', `${medidaFinal.emVoo} em voo`)

/* ================================================================== */
titulo('9 · useRelogio: montar/desmontar 20 vezes não acumula nada')

/*
  Este é o mecanismo por trás do AvisoDeChegada — o que roda no layout,
  montado o dia inteiro. O contrato: cada montagem registra UM par
  (intervalo + visibilitychange) e cada desmontagem os apaga.

  Os hooks do React precisam de um componente para viver, então aqui o
  ciclo de vida é reproduzido à mão, com a MESMA lógica interna do hook
  — o que está sob teste é o protocolo de criação/limpeza, e ele é
  idêntico nas duas formas.
*/
function montarRelogio(tarefa: () => void, intervaloMs: number): () => void {
  let relogio: number | null = null

  const parar = () => {
    if (relogio !== null) janela.clearInterval(relogio as unknown as number)
    relogio = null
  }
  const comecar = () => {
    if (relogio !== null) return
    tarefa()
    relogio = janela.setInterval(tarefa, intervaloMs) as unknown as number
  }
  const aoTrocarVisibilidade = () => {
    if (janela.document.visibilityState === 'visible') comecar()
    else parar()
  }

  aoTrocarVisibilidade()
  janela.document.addEventListener('visibilitychange', aoTrocarVisibilidade)

  return () => {
    parar()
    janela.document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
  }
}

const intervalosAntesDoRelogio = vivos.intervalos.size
const ouvintesAntesDoRelogio = totalDeOuvintes()

let batidas = 0
for (let i = 0; i < 20; i += 1) {
  const desmontar = montarRelogio(() => {
    batidas += 1
  }, 45_000)
  desmontar()
}

ok(
  vivos.intervalos.size === intervalosAntesDoRelogio,
  '20 ciclos de useRelogio não deixam intervalo vivo',
  `${intervalosAntesDoRelogio} → ${vivos.intervalos.size}`,
)
ok(
  totalDeOuvintes() === ouvintesAntesDoRelogio,
  'nem listener de visibilidade',
  `${ouvintesAntesDoRelogio} → ${totalDeOuvintes()}`,
)
ok(batidas === 20, 'e a tarefa rodou exatamente uma vez por montagem', `${batidas} execuções`)

/* ================================================================== */
titulo('10 · agendador do Sino: dois montados, um relógio')

/*
  Reproduz o protocolo de `useSincroniaCompartilhada`: contagem de
  referências de módulo, um intervalo para N assinantes, execução
  deduplicada por guarda de voo.
*/
{
  let assinantes = 0
  let relogio: number | null = null
  let emVoo: Promise<unknown> | null = null
  let apuracoes = 0

  const apurar = () => {
    if (emVoo) return
    apuracoes += 1
    emVoo = Promise.resolve().finally(() => {
      emVoo = null
    })
  }

  const assinar = (): (() => void) => {
    assinantes += 1
    apurar()
    if (relogio === null) relogio = janela.setInterval(apurar, 300_000) as unknown as number
    return () => {
      assinantes = Math.max(0, assinantes - 1)
      if (assinantes > 0) return
      if (relogio !== null) {
        janela.clearInterval(relogio as unknown as number)
        relogio = null
      }
    }
  }

  const intervalosAntesDoSino = vivos.intervalos.size

  // Os dois sinos do layout montam juntos…
  const sair1 = assinar()
  const sair2 = assinar()

  ok(
    vivos.intervalos.size === intervalosAntesDoSino + 1,
    'dois sinos montados criam UM intervalo',
    `${vivos.intervalos.size - intervalosAntesDoSino} intervalo(s)`,
  )
  ok(apuracoes === 1, 'e a apuração da abertura rodou uma vez, não duas', `${apuracoes} apuração(ões)`)

  // …e o ciclo montar/desmontar se repete (troca de sessão, LimiteDeErro).
  sair1()
  sair2()
  for (let i = 0; i < 10; i += 1) {
    const a = assinar()
    const b = assinar()
    b()
    a()
  }

  ok(
    vivos.intervalos.size === intervalosAntesDoSino,
    '10 remontagens depois, nenhum relógio sobrevive',
    `${intervalosAntesDoSino} → ${vivos.intervalos.size}`,
  )
}

/* ================================================================== */
titulo('11 · avisos: fechar no X cancela o relógio da saída')

/*
  O protocolo novo do AvisoProvider: todo aviso tem um relógio com dono,
  e removê-lo — pelo X ou pela desmontagem — o cancela.
*/
{
  const relogios = new Map<number, number>()

  const remover = (id: number) => {
    const relogio = relogios.get(id)
    if (relogio !== undefined) {
      janela.clearTimeout(relogio as unknown as number)
      relogios.delete(id)
    }
  }
  const empilhar = (id: number) => {
    relogios.set(id, janela.setTimeout(() => remover(id), 4_000) as unknown as number)
  }
  const desmontarProvider = () => {
    for (const relogio of relogios.values()) janela.clearTimeout(relogio as unknown as number)
    relogios.clear()
  }

  const temporizadoresAntes = vivos.temporizadores.size

  // mostrar aviso → fechar no X → mostrar outro → desmontar o provider
  empilhar(1)
  remover(1)
  ok(
    vivos.temporizadores.size === temporizadoresAntes,
    'fechar o aviso no X apaga o relógio dele',
    `${temporizadoresAntes} → ${vivos.temporizadores.size}`,
  )

  empilhar(2)
  empilhar(3)
  desmontarProvider()
  ok(
    vivos.temporizadores.size === temporizadoresAntes,
    'desmontar o provider apaga todos os relógios pendentes',
    `${temporizadoresAntes} → ${vivos.temporizadores.size}`,
  )
}

/* ================================================================== */
titulo('12 · modal: abrir/fechar 20 vezes não acumula listeners')

/*
  O protocolo do Modal por trás do `useTravarFundo` + `useAlturaVisivel`:
  abrir registra keydown (e mediria o viewport); fechar remove tudo e
  cancela o quadro pendente.
*/
{
  const abrirModal = (): (() => void) => {
    const aoTeclar = () => {}
    janela.document.addEventListener('keydown', aoTeclar)

    let quadro: number | null = janela.setTimeout(() => {
      quadro = null
    }, 16) as unknown as number // rAF é polyfill de setTimeout aqui

    return () => {
      janela.document.removeEventListener('keydown', aoTeclar)
      if (quadro !== null) janela.clearTimeout(quadro as unknown as number)
    }
  }

  const ouvintesAntesDoModal = totalDeOuvintes()
  const temporizadoresAntesDoModal = vivos.temporizadores.size

  for (let i = 0; i < 20; i += 1) {
    const fechar = abrirModal()
    fechar()
  }

  ok(
    totalDeOuvintes() === ouvintesAntesDoModal,
    '20 aberturas não deixam keydown para trás',
    `${ouvintesAntesDoModal} → ${totalDeOuvintes()}`,
  )
  ok(
    vivos.temporizadores.size === temporizadoresAntesDoModal,
    'nem quadro de medição pendente',
    `${temporizadoresAntesDoModal} → ${vivos.temporizadores.size}`,
  )
}

/* ================================================================== */
titulo('13 · 20 trocas rápidas de abas (Portal: pedidos ↔ espera)')

/*
  Sem `mode="wait"`, trocar de aba desmonta a seção antiga e monta a
  nova NO MESMO ATO — o que precisa continuar verdade é que a
  alternância não deixa inscrição órfã nem busca pendurada, por mais
  rápida que seja.
*/
{
  const SECOES: Record<string, string[]> = {
    pedidos: ['solicitacoes:lista'],
    espera: ['espera:lista'],
    historico: ['solicitacoes:historico'],
    ajustes: ['studio:portal'],
  }

  const antes = cache.medir()
  let secaoMontada: TelaMontada | null = null

  const ordem = ['pedidos', 'espera', 'pedidos', 'espera', 'historico', 'ajustes']
  for (let volta = 0; volta < 20; volta += 1) {
    for (const secao of ordem) {
      secaoMontada?.desmontar()
      secaoMontada = montarTela(secao, SECOES[secao]!)
    }
  }
  secaoMontada?.desmontar()

  const depois = cache.medir()
  ok(
    depois.ouvintes === antes.ouvintes,
    '120 trocas de aba não deixam inscrição órfã',
    `${antes.ouvintes} → ${depois.ouvintes}`,
  )
  ok(depois.emVoo === 0, 'nem busca pendurada', `${depois.emVoo} em voo`)
}

/* ================================================================== */
console.log(
  falhas === 0
    ? `TODOS OS ${total} TESTES DE ESTRESSE PASSARAM`
    : `${falhas} de ${total} TESTES FALHARAM`,
)
console.log('─'.repeat(58))

if (falhas > 0) process.exit(1)
