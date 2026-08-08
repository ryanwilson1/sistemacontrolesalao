/** Valores fixos do produto. Mudou aqui, mudou no sistema inteiro. */

export const APP = {
  nome: 'System Studio',
  versao: '2.0.0',
  monograma: 'eb',
} as const

/** Faixa exibida na grade da agenda. */
export const GRADE_AGENDA = {
  horaInicio: 7,
  horaFim: 22,
  alturaHora: 68,
  passoArrastoMinutos: 15,
} as const

export const PAGINACAO = {
  clientesPorPagina: 24,
  linhasEmRelatorio: 120,
} as const

export const FORMULARIO = {
  atrasoBuscaMs: 300,
  limiteNome: 120,
  limiteObservacao: 2000,
  limiteDescricao: 1000,
} as const

/** Cores oferecidas para serviços e profissionais, tiradas da paleta. */
export const CORES_DISPONIVEIS = [
  '#C98F98', '#B08A3E', '#8E5A65', '#4F7A62', '#6B5B5E', '#B0737E',
] as const
