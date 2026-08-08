import type { Intencao, Interpretacao, InterpretadorDePerguntas } from './tipos'

/**
 * Interpretação local, por palavras-chave.
 *
 * Sem modelo de linguagem: cada intenção tem termos que a indicam, e a
 * que reunir mais sinais vence. É simples de propósito — resolve as
 * perguntas do dia a dia do studio e não depende de nada externo.
 */

interface Regra {
  intencao: Intencao
  /** Termos que apontam para esta intenção. */
  termos: string[]
  /** Termos que praticamente confirmam. Valem o dobro. */
  fortes?: string[]
  /** Se algum aparecer, esta regra é descartada. */
  exclui?: string[]
}

const REGRAS: Regra[] = [
  {
    intencao: 'faturamento_hoje',
    fortes: ['quanto vendi hoje', 'faturamento de hoje', 'quanto entrou hoje'],
    termos: ['quanto', 'vendi', 'faturei', 'faturamento', 'receita', 'entrou', 'hoje', 'caixa'],
    exclui: ['mes', 'mês', 'semana', 'ontem', 'profissional', 'quem'],
  },
  {
    intencao: 'faturamento_periodo',
    fortes: ['faturamento do mes', 'faturamento do mês', 'quanto faturei no mes'],
    termos: ['quanto', 'faturei', 'faturamento', 'receita', 'mes', 'mês', 'semana', 'periodo', 'período'],
    exclui: ['quem', 'profissional'],
  },
  {
    intencao: 'profissional_destaque',
    fortes: ['quem mais faturou', 'profissional destaque', 'qual profissional'],
    termos: ['quem', 'profissional', 'faturou', 'destaque', 'melhor', 'atendeu', 'mais'],
  },
  {
    intencao: 'servico_mais_vendido',
    fortes: ['servico mais vendido', 'serviço mais vendido', 'qual servico vende'],
    termos: ['servico', 'serviço', 'vendido', 'procurado', 'popular', 'mais'],
  },
  {
    intencao: 'horarios_livres',
    fortes: ['horarios livres', 'horários livres', 'tem vaga', 'agenda livre'],
    termos: ['horario', 'horário', 'livre', 'vago', 'vaga', 'disponivel', 'disponível', 'amanha', 'amanhã'],
  },
  {
    intencao: 'clientes_sumidas',
    fortes: ['nao retorna', 'não retorna', 'ha mais tempo sem', 'há mais tempo sem', 'sumiu'],
    termos: ['cliente', 'retorna', 'retorno', 'tempo', 'sem', 'voltou', 'sumida', 'antiga'],
  },
  {
    intencao: 'produto_acabando',
    fortes: ['produto acabando', 'estoque baixo', 'preciso repor'],
    termos: ['produto', 'estoque', 'acabando', 'repor', 'falta', 'comprar', 'baixo'],
    exclui: ['vencendo', 'validade', 'vencer'],
  },
  {
    intencao: 'produto_vencendo',
    fortes: ['produto vencendo', 'perto do vencimento', 'validade'],
    termos: ['produto', 'vencendo', 'vencer', 'validade', 'vencimento'],
  },
  {
    intencao: 'aniversariantes',
    fortes: ['faz aniversario', 'faz aniversário', 'aniversariantes'],
    termos: ['aniversario', 'aniversário', 'niver', 'nasceu', 'semana', 'hoje'],
  },
  {
    intencao: 'cancelamentos',
    fortes: ['cancelamentos hoje', 'quais cancelamentos', 'quantos cancelaram'],
    termos: ['cancelamento', 'cancelou', 'cancelaram', 'cancelado', 'desmarcou'],
    exclui: ['quem sempre', 'frequencia', 'frequência'],
  },
  {
    intencao: 'clientes_faltosas',
    fortes: ['cancelam com frequencia', 'cancelam com frequência', 'quem mais falta'],
    termos: ['cliente', 'falta', 'faltou', 'cancelam', 'frequencia', 'frequência', 'sempre'],
  },
  {
    intencao: 'ticket_medio',
    fortes: ['ticket medio', 'ticket médio', 'media por atendimento'],
    termos: ['ticket', 'medio', 'médio', 'media', 'média', 'atendimento'],
  },
  {
    intencao: 'agenda_do_dia',
    fortes: ['agenda de hoje', 'quantos atendimentos hoje', 'quem vem hoje'],
    termos: ['agenda', 'atendimento', 'hoje', 'quem', 'vem', 'marcado'],
  },
  {
    intencao: 'agenda_dia_semana',
    fortes: [
      'agenda de sexta', 'agenda de segunda', 'agenda de terca', 'agenda de terça',
      'agenda de quarta', 'agenda de quinta', 'agenda de sabado', 'agenda de sábado',
      'agenda de domingo', 'mostrar agenda de',
    ],
    termos: ['agenda', 'mostrar', 'ver', 'segunda', 'terca', 'terça', 'quarta', 'quinta', 'sexta', 'sabado', 'sábado', 'domingo'],
  },
  {
    intencao: 'faltas_periodo',
    fortes: ['quem faltou', 'quem nao veio', 'quem não veio', 'faltas da semana'],
    termos: ['faltou', 'faltaram', 'falta', 'nao veio', 'não veio', 'ausencia', 'ausência', 'semana', 'quem'],
    exclui: ['cancelam com', 'frequencia', 'frequência'],
  },
  {
    intencao: 'pedidos_do_portal',
    fortes: ['pedido de alteracao', 'pedido de alteração', 'pedidos do portal', 'alguem pediu para remarcar', 'alguém pediu para remarcar'],
    termos: ['pedido', 'pedidos', 'solicitacao', 'solicitação', 'portal', 'link', 'remarcar', 'aguardando', 'espera'],
  },
  {
    intencao: 'resumo_geral',
    fortes: ['como esta o studio', 'como está o studio', 'resumo', 'como foi o dia'],
    termos: ['resumo', 'geral', 'situacao', 'situação', 'como', 'studio', 'panorama'],
  },
  {
    intencao: 'ajuda',
    fortes: ['o que voce faz', 'o que você faz', 'me ajuda', 'o que posso perguntar'],
    termos: ['ajuda', 'ajudar', 'pode', 'consegue', 'perguntar', 'exemplo'],
  },
]

/** Tira acento e pontuação para a comparação não depender de digitação. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export class InterpretadorLocal implements InterpretadorDePerguntas {
  readonly nome = 'Local (palavras-chave)'
  readonly remoto = false

  async interpretar(pergunta: string): Promise<Interpretacao> {
    const texto = normalizar(pergunta)
    if (!texto) {
      return { intencao: 'desconhecida', confianca: 0, pistas: [], parametros: {} }
    }

    let melhor: { regra: Regra; pontos: number; pistas: string[] } | null = null

    for (const regra of REGRAS) {
      if (regra.exclui?.some((termo) => texto.includes(normalizar(termo)))) continue

      const pistas: string[] = []
      let pontos = 0

      for (const forte of regra.fortes ?? []) {
        if (texto.includes(normalizar(forte))) {
          pontos += 4
          pistas.push(forte)
        }
      }

      for (const termo of regra.termos) {
        if (texto.includes(normalizar(termo))) {
          pontos += 1
          pistas.push(termo)
        }
      }

      if (pontos > 0 && (!melhor || pontos > melhor.pontos)) {
        melhor = { regra, pontos, pistas }
      }
    }

    if (!melhor) {
      return { intencao: 'desconhecida', confianca: 0, pistas: [], parametros: {} }
    }

    // Normaliza a pontuação: 4 pontos já é uma leitura confiante.
    const confianca = Math.min(melhor.pontos / 4, 1)

    return {
      intencao: melhor.regra.intencao,
      confianca,
      pistas: melhor.pistas.slice(0, 4),
      parametros: extrairParametros(texto),
    }
  }
}

/** Nomes de dia como as pessoas escrevem, já sem acento. */
const DIAS: [string, number][] = [
  ['domingo', 0], ['segunda', 1], ['terca', 2], ['quarta', 3],
  ['quinta', 4], ['sexta', 5], ['sabado', 6],
]

/** Pega recortes de tempo mencionados na pergunta. */
function extrairParametros(texto: string): Record<string, string | number> {
  const parametros: Record<string, string | number> = {}

  if (texto.includes('amanha')) parametros.dia = 'amanha'
  else if (texto.includes('ontem')) parametros.dia = 'ontem'
  else if (texto.includes('hoje')) parametros.dia = 'hoje'

  // "Agenda de sexta" quase sempre quer dizer a próxima sexta, não a
  // que passou — quem pergunta está se organizando, não conferindo.
  const encontrado = DIAS.find(([nome]) => texto.includes(nome))
  if (encontrado) parametros.diaSemana = encontrado[1]

  if (texto.includes('semana')) parametros.periodo = 'semana'
  else if (texto.includes('mes')) parametros.periodo = 'mes'
  else if (texto.includes('ano')) parametros.periodo = 'ano'

  const numero = texto.match(/\b(\d{1,3})\b/)
  if (numero) parametros.numero = Number(numero[1])

  return parametros
}

/**
 * PRÓXIMA ETAPA — o interpretador em uso.
 *
 * Com um modelo de linguagem, basta:
 *
 *   export const interpretador = new InterpretadorRemoto(chave)
 *
 * A busca de dados não muda: é ela que garante que a resposta venha dos
 * números reais, e não de invenção do modelo.
 */
export const interpretador: InterpretadorDePerguntas = new InterpretadorLocal()
