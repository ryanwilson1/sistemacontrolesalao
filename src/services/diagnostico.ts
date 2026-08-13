/**
 * Contadores de diagnóstico.
 *
 * ---------------------------------------------------------------
 * Para que serve
 * ---------------------------------------------------------------
 * Perguntas que antes só se respondiam por dedução:
 *
 *   quantos canais de Realtime estão abertos agora?
 *   quantas consultas estão no ar ao mesmo tempo?
 *   quantas respostas antigas foram descartadas?
 *   quantas navegações aconteceram nos últimos dez segundos?
 *   quantas vezes o layout redesenhou?
 *   quanto tempo cada página levou para aparecer?
 *
 * No console, `__studio.diagnostico()` responde todas de uma vez.
 *
 * ---------------------------------------------------------------
 * Por que isto não pesa
 * ---------------------------------------------------------------
 * Fora de desenvolvimento os contadores ficam DESLIGADOS, e cada ponto
 * instrumentado vira um teste de booleano — nada de objeto criado, nada
 * de string montada, nada na tela.
 *
 * A chave no `localStorage` existe para o caso que mais interessa: o
 * aparelho da cliente, em produção, com o problema acontecendo. Ligar
 * exige digitar no console do Safari conectado ao Mac — a cliente nunca
 * chega lá por acidente, e nada aparece na interface de qualquer forma.
 *
 *   localStorage.setItem('studio:diagnostico', '1')  // e recarregar
 */

const CHAVE = 'studio:diagnostico'

function ligadoDeSaida(): boolean {
  /*
    `import.meta.env` é injetado pelo Vite; nos testes (tsx/Node puro)
    ele não existe. O acesso defensivo evita que importar qualquer
    módulo que dependa do diagnóstico derrube a suíte — e no Node o
    diagnóstico simplesmente fica desligado, que é o correto.
  */
  const ambiente = (import.meta as { env?: { DEV?: boolean } }).env
  if (ambiente?.DEV) return true
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(CHAVE) === '1'
  } catch {
    // Safari em navegação privada recusa o `localStorage`. Sem
    // diagnóstico é melhor que sem sistema.
    return false
  }
}

const LIGADO = typeof window !== 'undefined' && ligadoDeSaida()

type Contador =
  | 'navegacoes'
  | 'navegacoesDescartadas'
  | 'rendersDoLayout'
  | 'consultasIniciadas'
  | 'respostasDescartadas'
  | 'invalidacoes'
  | 'eventosTempoReal'
  | 'canaisAbertos'
  | 'canaisFechados'
  | 'reconexoes'

const contadores = new Map<Contador, number>()
const medidores = new Map<string, () => unknown>()
const tempos = new Map<string, number>()
const marcos = new Map<string, number>()

export const diagnostico = {
  ligado: LIGADO,

  contar(qual: Contador, quanto = 1): void {
    if (!LIGADO) return
    contadores.set(qual, (contadores.get(qual) ?? 0) + quanto)
  },

  /**
   * Registra uma fonte de números viva — o cache, o canal, a lista de
   * consultas no ar. Chamada só na leitura, então observar não custa.
   */
  observar(nome: string, ler: () => unknown): void {
    if (!LIGADO) return
    medidores.set(nome, ler)
  },

  /** Começa a cronometrar algo (o carregamento de uma página). */
  comecar(nome: string): void {
    if (!LIGADO) return
    marcos.set(nome, performance.now())
  },

  /** Fecha o cronômetro e guarda o tempo em milissegundos. */
  terminar(nome: string): void {
    if (!LIGADO) return
    const inicio = marcos.get(nome)
    if (inicio === undefined) return
    marcos.delete(nome)
    tempos.set(nome, Math.round(performance.now() - inicio))
  },

  /** O retrato completo. É isto que `__studio.diagnostico()` imprime. */
  retrato(): Record<string, unknown> {
    if (!LIGADO) {
      return {
        aviso:
          'Diagnóstico desligado. Rode localStorage.setItem("studio:diagnostico","1") e recarregue.',
      }
    }

    const fontes: Record<string, unknown> = {}
    for (const [nome, ler] of medidores) {
      try {
        fontes[nome] = ler()
      } catch {
        fontes[nome] = 'falhou ao medir'
      }
    }

    return {
      contadores: Object.fromEntries(contadores),
      agora: fontes,
      temposMs: Object.fromEntries(tempos),
    }
  },

  reiniciar(): void {
    contadores.clear()
    tempos.clear()
    marcos.clear()
  },
}

/*
  A porta no console.

  Fica em `window.__studio` junto da versão do build, que já morava lá —
  um lugar só para tudo que é ferramenta de quem mantém o sistema.
*/
if (LIGADO && typeof window !== 'undefined') {
  const janela = window as Window & {
    __studio?: Record<string, unknown>
  }
  janela.__studio = {
    ...(janela.__studio ?? {}),
    diagnostico: () => diagnostico.retrato(),
    reiniciarDiagnostico: () => diagnostico.reiniciar(),
  }
  console.info(
    '[studio] diagnóstico ligado — use __studio.diagnostico() no console.',
  )
}
