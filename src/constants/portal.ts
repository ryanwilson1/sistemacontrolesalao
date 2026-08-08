/** Valores fixos do Portal de Agendamento. */

export const PORTAL = {
  /** Quanto tempo o horário fica preso enquanto a cliente preenche. */
  reservaMinutosPadrao: 5,

  /**
   * De quanto em quanto tempo a tela varre reservas vencidas.
   *
   * Eram doze segundos, herdados do tempo em que a varredura era uma
   * função local e de graça. Com banco ela virou uma requisição — e
   * doze segundos significa cinco chamadas por minuto de CADA celular
   * com o link aberto. Num sábado com trinta pessoas escolhendo
   * horário, são 150 requisições por minuto para uma tarefa que só
   * precisa acontecer antes de alguém desistir de esperar.
   *
   * Sessenta segundos continua devolvendo o horário rápido: a reserva
   * dura cinco minutos, e a grade também se atualiza a cada troca de
   * dia e a cada erro de reserva.
   */
  varreduraMs: 60_000,

  /** Ritmo do relógio regressivo mostrado para a cliente. */
  contagemMs: 1_000,

  /** Quantos dias o portal mostra de uma vez na tira de datas. */
  diasNaTira: 21,

  /** Depois de avisada, quanto tempo a cliente da lista de espera tem. */
  esperaHorasParaResponder: 3,

  /** Teto de mensagens disparadas de uma vez pela lista de espera. */
  esperaMaximoAvisos: 12,
} as const

/**
 * Antecedência dos lembretes automáticos, em horas.
 * A ordem importa: é a ordem em que aparecem na tela de lembretes.
 */
export const LEMBRETES_DO_PORTAL = [
  { tipo: 'lembrete_24h', horas: 24 },
  { tipo: 'lembrete_2h', horas: 2 },
] as const

/** Faixas do dia usadas pela lista de espera. */
export const FAIXAS_DO_DIA = {
  manha: { de: 0, ate: 12 },
  tarde: { de: 12, ate: 24 },
  qualquer: { de: 0, ate: 24 },
} as const
