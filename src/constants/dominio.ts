import type {
  FormaPagamento, Papel, SituacaoAgendamento, SituacaoLancamento, TipoBloqueio, TipoMovimento,
} from '@/types'

/** Rótulo, cor e ponto de cada situação do agendamento. */
export const SITUACAO: Record<
  SituacaoAgendamento,
  { rotulo: string; classe: string; ponto: string }
> = {
  pendente:       { rotulo: 'Aguardando',     classe: 'bg-ouro-100 text-ouro-700 border-ouro-200',          ponto: 'bg-ouro-500' },
  confirmado:     { rotulo: 'Confirmado',     classe: 'bg-quartzo-100 text-quartzo-700 border-quartzo-200', ponto: 'bg-quartzo-500' },
  em_atendimento: { rotulo: 'Em atendimento', classe: 'bg-onix-100 text-onix-700 border-onix-200',          ponto: 'bg-onix-500' },
  concluido:      { rotulo: 'Concluído',      classe: 'bg-[#E8F0EA] text-[#3D6250] border-[#CFE0D5]',       ponto: 'bg-sucesso' },
  cancelado:      { rotulo: 'Cancelado',      classe: 'bg-onix-50 text-onix-400 border-onix-100',           ponto: 'bg-onix-300' },
  faltou:         { rotulo: 'Não compareceu', classe: 'bg-[#F7E9EA] text-[#8C3F45] border-[#EBD2D4]',       ponto: 'bg-perigo' },
  solicitou_alteracao:    { rotulo: 'Pediu alteração',    classe: 'bg-ouro-100 text-ouro-700 border-ouro-300',      ponto: 'bg-ouro-400' },
  solicitou_cancelamento: { rotulo: 'Pediu cancelamento', classe: 'bg-[#F7E9EA] text-[#8C3F45] border-[#EBD2D4]',   ponto: 'bg-perigo' },
}

/** Situações que nasceram de um pedido da cliente e esperam decisão. */
export const AGUARDA_DECISAO: SituacaoAgendamento[] = [
  'solicitou_alteracao', 'solicitou_cancelamento',
]

export const PAPEL: Record<Papel, string> = {
  proprietaria: 'Proprietária',
  gerente: 'Gerente',
  profissional: 'Profissional',
  recepcao: 'Recepção',
}

/** Quem enxerga financeiro, metas e configurações. */
export const PAPEIS_GESTORES: Papel[] = ['proprietaria', 'gerente']

export const FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferência',
  outro: 'Outro',
}

export const TIPO_BLOQUEIO: Record<TipoBloqueio, { rotulo: string; diaInteiro: boolean }> = {
  bloqueio: { rotulo: 'Bloqueio de horário', diaInteiro: false },
  almoco:   { rotulo: 'Almoço extra',        diaInteiro: false },
  folga:    { rotulo: 'Folga',               diaInteiro: true },
  ferias:   { rotulo: 'Férias',              diaInteiro: true },
  feriado:  { rotulo: 'Feriado',             diaInteiro: true },
  pausa:    { rotulo: 'Pausa',               diaInteiro: false },
  encaixe:  { rotulo: 'Guardado para encaixe', diaInteiro: false },
}

/**
 * Bloqueios que valem só para o portal.
 *
 * O encaixe some do link e continua marcável pelo painel — é o
 * intervalo que a proprietária segura para a cliente antiga que liga em
 * cima da hora, e que nunca coube num campo de sistema nenhum.
 */
export const SO_BLOQUEIA_O_PORTAL: TipoBloqueio[] = ['encaixe']

export const TIPO_MOVIMENTO: Record<TipoMovimento, { rotulo: string; soma: boolean }> = {
  entrada: { rotulo: 'Entrada', soma: true },
  ajuste:  { rotulo: 'Ajuste',  soma: true },
  saida:   { rotulo: 'Saída',   soma: false },
  consumo: { rotulo: 'Consumo', soma: false },
  perda:   { rotulo: 'Perda',   soma: false },
}

export const SITUACAO_LANCAMENTO: Record<SituacaoLancamento, string> = {
  previsto: 'Previsto',
  pago: 'Pago',
  recebido: 'Recebido',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
}

/** Lançamento já quitado? */
export const QUITADO: SituacaoLancamento[] = ['pago', 'recebido']

/**
 * Agendamento que ocupa espaço na agenda?
 *
 * Quem pediu alteração ou cancelamento continua ocupando: o pedido é
 * uma intenção, e liberar o horário antes da decisão significaria
 * entregá-lo a outra cliente enquanto a proprietária ainda pensa.
 */
export const OCUPA_HORARIO: SituacaoAgendamento[] = [
  'pendente', 'confirmado', 'em_atendimento', 'concluido',
  'solicitou_alteracao', 'solicitou_cancelamento',
]

export const DIAS_SEMANA = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
] as const

export const UNIDADES = ['un', 'ml', 'L', 'g', 'kg', 'cx', 'pct'] as const
