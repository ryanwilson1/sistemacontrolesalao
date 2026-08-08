import { RepositorioBase } from './base'
import { publicarMudanca } from '../tempo-real'
import { limiteDeValidade, somarValidos, venceu } from '@/utils/fidelidade'
import { armazenamento } from '../storage'
import type { ConfiguracaoFidelidade, PontoFidelidade } from '@/types'

const PADRAO: ConfiguracaoFidelidade = {
  ativo: false,
  pontosPorReal: 1,
  valorDoPonto: 0.05,
  validadeDias: null,
}

class RepositorioPontos extends RepositorioBase<PontoFidelidade> {
  constructor() {
    super('pontos')
  }

  async doCliente(clienteId: string): Promise<PontoFidelidade[]> {
    const todos = await this.listar()
    return todos.filter((p) => p.clienteId === clienteId)
  }

  async saldoDoCliente(clienteId: string): Promise<number> {
    const [pontos, configuracao] = await Promise.all([
      this.doCliente(clienteId),
      fidelidadeRepo.ler(),
    ])
    return somarValidos(pontos, configuracao.validadeDias)
  }

  /** Saldo de todos, em uma passada só. Evita N consultas no ranking. */
  async saldos(): Promise<Map<string, number>> {
    const [todos, configuracao] = await Promise.all([this.listar(), fidelidadeRepo.ler()])

    const mapa = new Map<string, number>()
    const limite = limiteDeValidade(configuracao.validadeDias)

    for (const p of todos) {
      if (venceu(p, limite)) continue
      mapa.set(p.clienteId, (mapa.get(p.clienteId) ?? 0) + p.pontos)
    }
    return mapa
  }
}

class RepositorioConfiguracaoFidelidade {
  async ler(): Promise<ConfiguracaoFidelidade> {
    const registros = await armazenamento.listar<ConfiguracaoFidelidade>('fidelidade')
    return registros[0] ?? PADRAO
  }

  async gravar(configuracao: ConfiguracaoFidelidade): Promise<void> {
    await armazenamento.gravar('fidelidade', [configuracao])
    publicarMudanca('fidelidade')
  }
}

export const pontosRepo = new RepositorioPontos()
export const fidelidadeRepo = new RepositorioConfiguracaoFidelidade()

export { limiteDeValidade, somarValidos, venceu } from '@/utils/fidelidade'
