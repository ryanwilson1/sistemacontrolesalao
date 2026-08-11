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
  agenda: 'Profissional (só agenda)',
}

/** Quem enxerga financeiro, metas e configurações. */
export const PAPEIS_GESTORES: Papel[] = ['proprietaria', 'gerente']

/**
 * Quem só enxerga a agenda.
 *
 * A lista existe em vez de uma comparação solta com a string `'agenda'`
 * pelo mesmo motivo de `PAPEIS_GESTORES`: no dia em que houver um
 * segundo nível restrito, ele entra aqui e todas as telas obedecem —
 * em vez de aparecer meia dúzia de `papel === 'agenda'` espalhados,
 * dos quais um sempre fica para trás.
 */
export const PAPEIS_SO_AGENDA: Papel[] = ['agenda']

/** Acesso restrito à agenda? */
export const ehSoAgenda = (papel: Papel): boolean => PAPEIS_SO_AGENDA.includes(papel)

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

/* ------------------------------------------------------------------ */
/* Caixa                                                               */
/* ------------------------------------------------------------------ */

export const FORMAS_PAGAMENTO: FormaPagamento[] = [
  'dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'outro',
]

/**
 * Quais formas de pagamento mexem no dinheiro da gaveta.
 *
 * Só dinheiro. Pix e cartão entram no faturamento e não passam pela
 * gaveta — a maquininha e a conta recebem por fora.
 *
 * A distinção decide o fechamento do dia. Uma venda de R$ 150 paga com
 * R$ 100 no Pix e R$ 50 em espécie faz o faturamento subir R$ 150 e a
 * gaveta subir R$ 50. Somar tudo faria a proprietária procurar R$ 100
 * que nunca estiveram ali — todo santo dia, no fim do expediente.
 *
 * Mora aqui, e não escondida dentro do repositório, porque é regra de
 * negócio: precisa poder ser lida por quem for entendê-la e coberta
 * por teste. Enquanto estava privada, nenhuma das duas coisas era
 * possível.
 */
export const AFETA_GAVETA: FormaPagamento[] = ['dinheiro']
