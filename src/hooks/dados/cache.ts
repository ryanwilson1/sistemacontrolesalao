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

import { diagnostico } from '@/services/diagnostico'

type Ouvinte = () => void

const valores = new Map<string, unknown>()
const ouvintes = new Map<string, Set<Ouvinte>>()

/**
 * A idade de cada chave.
 *
 * ---------------------------------------------------------------
 * O furo que isto fecha
 * ---------------------------------------------------------------
 * `useConsulta` já tinha um contador de geração — mas **por
 * componente**. Ele impede que a resposta antiga escreva na tela
 * daquele componente, e não impede o pior caso:
 *
 *   a tela de Agenda monta e dispara a busca A
 *   ↓
 *   a proprietária toca em Clientes — a Agenda DESMONTA
 *   ↓
 *   um evento do Realtime invalida `agenda:...`
 *   ↓
 *   a busca A aterrissa e chama `cache.gravar` do mesmo jeito
 *
 * O componente morreu, então ninguém checou geração nenhuma; e
 * `cache.gravar` acorda TODOS os inscritos daquela chave. O estado
 * anterior à invalidação volta para o cache e, dali, para qualquer tela
 * que abrir a Agenda em seguida. Sem erro, sem rastro.
 *
 * A marca resolve na raiz: quem começa uma busca anota a marca da chave
 * naquele instante e só tem permissão de gravar se ela não mudou. Os
 * números são de um relógio global e **nunca se repetem**, então uma
 * chave descartada pela poda (marca ausente = 0) jamais coincide com uma
 * marca capturada antes.
 *
 * `era` cobre o `limpar()` do logout: ali as marcas somem todas de uma
 * vez, e sem um segundo componente a busca iniciada antes do logout —
 * cuja chave nunca tinha sido invalidada, marca 0 — voltaria a valer.
 */
let relogioDeVersao = 0
let era = 0
const versoes = new Map<string, number>()

function envelhecer(chave: string): void {
  versoes.set(chave, ++relogioDeVersao)
}

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
    /*
      A marca sai junto. Pode: os números do relógio nunca se repetem,
      então a ausência (0) não coincide com nenhuma marca capturada por
      uma busca ainda no ar — e o efeito de não coincidir é recusar a
      gravação, que é o lado seguro.
    */
    versoes.delete(chave)
  }
}

/**
 * O mapa de versões também precisa de teto.
 *
 * Ele cresce por invalidação, não por consulta: uma manhã de gravações
 * com o Realtime ativo cria centenas de entradas de chaves que ninguém
 * mais lê. O corte só acontece quando o mapa passa do dobro do teto de
 * valores, e só remove chave sem valor guardado e sem tela escutando.
 */
function podarVersoes(): void {
  if (versoes.size <= TETO * 2) return

  for (const chave of versoes.keys()) {
    if (versoes.size <= TETO) break
    /*
      Buscas em voo também ficam protegidas: podar a versão de uma chave
      cuja busca ainda está no ar devolveria a marca ao zero — e uma
      resposta capturada antes de qualquer invalidação voltaria a passar
      na comparação. É um caso raríssimo (exigiria centenas de
      invalidações durante uma única busca), mas custa uma verificação.
    */
    if (valores.has(chave) || ouvintes.has(chave) || emAndamento.has(chave)) continue
    versoes.delete(chave)
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

  /**
   * A marca da chave agora. Guarde-a antes de começar a busca e
   * devolva-a a `gravarSe` quando a resposta chegar.
   */
  marcaDe(chave: string): string {
    return `${era}:${versoes.get(chave) ?? 0}`
  },

  /**
   * Grava **se a resposta ainda valer**.
   *
   * Devolve `false` quando a chave envelheceu entre o início da busca e
   * a chegada dela — uma invalidação, um logout. Nesse caso nada é
   * escrito e ninguém é acordado: a resposta é antiga, e o único
   * destino honesto de um dado antigo é o silêncio.
   */
  gravarSe<T>(chave: string, valor: T, marca: string): boolean {
    if (this.marcaDe(chave) !== marca) {
      diagnostico.contar('respostasDescartadas')
      return false
    }
    this.gravar(chave, valor)
    return true
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
    /*
      As chaves em voo entram no conjunto ANTES de serem soltas.

      ---------------------------------------------------------------
      O furo que o teste com o hook real encontrou
      ---------------------------------------------------------------
      O envelhecimento acontecia só para chaves com valor guardado ou
      com tela escutando. Há um terceiro estado, e é exatamente o do
      cenário perigoso: a busca partiu (está em `emAndamento`), nada
      foi gravado ainda, e a tela já desmontou.

      A sequência real:

        a Agenda monta → busca parte → captura a marca
        ↓
        a proprietária troca de tela (ouvinte cancelado)
        ↓
        o Realtime invalida 'agenda' — mas a chave não está em
        `valores` nem em `ouvintes`, então NÃO envelhecia
        ↓
        a busca aterrissa, a marca confere, e o estado ANTIGO entra
        no cache por cima do novo

      Que é literalmente o bug que a marca existe para impedir. A
      correção é uma linha: quem está em voo também envelhece.
    */
    const chaves = new Set([
      ...valores.keys(),
      ...ouvintes.keys(),
      ...emAndamento.keys(),
    ])

    for (const chave of [...emAndamento.keys()]) {
      if (prefixos.some((prefixo) => chave.startsWith(prefixo))) {
        emAndamento.delete(chave)
      }
    }

    for (const chave of chaves) {
      if (!prefixos.some((prefixo) => chave.startsWith(prefixo))) continue

      valores.delete(chave)
      /*
        Envelhecer ANTES de acordar os inscritos.

        Quem acorda dispara uma busca nova e captura a marca na hora; se
        o envelhecimento viesse depois, a busca nova nasceria com a marca
        velha e seria recusada por si mesma na volta.
      */
      envelhecer(chave)
      ouvintes.get(chave)?.forEach((avisar) => avisar())
    }

    podarVersoes()
    diagnostico.contar('invalidacoes')
  },

  limpar(): void {
    valores.clear()
    emAndamento.clear()
    /*
      Era nova: toda busca iniciada antes do logout perde o direito de
      gravar, inclusive as de chaves que nunca tinham sido invalidadas.
      Sem isto, a consulta que a proprietária deixou no ar ao sair
      aterrissaria no cache já com a Samara na tela.
    */
    era += 1
    versoes.clear()
    ouvintes.forEach((conjunto) => conjunto.forEach((avisar) => avisar()))
  },

  /** Retrato para o diagnóstico. Não usado pela interface. */
  medir(): { valores: number; ouvintes: number; emVoo: number; versoes: number } {
    let total = 0
    for (const conjunto of ouvintes.values()) total += conjunto.size
    return {
      valores: valores.size,
      ouvintes: total,
      emVoo: emAndamento.size,
      versoes: versoes.size,
    }
  },
}

diagnostico.observar('cache', () => cache.medir())

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
