import { clientesRepo, fidelidadeRepo, pontosRepo, resumoDoCliente } from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { ConfiguracaoFidelidade } from '@/types'

export interface LinhaRanking {
  clienteId: string
  nome: string
  pontos: number
  visitas: number
  totalGasto: number
}

export function useConfiguracaoFidelidade() {
  return useConsulta<ConfiguracaoFidelidade>(`${CHAVES.fidelidade}:configuracao`, () =>
    fidelidadeRepo.ler(),
  )
}

export function useSalvarFidelidade() {
  return useAcao(
    (configuracao: ConfiguracaoFidelidade) => fidelidadeRepo.gravar(configuracao),
    [CHAVES.fidelidade],
  )
}

export function useRankingFidelidade(limite = 12) {
  return useConsulta<LinhaRanking[]>(`${CHAVES.fidelidade}:ranking`, async () => {
    const [clientes, saldos] = await Promise.all([clientesRepo.listar(), pontosRepo.saldos()])

    const comPontos = clientes.filter((c) => (saldos.get(c.id) ?? 0) > 0)

    const linhas = await Promise.all(
      comPontos.map(async (cliente) => {
        const resumo = await resumoDoCliente(cliente.id)
        return {
          clienteId: cliente.id,
          nome: cliente.nome,
          pontos: saldos.get(cliente.id) ?? 0,
          visitas: resumo.visitas,
          totalGasto: resumo.totalGasto,
        }
      }),
    )

    return linhas.sort((a, b) => b.pontos - a.pontos).slice(0, limite)
  })
}
