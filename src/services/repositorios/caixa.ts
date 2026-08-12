import { RepositorioBase } from './base'
import { AFETA_GAVETA, FORMAS_PAGAMENTO as FORMAS } from '@/constants'
import { agendamentosRepo } from './agenda'
import { ErroDeRegra } from '@/utils/erros'
import { faixaDoDia, isoData } from '@/utils/datas'
import type {
  Caixa, FormaPagamento, MovimentoCaixa, OrigemMovimento, ResumoCaixa,
} from '@/types'

class RepositorioMovimentosCaixa extends RepositorioBase<MovimentoCaixa> {
  constructor() {
    super('movimentosCaixa')
  }

  async doCaixa(caixaId: string): Promise<MovimentoCaixa[]> {
    const todos = await this.listar()
    return todos
      .filter((m) => m.caixaId === caixaId)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }
}

class RepositorioCaixa extends RepositorioBase<Caixa> {
  constructor() {
    super('caixas')
  }

  async doDia(data: Date): Promise<Caixa | null> {
    const dia = isoData(data)
    const todos = await this.listar()
    return todos.find((c) => c.data === dia) ?? null
  }

  /** O caixa que está aberto agora, se houver. */
  async aberto(): Promise<Caixa | null> {
    const todos = await this.listar()
    return todos.find((c) => c.situacao === 'aberto') ?? null
  }

  async historico(limite = 30): Promise<Caixa[]> {
    const todos = await this.listar()
    return todos.sort((a, b) => b.data.localeCompare(a.data)).slice(0, limite)
  }

  /**
   * Abre o caixa do dia.
   *
   * Dois caixas abertos ao mesmo tempo tornariam impossível saber onde
   * lançar uma entrada — por isso a regra é um de cada vez.
   */
  async abrir(dados: {
    data?: Date
    valorAbertura: number
    responsavelId: string
    observacoes?: string | null
    /** Ver `agendar`: retry após timeout reusa o id e vira confirmação. */
    idIdempotencia?: string
  }): Promise<Caixa> {
    const jaAberto = await this.aberto()
    if (jaAberto) {
      throw new ErroDeRegra(
        `Já existe um caixa aberto (${jaAberto.data}). Feche-o antes de abrir outro.`,
      )
    }

    const data = dados.data ?? new Date()
    const doDia = await this.doDia(data)
    if (doDia) throw new ErroDeRegra('O caixa deste dia já foi aberto e fechado.')

    if (dados.valorAbertura < 0) {
      throw new ErroDeRegra('O valor de abertura não pode ser negativo.')
    }

    return this.criar({
      data: isoData(data),
      situacao: 'aberto',
      abertoEm: new Date().toISOString(),
      abertoPorId: dados.responsavelId,
      valorAbertura: dados.valorAbertura,
      fechadoEm: null,
      fechadoPorId: null,
      valorInformado: null,
      diferenca: null,
      observacoes: dados.observacoes ?? null,
    }, { id: dados.idIdempotencia })
  }

  /** Registra uma entrada ou saída no caixa aberto. */
  async movimentar(dados: {
    tipo: 'entrada' | 'saida'
    origem: OrigemMovimento
    descricao: string
    valor: number
    forma: FormaPagamento
    /** Ver `agendar`: retry após timeout reusa o id e vira confirmação. */
    idIdempotencia?: string
    agendamentoId?: string | null
    procedimentoId?: string | null
    profissionalId?: string | null
  }): Promise<MovimentoCaixa> {
    const caixa = await this.aberto()
    if (!caixa) {
      throw new ErroDeRegra('Nenhum caixa aberto. Abra o caixa para registrar movimentações.')
    }
    if (dados.valor <= 0) throw new ErroDeRegra('O valor precisa ser maior que zero.')

    return movimentosCaixaRepo.criar({
      caixaId: caixa.id,
      tipo: dados.tipo,
      origem: dados.origem,
      descricao: dados.descricao,
      valor: dados.valor,
      forma: dados.forma,
      agendamentoId: dados.agendamentoId ?? null,
      procedimentoId: dados.procedimentoId ?? null,
      profissionalId: dados.profissionalId ?? null,
    }, { id: dados.idIdempotencia })
  }

  /**
   * Consolida o dia.
   *
   * O saldo esperado considera só o que passa pela gaveta: pix e cartão
   * entram no faturamento, mas não no dinheiro que a pessoa vai contar
   * no fim do expediente.
   */
  async resumir(caixaId: string): Promise<ResumoCaixa> {
    const [caixa, movimentos] = await Promise.all([
      this.buscar(caixaId),
      movimentosCaixaRepo.doCaixa(caixaId),
    ])

    const porForma = FORMAS.reduce(
      (acumulado, forma) => ({ ...acumulado, [forma]: 0 }),
      {} as Record<FormaPagamento, number>,
    )

    let entradas = 0
    let saidas = 0
    let gaveta = caixa?.valorAbertura ?? 0

    for (const movimento of movimentos) {
      const sinal = movimento.tipo === 'entrada' ? 1 : -1

      if (movimento.tipo === 'entrada') entradas += movimento.valor
      else saidas += movimento.valor

      porForma[movimento.forma] += sinal * movimento.valor
      if (AFETA_GAVETA.includes(movimento.forma)) gaveta += sinal * movimento.valor
    }

    const atendimentos = new Set(
      movimentos.filter((m) => m.agendamentoId).map((m) => m.agendamentoId),
    ).size

    const receitaDeAtendimento = movimentos
      .filter((m) => m.tipo === 'entrada' && m.origem === 'atendimento')
      .reduce((soma, m) => soma + m.valor, 0)

    return {
      entradas,
      saidas,
      saldoEsperado: gaveta,
      porForma,
      atendimentos,
      ticketMedio: atendimentos ? receitaDeAtendimento / atendimentos : 0,
    }
  }

  /**
   * Fecha o caixa conferindo o dinheiro contado contra o esperado.
   * A diferença fica registrada — é o que permite investigar depois.
   */
  async fechar(dados: {
    caixaId: string
    valorInformado: number
    responsavelId: string
    observacoes?: string | null
  }): Promise<Caixa> {
    const caixa = await this.buscar(dados.caixaId)
    if (!caixa) throw new ErroDeRegra('Caixa não encontrado.')
    if (caixa.situacao === 'fechado') throw new ErroDeRegra('Este caixa já está fechado.')

    const resumo = await this.resumir(dados.caixaId)

    return this.atualizar(dados.caixaId, {
      situacao: 'fechado',
      fechadoEm: new Date().toISOString(),
      fechadoPorId: dados.responsavelId,
      valorInformado: dados.valorInformado,
      diferenca: Number((dados.valorInformado - resumo.saldoEsperado).toFixed(2)),
      observacoes: dados.observacoes ?? caixa.observacoes,
    })
  }

  /** Quantos atendimentos do dia ainda não passaram pelo caixa. */
  async atendimentosPendentes(data: Date): Promise<number> {
    const { de, ate } = faixaDoDia(data)
    const [agendamentos, caixa] = await Promise.all([
      agendamentosRepo.noPeriodo(de, ate),
      this.doDia(data),
    ])

    if (!caixa) return 0

    const movimentos = await movimentosCaixaRepo.doCaixa(caixa.id)
    const lancados = new Set(movimentos.map((m) => m.agendamentoId).filter(Boolean))

    return agendamentos.filter((a) => a.situacao === 'concluido' && !lancados.has(a.id)).length
  }
}

export const caixaRepo = new RepositorioCaixa()
export const movimentosCaixaRepo = new RepositorioMovimentosCaixa()
