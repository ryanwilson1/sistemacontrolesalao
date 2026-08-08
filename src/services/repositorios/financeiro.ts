import { RepositorioBase } from './base'
import { QUITADO } from '@/constants'
import { isoData, primeiroDiaDoMes } from '@/utils/datas'
import type { Lancamento, Meta, TipoLancamento } from '@/types'

export interface ResumoFinanceiro {
  recebido: number
  pago: number
  lucro: number
  aReceber: number
  aPagar: number
}

class RepositorioLancamentos extends RepositorioBase<Lancamento> {
  constructor() {
    super('lancamentos')
  }

  async noPeriodo(de: string, ate: string): Promise<Lancamento[]> {
    const todos = await this.listar()
    return todos
      .filter((l) => l.vencimento >= de && l.vencimento <= ate)
      .sort((a, b) => b.vencimento.localeCompare(a.vencimento))
  }

  async doAgendamento(agendamentoId: string): Promise<Lancamento | null> {
    const todos = await this.listar()
    return todos.find((l) => l.agendamentoId === agendamentoId) ?? null
  }

  /** Consolida entradas e saídas de uma lista já filtrada. */
  resumir(lancamentos: Lancamento[]): ResumoFinanceiro {
    const quitado = (l: Lancamento) => QUITADO.includes(l.situacao)
    const aberto = (l: Lancamento) => !quitado(l) && l.situacao !== 'cancelado'
    const somar = (lista: Lancamento[]) => lista.reduce((total, l) => total + l.valor, 0)

    const recebido = somar(lancamentos.filter((l) => l.tipo === 'receita' && quitado(l)))
    const pago = somar(lancamentos.filter((l) => l.tipo === 'despesa' && quitado(l)))

    return {
      recebido,
      pago,
      lucro: recebido - pago,
      aReceber: somar(lancamentos.filter((l) => l.tipo === 'receita' && aberto(l))),
      aPagar: somar(lancamentos.filter((l) => l.tipo === 'despesa' && aberto(l))),
    }
  }

  async faturamentoDoMes(referencia: Date): Promise<number> {
    const inicio = isoData(primeiroDiaDoMes(referencia))
    const fim = isoData(new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0))
    const lancamentos = await this.noPeriodo(inicio, fim)

    return lancamentos
      .filter((l) => l.tipo === 'receita' && QUITADO.includes(l.situacao))
      .reduce((total, l) => total + l.valor, 0)
  }

  /** Série diária para o gráfico do painel. */
  async serieDiaria(ate: Date, dias: number): Promise<{ dia: string; valor: number }[]> {
    const inicio = new Date(ate)
    inicio.setDate(inicio.getDate() - (dias - 1))

    const lancamentos = await this.noPeriodo(isoData(inicio), isoData(ate))
    const porDia = new Map<string, number>()

    for (const l of lancamentos) {
      if (l.tipo !== 'receita' || !QUITADO.includes(l.situacao)) continue
      porDia.set(l.vencimento, (porDia.get(l.vencimento) ?? 0) + l.valor)
    }

    return Array.from({ length: dias }, (_, i) => {
      const dia = new Date(inicio)
      dia.setDate(inicio.getDate() + i)
      const chave = isoData(dia)
      return { dia: chave, valor: porDia.get(chave) ?? 0 }
    })
  }

  /** Quita um lançamento em aberto. */
  async quitar(id: string, tipo: TipoLancamento): Promise<Lancamento> {
    return this.atualizar(id, {
      situacao: tipo === 'receita' ? 'recebido' : 'pago',
      pagoEm: new Date().toISOString(),
    })
  }
}

class RepositorioMetas extends RepositorioBase<Meta> {
  constructor() {
    super('metas')
  }

  async doMes(referencia: Date): Promise<Meta | null> {
    const mes = isoData(primeiroDiaDoMes(referencia))
    const todas = await this.listar()
    return todas.find((m) => m.mes === mes) ?? null
  }

  async definir(referencia: Date, valor: number): Promise<Meta> {
    const mes = isoData(primeiroDiaDoMes(referencia))
    const existente = await this.doMes(referencia)

    return existente
      ? this.atualizar(existente.id, { valor })
      : this.criar({ mes, valor })
  }
}

export const lancamentosRepo = new RepositorioLancamentos()
export const metasRepo = new RepositorioMetas()
