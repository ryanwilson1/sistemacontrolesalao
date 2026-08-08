/**
 * Assistente do studio.
 *
 * A pergunta passa por duas etapas: entender o que se quer (intenção) e
 * buscar a resposta nos dados. As duas são portas separadas — hoje a
 * interpretação é local, por palavras-chave; quando houver um modelo de
 * linguagem, só o interpretador muda. A busca de dados continua igual,
 * e é ela que garante que a resposta venha dos números reais do studio.
 */

export type Intencao =
  | 'faturamento_hoje'
  | 'faturamento_periodo'
  | 'profissional_destaque'
  | 'servico_mais_vendido'
  | 'horarios_livres'
  | 'clientes_sumidas'
  | 'produto_acabando'
  | 'produto_vencendo'
  | 'aniversariantes'
  | 'cancelamentos'
  | 'clientes_faltosas'
  | 'ticket_medio'
  | 'agenda_do_dia'
  | 'agenda_dia_semana'
  | 'faltas_periodo'
  | 'pedidos_do_portal'
  | 'resumo_geral'
  | 'ajuda'
  | 'desconhecida'

export interface Interpretacao {
  intencao: Intencao
  /** Grau de certeza, de 0 a 1. Abaixo de 0.4 pedimos para reformular. */
  confianca: number
  /** Trechos que levaram a esta leitura. Exibidos quando há dúvida. */
  pistas: string[]
  parametros: Record<string, string | number>
}

/** Um dado destacado dentro da resposta. */
export interface Destaque {
  rotulo: string
  valor: string
  detalhe?: string
}

export interface Resposta {
  texto: string
  destaques: Destaque[]
  /** Para onde ir para ver mais. */
  destino: string | null
  rotuloDestino: string | null
  intencao: Intencao
}

/** A PORTA da interpretação. */
export interface InterpretadorDePerguntas {
  readonly nome: string
  readonly remoto: boolean
  interpretar(pergunta: string): Promise<Interpretacao>
}

export interface Mensagem {
  id: string
  autor: 'pessoa' | 'assistente'
  texto: string
  resposta?: Resposta
  em: string
}
