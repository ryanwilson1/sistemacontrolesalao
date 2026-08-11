/**
 * Cache de consultas.
 *
 * Substitui o React Query. Sem servidor não há requisição de rede para
 * coordenar — o que precisamos é bem menor: guardar o resultado, avisar
 * quem depende dele quando algo muda e evitar buscar duas vezes a mesma
 * coisa na mesma tela.
 *
 * São ~40 linhas contra ~40 KB de biblioteca. Se um dia entrar sincronia
 * com servidor, a troca é direta: `useConsulta` tem a mesma forma de
 * `useQuery`.
 */

type Ouvinte = () => void

const valores = new Map<string, unknown>()
const ouvintes = new Map<string, Set<Ouvinte>>()

/**
 * Buscas em andamento, por chave.
 *
 * Mora aqui, e não em `useConsulta`, porque `invalidar` precisa
 * alcançá-las. Ver o comentário longo dentro de `invalidar`.
 */
const emAndamento = new Map<string, Promise<unknown>>()

export const cache = {
  ler<T>(chave: string): T | undefined {
    return valores.get(chave) as T | undefined
  },

  gravar<T>(chave: string, valor: T): void {
    valores.set(chave, valor)
    ouvintes.get(chave)?.forEach((avisar) => avisar())
  },

  /** A busca em voo desta chave, se houver. Usada por `useConsulta`. */
  emVoo<T>(chave: string): Promise<T> | undefined {
    return emAndamento.get(chave) as Promise<T> | undefined
  },

  /** Registra a busca e a solta sozinha ao terminar. */
  registrarBusca<T>(chave: string, busca: Promise<T>): Promise<T> {
    const acompanhada = busca.finally(() => {
      // Só remove se ainda for esta. Uma invalidação no meio do caminho
      // já pode ter posto outra no lugar.
      if (emAndamento.get(chave) === acompanhada) emAndamento.delete(chave)
    })
    emAndamento.set(chave, acompanhada)
    return acompanhada
  },

  inscrever(chave: string, ouvinte: Ouvinte): () => void {
    const conjunto = ouvintes.get(chave) ?? new Set()
    conjunto.add(ouvinte)
    ouvintes.set(chave, conjunto)

    return () => {
      conjunto.delete(ouvinte)
      if (conjunto.size === 0) ouvintes.delete(chave)
    }
  },

  /**
   * Marca como desatualizado tudo que começa com o prefixo.
   * `invalidar('clientes')` atinge 'clientes:lista' e 'clientes:42'.
   */
  invalidar(...prefixos: string[]): void {
    /*
      A busca em voo também é descartada.

      Sem esta parte, a deduplicação de requisições virava um problema
      no pior momento possível. A sequência:

        a grade do portal começa a carregar
        ↓
        outra cliente fecha o horário das 15h
        ↓
        invalidar('horarios') — e o refetch encontra a busca ANTIGA
        ainda em voo e se pendura nela

      O resultado é a grade sendo repovoada com o estado de antes: as
      15h continuam na tela, a cliente toca de novo e leva o mesmo
      erro. Exatamente o que o link não pode fazer.

      Soltar a promessa aqui garante que uma invalidação sempre leve a
      uma leitura nova. Quem já estava esperando a antiga recebe o dado
      velho uma vez — e é acordado logo em seguida pelo aviso abaixo.
    */
    for (const chave of [...emAndamento.keys()]) {
      if (prefixos.some((prefixo) => chave.startsWith(prefixo))) {
        emAndamento.delete(chave)
      }
    }

    // Varre valores E ouvintes: uma chave guardada sem ninguém escutando
    // também precisa ser descartada, senão volta obsoleta na próxima tela.
    const chaves = new Set([...valores.keys(), ...ouvintes.keys()])

    for (const chave of chaves) {
      if (!prefixos.some((prefixo) => chave.startsWith(prefixo))) continue

      valores.delete(chave)
      ouvintes.get(chave)?.forEach((avisar) => avisar())
    }
  },

  limpar(): void {
    valores.clear()
    emAndamento.clear()
    ouvintes.forEach((conjunto) => conjunto.forEach((avisar) => avisar()))
  },
}

/** Prefixos usados nas invalidações. Centralizados para não errar a string. */
export const CHAVES = {
  painel: 'painel',
  agenda: 'agenda',
  bloqueios: 'bloqueios',
  clientes: 'clientes',
  servicos: 'servicos',
  categorias: 'categorias',
  equipe: 'equipe',
  studio: 'studio',
  jornada: 'jornada',
  produtos: 'produtos',
  fornecedores: 'fornecedores',
  financeiro: 'financeiro',
  metas: 'metas',
  fidelidade: 'fidelidade',
  horarios: 'horarios',
  caixa: 'caixa',
  cupons: 'cupons',
  procedimentos: 'procedimentos',
  backup: 'backup',
  lembretes: 'lembretes',
  notificacoes: 'notificacoes',
  modelos: 'modelos',
  reservas: 'reservas',
  solicitacoes: 'solicitacoes',
  espera: 'espera',
} as const

/** Tudo que muda quando um agendamento muda. */
export const AFETADOS_POR_AGENDAMENTO = [
  CHAVES.agenda, CHAVES.painel, CHAVES.clientes, CHAVES.financeiro,
  CHAVES.horarios, CHAVES.caixa, CHAVES.procedimentos, CHAVES.produtos,
  CHAVES.lembretes, CHAVES.notificacoes, CHAVES.solicitacoes, CHAVES.espera,
]

/**
 * Que consultas ficam velhas quando cada coleção muda.
 *
 * É a tradução que o tempo real precisa: o canal avisa "agendamentos
 * mudou" e este mapa diz quais telas têm de reler. Ficar fora do canal
 * é de propósito — o canal não deveria saber que existe cache, nem o
 * cache que existe canal.
 *
 * Coleção ausente aqui não invalida nada, e está certo: mexer em
 * `backups` não deve mandar a agenda buscar de novo.
 */
export const CHAVES_POR_COLECAO: Record<string, string[]> = {
  agendamentos: AFETADOS_POR_AGENDAMENTO,
  bloqueios: [CHAVES.bloqueios, CHAVES.horarios, CHAVES.agenda, CHAVES.painel],
  reservas: [CHAVES.reservas, CHAVES.horarios],
  solicitacoes: [CHAVES.solicitacoes, CHAVES.agenda, CHAVES.notificacoes, CHAVES.painel],
  listaEspera: [CHAVES.espera, CHAVES.notificacoes],
  servicos: [CHAVES.servicos, CHAVES.horarios, CHAVES.agenda],
  categorias: [CHAVES.categorias, CHAVES.servicos],
  clientes: [CHAVES.clientes, CHAVES.agenda, CHAVES.painel],
  profissionais: [CHAVES.equipe, CHAVES.agenda, CHAVES.horarios],
  jornada: [CHAVES.jornada, CHAVES.horarios, CHAVES.agenda],
  studio: [CHAVES.studio, CHAVES.horarios],
  produtos: [CHAVES.produtos, CHAVES.painel],
  movimentos: [CHAVES.produtos],
  lancamentos: [CHAVES.financeiro, CHAVES.painel, CHAVES.caixa],
  metas: [CHAVES.metas, CHAVES.painel, CHAVES.financeiro],
  caixas: [CHAVES.caixa, CHAVES.painel],
  movimentosCaixa: [CHAVES.caixa],
  cupons: [CHAVES.cupons],
  pontos: [CHAVES.fidelidade, CHAVES.clientes],
  fidelidade: [CHAVES.fidelidade],
  lembretes: [CHAVES.lembretes],
  notificacoes: [CHAVES.notificacoes],
  modelosMensagem: [CHAVES.modelos, CHAVES.lembretes],
  procedimentos: [CHAVES.procedimentos, CHAVES.clientes],
}
