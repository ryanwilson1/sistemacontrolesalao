/**
 * O `useConsulta` de verdade, renderizado pelo React de verdade.
 *
 * ---------------------------------------------------------------
 * Por que este teste existe além do de estresse
 * ---------------------------------------------------------------
 * O teste de estresse valida o PROTOCOLO do cache (marcaDe/gravarSe)
 * chamando-o diretamente. Este valida o USO: o hook real, montado num
 * componente real, atravessando os cenários que travavam o iPhone:
 *
 *   1. resposta lenta chega depois de a tela desmontar E de o cache
 *      ser invalidado — não pode contaminar o cache;
 *   2. revalidação com dado na mão é silenciosa — `carregando` não
 *      pode acender;
 *   3. troca de chave (mudar o dia da Agenda) limpa o dado anterior —
 *      a tela não pode mostrar ontem como se fosse hoje;
 *   4. duas telas na mesma chave = uma busca só;
 *   5. desmontar no meio da busca não grita (sem setState em morto).
 *
 * Se alguém regredir o hook — voltar o `setCarregando(true)`
 * incondicional, remover a marca — este arquivo quebra.
 */

import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://studio.local/',
  pretendToBeVisual: true,
})

const janela = dom.window as unknown as Window & typeof globalThis

Object.assign(globalThis, {
  window: janela,
  document: janela.document,
  localStorage: janela.localStorage,
})
Object.defineProperty(globalThis, 'navigator', {
  value: janela.navigator,
  configurable: true,
})
// O React 18 lê IS_REACT_ACT_ENVIRONMENT para permitir `act` fora do Jest.
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const { act, createElement, useEffect } = await import('react')
const { createRoot } = await import('react-dom/client')
const { cache } = await import('../src/hooks/dados/cache')
const { useConsulta } = await import('../src/hooks/dados/useConsulta')

let testes = 0
let falhas = 0

function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  testes += 1
  if (!condicao) falhas += 1
  console.log(`  ${condicao ? 'ok ' : 'FALHOU'} ${descricao}${detalhe ? ` — ${detalhe}` : ''}`)
}

function titulo(texto: string): void {
  console.log(`\n── ${texto}`)
}

const pausa = (ms = 0) => new Promise((r) => setTimeout(r, ms))

/**
 * Uma busca controlada de fora: o teste decide QUANDO ela responde.
 * É o que permite encenar "a resposta chegou atrasada".
 */
function buscaControlada<T>() {
  let liberar!: (valor: T) => void
  let chamadas = 0
  const busca = () => {
    chamadas += 1
    return new Promise<T>((resolver) => {
      liberar = resolver
    })
  }
  return {
    busca,
    responder: (valor: T) => liberar(valor),
    get chamadas() {
      return chamadas
    },
  }
}

/** Monta um componente que usa o hook e expõe o que ele devolveu. */
function montarConsulta<T>(chave: string, buscar: () => Promise<T>) {
  const visto: { dados: T | undefined; carregando: boolean; historico: boolean[] } = {
    dados: undefined,
    carregando: true,
    historico: [],
  }

  function Tela() {
    const consulta = useConsulta<T>(chave, buscar)
    visto.dados = consulta.dados
    visto.carregando = consulta.carregando
    useEffect(() => {
      visto.historico.push(consulta.carregando)
    })
    return null
  }

  const container = janela.document.createElement('div')
  janela.document.body.appendChild(container)
  const raiz = createRoot(container)
  act(() => {
    raiz.render(createElement(Tela))
  })

  return {
    visto,
    desmontar: () => {
      act(() => raiz.unmount())
      container.remove()
    },
  }
}

/* ================================================================== */
titulo('1 · resposta atrasada de tela morta não contamina o cache')

{
  const CHAVE = 'agenda:2026-08-12:2026-08-12'
  const lenta = buscaControlada<{ v: string }>()

  // A Agenda monta e a busca parte…
  const agenda = montarConsulta(CHAVE, lenta.busca)
  await act(() => pausa())

  // …a proprietária troca de tela…
  agenda.desmontar()

  // …um evento do Realtime invalida, e o estado novo chega por outra via…
  cache.invalidar('agenda')
  cache.gravar(CHAVE, { v: 'nova' })

  // …e SÓ ENTÃO a busca antiga aterrissa.
  await act(async () => {
    lenta.responder({ v: 'antiga' })
    await pausa()
  })

  ok(
    (cache.ler(CHAVE) as { v: string }).v === 'nova',
    'o cache ficou com o estado novo',
    `valor: ${(cache.ler(CHAVE) as { v: string }).v}`,
  )
}

/* ================================================================== */
titulo('2 · revalidação com dado na mão é silenciosa')

{
  const CHAVE = 'clientes:lista'
  cache.limpar()

  let respostas = 0
  const buscar = () => {
    respostas += 1
    return Promise.resolve({ resposta: respostas })
  }

  const tela = montarConsulta(CHAVE, buscar)
  await act(() => pausa())

  ok(tela.visto.carregando === false, 'a primeira carga terminou')
  ok((tela.visto.dados as { resposta: number }).resposta === 1, 'com o primeiro resultado')

  const carregouAteAqui = tela.visto.historico.filter(Boolean).length

  // Um evento do Realtime invalida a chave — a tela relê…
  await act(async () => {
    cache.invalidar('clientes')
    await pausa()
  })

  const carregouDepois = tela.visto.historico.filter(Boolean).length

  ok(
    (tela.visto.dados as { resposta: number }).resposta === 2,
    'a releitura trouxe o resultado novo',
    `resposta: ${(tela.visto.dados as { resposta: number }).resposta}`,
  )
  ok(
    carregouDepois === carregouAteAqui,
    'e o "carregando" NÃO acendeu no meio — sem esqueleto, sem piscada',
    `renders com carregando: ${carregouAteAqui} antes · ${carregouDepois} depois`,
  )

  tela.desmontar()
}

/* ================================================================== */
titulo('3 · trocar o dia limpa o dado do dia anterior')

{
  cache.limpar()

  const visto: { dados: unknown; carregando: boolean } = { dados: undefined, carregando: true }
  let chaveAtual = 'agenda:2026-08-12'
  let render!: () => void

  const lenta = buscaControlada<{ dia: string }>()
  const rapidaOntem = () => Promise.resolve({ dia: 'ontem' })

  function Tela({ chave }: { chave: string }) {
    const consulta = useConsulta<{ dia: string }>(
      chave,
      chave === 'agenda:2026-08-12' ? rapidaOntem : lenta.busca,
    )
    visto.dados = consulta.dados
    visto.carregando = consulta.carregando
    return null
  }

  const container = janela.document.createElement('div')
  janela.document.body.appendChild(container)
  const raiz = createRoot(container)
  render = () => act(() => raiz.render(createElement(Tela, { chave: chaveAtual })))

  render()
  await act(() => pausa())
  ok((visto.dados as { dia: string }).dia === 'ontem', 'o dia carregado aparece')

  // Troca para amanhã — a busca nova é LENTA.
  chaveAtual = 'agenda:2026-08-13'
  render()
  await act(() => pausa())

  ok(visto.dados === undefined, 'enquanto amanhã carrega, ontem NÃO fica na tela')
  ok(visto.carregando === true, 'e o esqueleto aparece — aqui ele informa de verdade')

  await act(async () => {
    lenta.responder({ dia: 'amanha' })
    await pausa()
  })
  ok((visto.dados as { dia: string }).dia === 'amanha', 'o dia novo chegou')

  act(() => raiz.unmount())
}

/* ================================================================== */
titulo('4 · duas telas na mesma chave, uma busca só')

{
  cache.limpar()
  const CHAVE = 'painel:completo'

  let chamadas = 0
  const buscar = () => {
    chamadas += 1
    return pausa(5).then(() => ({ n: chamadas }))
  }

  const a = montarConsulta(CHAVE, buscar)
  const b = montarConsulta(CHAVE, buscar)
  await act(() => pausa(20))

  ok(chamadas === 1, 'quatro cartões, uma leitura', `${chamadas} chamada(s)`)
  ok(
    (a.visto.dados as { n: number })?.n === 1 && (b.visto.dados as { n: number })?.n === 1,
    'e as duas telas receberam o mesmo resultado',
  )

  a.desmontar()
  b.desmontar()
}

/* ================================================================== */
titulo('5 · desmontar no meio da busca é silencioso')

{
  cache.limpar()
  const lenta = buscaControlada<string>()

  const erros: unknown[] = []
  const consoleError = console.error
  console.error = (...args: unknown[]) => {
    erros.push(args)
  }

  const tela = montarConsulta('estoque:lista', lenta.busca)
  await act(() => pausa())
  tela.desmontar()

  await act(async () => {
    lenta.responder('tarde demais')
    await pausa()
  })

  console.error = consoleError

  ok(
    erros.length === 0,
    'nenhum aviso de setState em componente desmontado',
    erros.length ? String(erros[0]) : 'console limpo',
  )
}

/* ================================================================== */

console.log('\n' + '─'.repeat(58))
console.log(
  falhas === 0
    ? `TODOS OS ${testes} TESTES DO useConsulta REAL PASSARAM`
    : `${falhas} de ${testes} TESTES FALHARAM`,
)
console.log('─'.repeat(58))

if (falhas > 0) process.exit(1)
