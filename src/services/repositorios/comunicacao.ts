import { RepositorioBase } from './base'
import type { Lembrete, Notificacao, SituacaoLembrete, TipoLembrete } from '@/types'

class RepositorioLembretes extends RepositorioBase<Lembrete> {
  constructor() {
    super('lembretes')
  }

  async porSituacao(situacao: SituacaoLembrete): Promise<Lembrete[]> {
    const todos = await this.listar()
    return todos
      .filter((l) => l.situacao === situacao)
      .sort((a, b) => a.agendadoPara.localeCompare(b.agendadoPara))
  }

  /** O que já venceu e ainda não saiu. */
  async vencidos(ate = new Date()): Promise<Lembrete[]> {
    const agendados = await this.porSituacao('agendado')
    const limite = ate.toISOString()
    return agendados.filter((l) => l.agendadoPara <= limite)
  }

  async doAgendamento(agendamentoId: string): Promise<Lembrete[]> {
    const todos = await this.listar()
    return todos.filter((l) => l.agendamentoId === agendamentoId)
  }

  /** Histórico do que já saiu, do mais recente ao mais antigo. */
  async historico(limite = 80): Promise<Lembrete[]> {
    const todos = await this.listar()
    return todos
      .filter((l) => l.situacao !== 'agendado')
      .sort((a, b) => (b.enviadoEm ?? b.criadoEm).localeCompare(a.enviadoEm ?? a.criadoEm))
      .slice(0, limite)
  }

  /** Cancela tudo que estava programado para um agendamento. */
  async cancelarDoAgendamento(agendamentoId: string): Promise<number> {
    const doAgendamento = await this.doAgendamento(agendamentoId)
    const pendentes = doAgendamento.filter((l) => l.situacao === 'agendado')

    for (const lembrete of pendentes) {
      await this.atualizar(lembrete.id, { situacao: 'cancelado' })
    }
    return pendentes.length
  }

  /** Evita programar o mesmo lembrete duas vezes para o mesmo horário. */
  async jaExiste(agendamentoId: string, tipo: TipoLembrete): Promise<boolean> {
    const doAgendamento = await this.doAgendamento(agendamentoId)
    return doAgendamento.some((l) => l.tipo === tipo && l.situacao !== 'cancelado')
  }
}

class RepositorioNotificacoes extends RepositorioBase<Notificacao> {
  constructor() {
    super('notificacoes')
  }

  async recentes(limite = 40): Promise<Notificacao[]> {
    const todas = await this.listar()
    return todas.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, limite)
  }

  async naoLidas(): Promise<number> {
    const todas = await this.listar()
    return todas.filter((n) => !n.lida).length
  }

  async marcarLida(id: string): Promise<void> {
    await this.atualizar(id, { lida: true })
  }

  async marcarTodasLidas(): Promise<number> {
    const todas = await this.listar()
    const pendentes = todas.filter((n) => !n.lida)

    if (pendentes.length === 0) return 0

    await this.substituirTudo(todas.map((n) => (n.lida ? n : { ...n, lida: true })))
    return pendentes.length
  }

  async limparLidas(): Promise<number> {
    const todas = await this.listar()
    const lidas = todas.filter((n) => n.lida).length

    await this.substituirTudo(todas.filter((n) => !n.lida))
    return lidas
  }
}

export const lembretesRepo = new RepositorioLembretes()
export const notificacoesRepo = new RepositorioNotificacoes()
