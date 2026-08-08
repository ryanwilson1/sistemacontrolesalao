import { OCUPA_HORARIO } from '@/constants'
import { ErroDeRegra } from '@/utils/erros'
import type { Agendamento, Bloqueio, ReservaTemporaria, Servico } from '@/types'

/**
 * Regras da agenda.
 *
 * Ficam aqui, e não dentro dos componentes, por dois motivos: a mesma
 * verificação vale para o painel e para o link público, e quando o
 * armazenamento local entrar, estas funções seguem valendo sem mudança.
 */

/** Duas faixas de tempo se cruzam? */
export const sobrepoe = (
  inicioA: string | Date, fimA: string | Date,
  inicioB: string | Date, fimB: string | Date,
): boolean =>
  new Date(inicioA).getTime() < new Date(fimB).getTime() &&
  new Date(fimA).getTime() > new Date(inicioB).getTime()

/** O agendamento ainda ocupa espaço na grade? */
export const estaAtivo = (a: Agendamento): boolean => OCUPA_HORARIO.includes(a.situacao)

/**
 * Calcula o fim a partir do serviço. O horário final nunca é digitado:
 * ele é sempre consequência da duração cadastrada.
 */
export function calcularFim(inicio: string, servico: Servico): string {
  const minutos = servico.duracaoMinutos + servico.intervaloMinutos
  return new Date(new Date(inicio).getTime() + minutos * 60_000).toISOString()
}

/**
 * Impede dois atendimentos no mesmo profissional ao mesmo tempo.
 *
 * No projeto anterior isto era uma constraint do PostgreSQL. Sem banco,
 * a checagem passa a ser aqui — sempre antes de gravar, nunca no
 * componente de tela.
 */
export function garantirHorarioLivre(
  candidato: { profissionalId: string; inicio: string; fim: string; id?: string },
  existentes: Agendamento[],
): void {
  const conflito = existentes.find(
    (a) =>
      a.id !== candidato.id &&
      a.profissionalId === candidato.profissionalId &&
      estaAtivo(a) &&
      sobrepoe(candidato.inicio, candidato.fim, a.inicio, a.fim),
  )

  if (conflito) {
    throw new ErroDeRegra('Este horário já está ocupado. Escolha outro, por favor.')
  }
}

/** A reserva temporária ainda vale, ou já passou do prazo? */
export const reservaValida = (r: ReservaTemporaria): boolean =>
  r.situacao === 'ativa' && new Date(r.expiraEm).getTime() > Date.now()

/**
 * Impede que o horário preso por outra cliente seja tomado.
 *
 * Sem esta checagem a reserva seria só enfeite de tela: some da grade
 * de quem carregou depois, mas quem já estava com a tela aberta ainda
 * consegue confirmar por cima.
 */
export function garantirSemReserva(
  candidato: { profissionalId: string; inicio: string; fim: string; visitanteId?: string | null },
  reservas: ReservaTemporaria[],
): void {
  const presa = reservas.find(
    (r) =>
      reservaValida(r) &&
      r.visitanteId !== candidato.visitanteId &&
      r.profissionalId === candidato.profissionalId &&
      sobrepoe(candidato.inicio, candidato.fim, r.inicio, r.fim),
  )

  if (presa) {
    throw new ErroDeRegra(
      'Alguém está finalizando um agendamento neste horário agora. Escolha outro, por favor.',
    )
  }
}

/**
 * Respeita o teto de atendimentos ao mesmo tempo.
 *
 * Três profissionais livres não adiantam se o studio só tem duas
 * cadeiras. O teto é do espaço, não de cada pessoa — por isso a conta
 * atravessa toda a equipe.
 */
export function garantirCapacidade(
  candidato: { inicio: string; fim: string; id?: string },
  existentes: Agendamento[],
  teto: number,
): void {
  if (teto <= 0) return

  const simultaneos = existentes.filter(
    (a) => a.id !== candidato.id && estaAtivo(a) && sobrepoe(candidato.inicio, candidato.fim, a.inicio, a.fim),
  ).length

  if (simultaneos >= teto) {
    throw new ErroDeRegra(
      `O studio atende no máximo ${teto} cliente(s) ao mesmo tempo, e este horário já está no limite.`,
    )
  }
}

/** Impede agendamento sobre almoço, folga, férias ou feriado. */
export function garantirSemBloqueio(
  candidato: { profissionalId: string; inicio: string; fim: string },
  bloqueios: Bloqueio[],
): void {
  const bloqueio = bloqueios.find(
    (b) =>
      (b.profissionalId === null || b.profissionalId === candidato.profissionalId) &&
      sobrepoe(candidato.inicio, candidato.fim, b.inicio, b.fim),
  )

  if (bloqueio) {
    throw new ErroDeRegra(`Horário indisponível: ${bloqueio.motivo ?? bloqueio.tipo}.`)
  }
}
