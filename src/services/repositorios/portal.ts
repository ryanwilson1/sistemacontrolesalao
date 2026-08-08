import { RepositorioBase } from './base'
import { reservaValida } from '../agenda/regras'
import type {
  EntradaListaEspera, ReservaTemporaria, SituacaoEspera, SolicitacaoDaCliente,
} from '@/types'

/**
 * Repositórios do Portal de Agendamento.
 *
 * Os três guardam o que existe *em volta* da marcação. O agendamento em
 * si continua no repositório de agenda — é o mesmo de sempre, e é essa
 * a razão de o portal e o painel nunca discordarem.
 */

/* ------------------------------------------------------------------ */
/* Reservas temporárias                                                */
/* ------------------------------------------------------------------ */

class RepositorioReservas extends RepositorioBase<ReservaTemporaria> {
  constructor() {
    super('reservas')
  }

  /** As que ainda prendem horário agora. */
  async ativas(): Promise<ReservaTemporaria[]> {
    return (await this.listar()).filter(reservaValida)
  }

  async ativasNoPeriodo(de: string, ate: string): Promise<ReservaTemporaria[]> {
    const ativas = await this.ativas()
    return ativas.filter((r) => r.inicio < ate && r.fim > de)
  }

  async daVisitante(visitanteId: string): Promise<ReservaTemporaria | null> {
    const ativas = await this.ativas()
    return ativas.find((r) => r.visitanteId === visitanteId) ?? null
  }

  /**
   * Marca como expirado o que venceu e apaga o que já não interessa.
   *
   * A limpeza importa mais aqui do que em qualquer outra coleção: são
   * registros de cinco minutos, criados a cada clique de cada visitante.
   * Sem varrer, o armazenamento enche de lixo em uma semana movimentada.
   */
  async varrer(): Promise<number> {
    const todas = await this.listar()
    const agora = Date.now()
    const ontem = agora - 86_400_000

    let mexeu = 0

    const sobreviventes = todas
      .map((reserva) => {
        if (reserva.situacao === 'ativa' && new Date(reserva.expiraEm).getTime() <= agora) {
          mexeu += 1
          return { ...reserva, situacao: 'expirada' as const }
        }
        return reserva
      })
      .filter((reserva) => {
        const velha = new Date(reserva.atualizadoEm).getTime() < ontem
        if (velha) mexeu += 1
        return !velha
      })

    if (mexeu > 0) await this.substituirTudo(sobreviventes)
    return mexeu
  }
}

/* ------------------------------------------------------------------ */
/* Solicitações da cliente                                             */
/* ------------------------------------------------------------------ */

class RepositorioSolicitacoes extends RepositorioBase<SolicitacaoDaCliente> {
  constructor() {
    super('solicitacoes')
  }

  /** O que ainda espera decisão, da mais antiga para a mais nova. */
  async abertas(): Promise<SolicitacaoDaCliente[]> {
    const todas = await this.listar()
    return todas
      .filter((s) => s.situacao === 'aberta')
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
  }

  async quantasAbertas(): Promise<number> {
    return (await this.abertas()).length
  }

  async doAgendamento(agendamentoId: string): Promise<SolicitacaoDaCliente[]> {
    const todas = await this.listar()
    return todas
      .filter((s) => s.agendamentoId === agendamentoId)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }

  /** Impede a cliente de pedir duas vezes a mesma coisa. */
  async abertaDoAgendamento(agendamentoId: string): Promise<SolicitacaoDaCliente | null> {
    const doAgendamento = await this.doAgendamento(agendamentoId)
    return doAgendamento.find((s) => s.situacao === 'aberta') ?? null
  }

  async historico(limite = 60): Promise<SolicitacaoDaCliente[]> {
    const todas = await this.listar()
    return todas
      .filter((s) => s.situacao !== 'aberta')
      .sort((a, b) => (b.respondidaEm ?? b.criadoEm).localeCompare(a.respondidaEm ?? a.criadoEm))
      .slice(0, limite)
  }
}

/* ------------------------------------------------------------------ */
/* Lista de espera                                                     */
/* ------------------------------------------------------------------ */

class RepositorioListaEspera extends RepositorioBase<EntradaListaEspera> {
  constructor() {
    super('listaEspera')
  }

  async porSituacao(situacao: SituacaoEspera): Promise<EntradaListaEspera[]> {
    const todas = await this.listar()
    return todas
      .filter((e) => e.situacao === situacao)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
  }

  /**
   * Quem está na fila, na ordem de chegada.
   *
   * A ordem é o contrato com a cliente: quem entrou primeiro é avisada
   * primeiro. Ordenar por qualquer outra coisa seria furar a fila sem
   * ninguém perceber.
   */
  async aguardando(): Promise<EntradaListaEspera[]> {
    return this.porSituacao('aguardando')
  }

  async quantasAguardando(): Promise<number> {
    return (await this.aguardando()).length
  }

  /** Evita a mesma pessoa entrando duas vezes para o mesmo serviço e dia. */
  async jaEstaNaFila(telefone: string, servicoId: string, data: string | null): Promise<boolean> {
    const fila = await this.aguardando()
    return fila.some(
      (e) => e.telefone === telefone && e.servicoId === servicoId && e.data === data,
    )
  }

  /** Devolve à fila quem foi avisada e não respondeu no prazo. */
  async expirarAvisos(horas: number): Promise<number> {
    const avisadas = await this.porSituacao('avisada')
    const limite = Date.now() - horas * 3_600_000

    const vencidas = avisadas.filter(
      (e) => e.avisadaEm !== null && new Date(e.avisadaEm).getTime() < limite,
    )

    for (const entrada of vencidas) {
      await this.atualizar(entrada.id, { situacao: 'aguardando', avisadaEm: null, vagaInicio: null })
    }
    return vencidas.length
  }
}

export const reservasRepo = new RepositorioReservas()
export const solicitacoesRepo = new RepositorioSolicitacoes()
export const listaEsperaRepo = new RepositorioListaEspera()
