import type { Registro } from './entidades'

/**
 * Histórico de procedimentos.
 *
 * Um agendamento é o compromisso; um procedimento é o que realmente
 * aconteceu. Separar os dois permite registrar o que foi feito sem
 * contaminar a agenda — e é o que dá à cliente uma ficha de evolução
 * de verdade.
 */

export interface ProdutoConsumido {
  produtoId: string
  nome: string
  quantidade: number
  unidade: string
  /** Custo no momento do uso. Guardado para a margem não mudar depois. */
  custoUnitario: number
}

export type MomentoFoto = 'antes' | 'depois' | 'processo'

/**
 * Foto de acompanhamento.
 *
 * `conteudo` guarda a imagem em base64 enquanto não há servidor. Quando
 * o Supabase Storage entrar, o campo vira `url` e só o serviço de fotos
 * muda — a ficha da cliente continua igual.
 */
export interface Foto extends Registro {
  procedimentoId: string
  clienteId: string
  momento: MomentoFoto
  conteudo: string | null
  url: string | null
  legenda: string | null
  largura: number | null
  altura: number | null
  tamanhoBytes: number
}

export interface Procedimento extends Registro {
  agendamentoId: string | null
  clienteId: string
  profissionalId: string
  servicoId: string

  /** Quando aconteceu de fato — pode diferir do horário marcado. */
  realizadoEm: string
  duracaoMinutos: number

  valor: number
  desconto: number
  valorFinal: number

  produtos: ProdutoConsumido[]
  observacoes: string | null
  /** Recomendações de cuidado passadas à cliente. */
  recomendacoes: string | null
  /** Combinado para a próxima visita: retoque, manutenção, cor. */
  proximoPasso: string | null

  /** Preenchido pela ficha ao carregar as fotos vinculadas. */
  fotos?: Foto[]
}

/** Custo dos produtos consumidos. Base do lucro real do atendimento. */
export const custoDoProcedimento = (procedimento: Procedimento): number =>
  procedimento.produtos.reduce((soma, p) => soma + p.quantidade * p.custoUnitario, 0)

/** Margem do atendimento, já descontando produto. */
export const margemDoProcedimento = (procedimento: Procedimento): number =>
  procedimento.valorFinal - custoDoProcedimento(procedimento)
