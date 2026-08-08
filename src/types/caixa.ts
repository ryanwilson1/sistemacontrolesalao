import type { FormaPagamento, Registro } from './entidades'

/**
 * Caixa diário.
 *
 * Fluxo: abrir com um valor de troco, registrar entradas e saídas ao
 * longo do dia, fechar conferindo o que há na gaveta contra o que o
 * sistema esperava.
 */

export type SituacaoCaixa = 'aberto' | 'fechado'

export type OrigemMovimento =
  | 'atendimento' | 'venda' | 'suprimento' | 'sangria' | 'despesa' | 'ajuste'

export interface MovimentoCaixa extends Registro {
  caixaId: string
  tipo: 'entrada' | 'saida'
  origem: OrigemMovimento
  descricao: string
  valor: number
  forma: FormaPagamento
  agendamentoId: string | null
  procedimentoId: string | null
  profissionalId: string | null
}

export interface Caixa extends Registro {
  /** Dia de referência, em AAAA-MM-DD. Um caixa por dia. */
  data: string
  situacao: SituacaoCaixa

  abertoEm: string
  abertoPorId: string
  valorAbertura: number

  fechadoEm: string | null
  fechadoPorId: string | null
  /** Quanto havia de fato na gaveta no fechamento. */
  valorInformado: number | null
  /** Diferença entre o contado e o esperado. Negativo = falta. */
  diferenca: number | null

  observacoes: string | null
}

/** Resumo consolidado do dia, calculado a partir das movimentações. */
export interface ResumoCaixa {
  entradas: number
  saidas: number
  saldoEsperado: number
  porForma: Record<FormaPagamento, number>
  atendimentos: number
  ticketMedio: number
}
