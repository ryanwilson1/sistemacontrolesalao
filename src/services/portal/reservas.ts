import { reservasRepo } from '../repositorios/portal'
import { agendamentosRepo, bloqueiosRepo } from '../repositorios/agenda'
import { servicosRepo } from '../repositorios/servicos'
import { studioRepo } from '../repositorios/equipe'
import {
  calcularFim, garantirHorarioLivre, garantirSemBloqueio, garantirSemReserva,
} from '../agenda/regras'
import { idDoVisitante } from './visitante'
import { liberarRemoto, portalRemoto, reservarRemoto, varrerRemoto } from './remoto'
import { PORTAL } from '@/constants'
import { faixaDeDias } from '@/utils/datas'
import { ErroDeRegra } from '@/utils/erros'
import type { ReservaTemporaria } from '@/types'

/**
 * Reserva temporária.
 *
 * Quando a cliente toca num horário, ele fica dela por alguns minutos.
 * Ou ela conclui, ou o horário volta sozinho para a agenda.
 *
 * A razão é menos técnica do que parece: sem a reserva, duas clientes
 * escolhem as 14:00 ao mesmo tempo e a segunda só descobre o conflito
 * depois de digitar nome e telefone. A regra de "não existem dois
 * atendimentos no mesmo horário" continua sendo a última palavra — a
 * reserva só move a frustração para antes do esforço.
 */

export interface PedidoDeReserva {
  servicoId: string
  profissionalId: string
  inicio: string
  visitanteId?: string
}

/**
 * Prende o horário.
 *
 * Uma visitante tem no máximo uma reserva viva: escolher outro horário
 * solta o anterior. Sem isso, quem ficasse clicando pela grade travaria
 * a agenda inteira sem marcar nada.
 */
export async function reservar(pedido: PedidoDeReserva): Promise<ReservaTemporaria> {
  const visitanteId = pedido.visitanteId ?? idDoVisitante()

  // Com banco, prender o horário é uma transação só. Fazer as quatro
  // checagens daqui e gravar depois deixaria uma janela entre a última
  // conferência e a inserção — pequena, e suficiente para duas pessoas
  // saírem com a mesma reserva.
  if (portalRemoto()) {
    return reservarRemoto(pedido.servicoId, pedido.profissionalId, pedido.inicio, visitanteId)
  }

  const [servico, studio] = await Promise.all([
    servicosRepo.buscar(pedido.servicoId),
    studioRepo.ler(),
  ])
  if (!servico) throw new ErroDeRegra('Serviço não encontrado.')
  if (!studio?.agendamentoAtivo) throw new ErroDeRegra('O agendamento online está pausado.')

  const fim = calcularFim(pedido.inicio, servico)
  const { de, ate } = faixaDeDias(new Date(pedido.inicio), new Date(pedido.inicio))

  const [agendamentos, bloqueios, reservas] = await Promise.all([
    agendamentosRepo.noPeriodo(de, ate),
    bloqueiosRepo.noPeriodo(de, ate),
    reservasRepo.ativasNoPeriodo(de, ate),
  ])

  const candidato = { profissionalId: pedido.profissionalId, inicio: pedido.inicio, fim }

  garantirSemBloqueio(candidato, bloqueios)
  garantirHorarioLivre(candidato, agendamentos)
  garantirSemReserva({ ...candidato, visitanteId }, reservas)

  await liberarDaVisitante(visitanteId)

  const minutos = studio.reservaMinutos > 0 ? studio.reservaMinutos : PORTAL.reservaMinutosPadrao

  return reservasRepo.criar({
    servicoId: pedido.servicoId,
    profissionalId: pedido.profissionalId,
    inicio: pedido.inicio,
    fim,
    expiraEm: new Date(Date.now() + minutos * 60_000).toISOString(),
    visitanteId,
    situacao: 'ativa',
    agendamentoId: null,
  })
}

/** Solta a reserva da visitante, se houver. Silencioso de propósito. */
export async function liberarDaVisitante(visitanteId = idDoVisitante()): Promise<void> {
  if (portalRemoto()) return liberarRemoto(visitanteId)

  const atual = await reservasRepo.daVisitante(visitanteId)
  if (atual) await reservasRepo.atualizar(atual.id, { situacao: 'liberada' })
}

/** Marca a reserva como cumprida depois que o agendamento foi criado. */
export async function concluirReserva(
  reservaId: string, agendamentoId: string,
): Promise<void> {
  await reservasRepo.atualizar(reservaId, { situacao: 'concluida', agendamentoId })
}

/**
 * Devolve à agenda tudo que venceu.
 *
 * Chamado pelo relógio das telas abertas. Sem servidor não existe tarefa
 * de fundo — e um horário que ficasse preso porque a cliente fechou o
 * navegador seria pior do que não ter reserva nenhuma.
 */
export async function varrerReservas(): Promise<number> {
  // Com banco a faxina é do servidor — e passa a acontecer também de
  // madrugada, com o navegador de todo mundo fechado. Ver o agendamento
  // via pg_cron em supabase/04-tempo-real.sql.
  if (portalRemoto()) return varrerRemoto()

  return reservasRepo.varrer()
}

/** Segundos que faltam para a reserva vencer. Zero quando já venceu. */
export function segundosRestantes(reserva: ReservaTemporaria | null): number {
  if (!reserva || reserva.situacao !== 'ativa') return 0
  const faltam = new Date(reserva.expiraEm).getTime() - Date.now()
  return faltam > 0 ? Math.ceil(faltam / 1000) : 0
}

/** "4:32" — o que a cliente vê no relógio regressivo. */
export function relogioDaReserva(segundos: number): string {
  const minutos = Math.floor(segundos / 60)
  return `${minutos}:${String(segundos % 60).padStart(2, '0')}`
}
