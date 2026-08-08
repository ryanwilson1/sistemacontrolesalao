/** Formas usadas em várias telas, sem vínculo com uma entidade específica. */

export interface Pagina<T> {
  itens: T[]
  total: number
  pagina: number
  porPagina: number
}

export interface Periodo {
  de: string
  ate: string
}

export interface Horario {
  inicio: string
  fim: string
}

export interface ResumoDoDia {
  data: string
  atendimentos: number
  cancelados: number
  clientes: number
  faturamentoPrevisto: number
  faturamentoDoMes: number
  metaDoMes: number | null
  estoqueBaixo: { id: string; nome: string; quantidade: number; minimo: number; unidade: string }[]
  aniversariantes: { id: string; nome: string; telefone: string | null; nascimento: string }[]
  proximos: AgendamentoResumido[]
  serieFaturamento: { dia: string; valor: number }[]
}

export interface AgendamentoResumido {
  id: string
  inicio: string
  fim: string
  situacao: string
  cliente: string | null
  clienteId: string | null
  servico: string
  cor: string | null
  profissional: string
}

/** Só o que o formulário precisa saber sobre uma opção de seleção. */
export interface Opcao {
  valor: string
  rotulo: string
}
