import type { Registro } from './entidades'

/** Cupons de desconto. */

export type TipoDesconto = 'percentual' | 'fixo'

export interface Cupom extends Registro {
  codigo: string
  descricao: string
  tipo: TipoDesconto
  /** Percentual (0–100) ou valor em reais, conforme o tipo. */
  valor: number

  validoDe: string
  validoAte: string

  /** Zero significa sem limite. */
  limiteUsos: number
  usos: number

  /** Vazio significa que vale para qualquer serviço. */
  servicosIds: string[]
  /** Valor mínimo do atendimento para o cupom valer. */
  valorMinimo: number
  /** Teto do desconto em cupons percentuais. Zero é sem teto. */
  descontoMaximo: number

  ativo: boolean
}

export interface UsoCupom extends Registro {
  cupomId: string
  codigo: string
  clienteId: string | null
  agendamentoId: string | null
  valorOriginal: number
  valorDesconto: number
  valorFinal: number
}

/** Por que um cupom não pôde ser aplicado. Vira mensagem na tela. */
export type MotivoRecusa =
  | 'inexistente' | 'inativo' | 'expirado' | 'ainda_nao_vale'
  | 'esgotado' | 'servico_nao_incluso' | 'valor_insuficiente'

export interface ResultadoCupom {
  valido: boolean
  motivo: MotivoRecusa | null
  cupom: Cupom | null
  valorDesconto: number
  valorFinal: number
}
