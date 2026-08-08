import { RepositorioBase } from './base'
import { ErroDeRegra } from '@/utils/erros'
import { isoData } from '@/utils/datas'
import type { Cupom, ResultadoCupom, UsoCupom } from '@/types'

/** Mensagem de cada recusa. Fica junto da regra para não divergirem. */
const RECUSA: Record<string, string> = {
  inexistente: 'Este cupom não existe.',
  inativo: 'Este cupom está desativado.',
  expirado: 'Este cupom já venceu.',
  ainda_nao_vale: 'Este cupom ainda não está valendo.',
  esgotado: 'Este cupom atingiu o limite de usos.',
  servico_nao_incluso: 'Este cupom não vale para o serviço escolhido.',
  valor_insuficiente: 'O valor do atendimento é menor que o mínimo do cupom.',
}

export const mensagemDaRecusa = (motivo: string | null) =>
  motivo ? RECUSA[motivo] ?? 'Cupom inválido.' : ''

class RepositorioUsosCupom extends RepositorioBase<UsoCupom> {
  constructor() {
    super('usosCupom')
  }

  async doCupom(cupomId: string): Promise<UsoCupom[]> {
    const todos = await this.listar()
    return todos
      .filter((u) => u.cupomId === cupomId)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }
}

class RepositorioCupons extends RepositorioBase<Cupom> {
  constructor() {
    super('cupons')
  }

  async ordenados(): Promise<Cupom[]> {
    const todos = await this.listar()
    return todos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }

  async porCodigo(codigo: string): Promise<Cupom | null> {
    const alvo = normalizar(codigo)
    const todos = await this.listar()
    return todos.find((c) => normalizar(c.codigo) === alvo) ?? null
  }

  /**
   * Confere se o cupom vale para este atendimento e calcula o desconto.
   *
   * Nunca lança: devolve o motivo da recusa para a tela explicar em
   * português o que aconteceu.
   */
  async validar(entrada: {
    codigo: string
    valor: number
    servicoId?: string | null
  }): Promise<ResultadoCupom> {
    const recusar = (motivo: ResultadoCupom['motivo'], cupom: Cupom | null = null) => ({
      valido: false, motivo, cupom, valorDesconto: 0, valorFinal: entrada.valor,
    })

    const cupom = await this.porCodigo(entrada.codigo)
    if (!cupom) return recusar('inexistente')
    if (!cupom.ativo) return recusar('inativo', cupom)

    const hoje = isoData(new Date())
    if (hoje < cupom.validoDe) return recusar('ainda_nao_vale', cupom)
    if (hoje > cupom.validoAte) return recusar('expirado', cupom)

    if (cupom.limiteUsos > 0 && cupom.usos >= cupom.limiteUsos) {
      return recusar('esgotado', cupom)
    }

    if (cupom.servicosIds.length > 0) {
      if (!entrada.servicoId || !cupom.servicosIds.includes(entrada.servicoId)) {
        return recusar('servico_nao_incluso', cupom)
      }
    }

    if (entrada.valor < cupom.valorMinimo) return recusar('valor_insuficiente', cupom)

    const valorDesconto = calcularDesconto(cupom, entrada.valor)

    return {
      valido: true,
      motivo: null,
      cupom,
      valorDesconto,
      valorFinal: Number((entrada.valor - valorDesconto).toFixed(2)),
    }
  }

  /** Registra o uso e incrementa o contador. Só depois de validar. */
  async aplicar(entrada: {
    codigo: string
    valor: number
    servicoId?: string | null
    clienteId?: string | null
    agendamentoId?: string | null
  }): Promise<ResultadoCupom> {
    const resultado = await this.validar(entrada)
    if (!resultado.valido || !resultado.cupom) {
      throw new ErroDeRegra(mensagemDaRecusa(resultado.motivo))
    }

    await usosCupomRepo.criar({
      cupomId: resultado.cupom.id,
      codigo: resultado.cupom.codigo,
      clienteId: entrada.clienteId ?? null,
      agendamentoId: entrada.agendamentoId ?? null,
      valorOriginal: entrada.valor,
      valorDesconto: resultado.valorDesconto,
      valorFinal: resultado.valorFinal,
    })

    await this.atualizar(resultado.cupom.id, { usos: resultado.cupom.usos + 1 })
    return resultado
  }

  /** Código só com letras e números, sempre em maiúsculas. */
  async garantirCodigoUnico(codigo: string, ignorarId?: string): Promise<string> {
    const limpo = normalizar(codigo)
    if (limpo.length < 3) throw new ErroDeRegra('O código precisa de pelo menos 3 caracteres.')

    const existente = await this.porCodigo(limpo)
    if (existente && existente.id !== ignorarId) {
      throw new ErroDeRegra(`Já existe um cupom com o código ${limpo}.`)
    }
    return limpo
  }
}

function calcularDesconto(cupom: Cupom, valor: number): number {
  const bruto = cupom.tipo === 'percentual' ? (valor * cupom.valor) / 100 : cupom.valor

  // Teto opcional e nunca descontar mais do que o próprio valor.
  const comTeto = cupom.descontoMaximo > 0 ? Math.min(bruto, cupom.descontoMaximo) : bruto
  return Number(Math.min(comTeto, valor).toFixed(2))
}

export const normalizar = (codigo: string) =>
  codigo.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24)

export const cuponsRepo = new RepositorioCupons()
export const usosCupomRepo = new RepositorioUsosCupom()
