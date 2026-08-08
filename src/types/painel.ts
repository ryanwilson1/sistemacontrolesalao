/** Indicadores do painel. Todos derivados, nenhum guardado. */

export interface IndicadorPeriodo {
  hoje: number
  semana: number
  mes: number
}

export interface Destaque {
  id: string
  nome: string
  valor: number
  detalhe: string
}

export interface FaixaHorario {
  hora: number
  atendimentos: number
}

export interface PainelCompleto {
  data: string

  agendamentos: IndicadorPeriodo
  faturamento: IndicadorPeriodo

  clientesNovos: number
  clientesRecorrentes: number
  horariosLivresHoje: number
  cancelamentos: IndicadorPeriodo
  faltas: number

  ticketMedio: number
  faturamentoEstimadoMes: number
  metaDoMes: number | null

  profissionalDestaque: Destaque | null
  servicoMaisVendido: Destaque | null
  horariosMovimentados: FaixaHorario[]

  taxaOcupacao: number
  taxaCancelamento: number

  /* Vindos dos procedimentos e do estoque */
  duracaoMediaAtendimento: number
  lucroDoMes: number
  produtosMaisUsados: { nome: string; quantidade: number }[]
  produtosVencendo: number
  valorEmEstoque: number
}
