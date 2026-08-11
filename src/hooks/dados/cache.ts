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
 * Teto de entradas guardadas.
 *
 * ---------------------------------------------------------------
 * Por que precisou existir
 * ---------------------------------------------------------------
 * A chave de cada consulta carrega o período: `agenda:2026-08-11...`.
 * Cada dia visitado cria uma entrada nova, e nada as removia — só a
 * invalidação por prefixo, que acontece quando algo muda, e o `limpar`,
 * que só roda em restauração de backup e logout.
 *
 * A proprietária passa o dia navegando entre datas. Numa semana de uso
 * com o aplicativo aberto, são centenas de entradas, cada uma segurando
 * a lista completa de agendamentos daquele dia com serviço, cliente e
 * profissional embutidos. Nada disso é lido de novo, e nada disso saía
 * da memória.
 *
 * Era o vazamento mais silencioso dos três: não trava nada de imediato,
 * só vai deixando o celular mais lento até ela fechar o aplicativo — e
 * fechar resolvia, o que fazia o problema parecer misterioso.
 *
 * Duzentas entradas cobrem com folga um dia inteiro de trabalho. Acima
 * disso, sai a mais antiga.
 */
const TETO = 200

/** Buscas em andamento, por chave. Ver o comentário em `invalidar`. */
const emAndamento = new Map<string, Promise<unknown>>()

/**
 * Descarta as entradas mais antigas quando o teto estoura.
 *
 * `Map` do JavaScript preserva a ordem de inserção, então a primeira
 * chave é sempre a mais velha. Regravar uma chave existente não a move
 * para o fim — e está certo assim: o que interessa é limitar o total,
 * não construir um LRU de verdade. Uma consulta descartada por engano
 * custa uma releitura; um LRU custa complexidade em código que precisa
 * ser óbvio.
 *
 * Chave com alguém escutando nunca sai: é uma tela aberta agora, e
 * descartá-la provocaria justamente a releitura que o cache existe para
 * evitar.
 */
function podar(): void {
  if (valores.size <= TETO) return

  for (const chave of valores.keys()) {
    if (valores.size <= TETO) break
    if (ouvintes.has(chave)) continue
    valores.delete(chave)
  }
}

export const cache = {
  ler<T>(chave: string): T | undefined {
    return valores.get(chave) as T | undefined
  },

  gravar<T>(chave: string, valor: T): void {
    valores.set(chave, valor)
    podar()
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
 * ---------------------------------------------------------------
 * Por que este mapa é MAIS ESTREITO que `AFETADOS_POR_AGENDAMENTO`
 * ---------------------------------------------------------------
 * Os dois já foram a mesma lista, e essa era a causa da tempestade.
 *
 * A lista larga nasceu no tempo do canal local, quando quem avisava era
 * o próprio código: uma gravação publicava UM evento, e cabia a ele
 * dizer tudo o que aquilo afetava em cascata.
 *
 * Com Postgres, quem avisa é o banco — **uma vez por tabela que
 * realmente mudou**. Concluir um atendimento mexe em `agendamentos`,
 * `lancamentos`, `movimentos_caixa`, `pontos`, `produtos` e
 * `procedimentos`, e o Postgres manda seis avisos, um para cada. Cada
 * um já invalida a sua própria área.
 *
 * Repetir a cascata aqui virava multiplicação: os seis avisos
 * invalidavam doze prefixos cada, e o painel — com dez consultas
 * montadas — refazia dezenas de leituras para uma ação só. No celular,
 * é a tela congelando a cada clique.
 *
 * Aqui fica só o que a mudança da tabela realmente torna velho. A
 * cascata continua existindo onde ela é necessária e barata:
 * `AFETADOS_POR_AGENDAMENTO`, usado por quem GRAVA, para a tela de quem
 * clicou responder na hora sem esperar a volta do servidor.
 */
export const CHAVES_POR_COLECAO: Record<string, string[]> = {
  agendamentos: [CHAVES.agenda, CHAVES.painel, CHAVES.horarios],
  bloqueios: [CHAVES.bloqueios, CHAVES.horarios, CHAVES.agenda],
  reservas: [CHAVES.reservas, CHAVES.horarios],
  solicitacoes: [CHAVES.solicitacoes, CHAVES.notificacoes],
  listaEspera: [CHAVES.espera, CHAVES.notificacoes],
  servicos: [CHAVES.servicos, CHAVES.horarios],
  categorias: [CHAVES.categorias, CHAVES.servicos],
  clientes: [CHAVES.clientes],
  profissionais: [CHAVES.equipe, CHAVES.horarios],
  jornada: [CHAVES.jornada, CHAVES.horarios],
  studio: [CHAVES.studio, CHAVES.horarios],
  produtos: [CHAVES.produtos],
  movimentos: [CHAVES.produtos],
  lancamentos: [CHAVES.financeiro, CHAVES.painel],
  metas: [CHAVES.metas, CHAVES.painel],
  caixas: [CHAVES.caixa],
  movimentosCaixa: [CHAVES.caixa],
  cupons: [CHAVES.cupons],
  pontos: [CHAVES.fidelidade],
  fidelidade: [CHAVES.fidelidade],
  lembretes: [CHAVES.lembretes],
  notificacoes: [CHAVES.notificacoes],
  modelosMensagem: [CHAVES.modelos],
  procedimentos: [CHAVES.procedimentos],
}
