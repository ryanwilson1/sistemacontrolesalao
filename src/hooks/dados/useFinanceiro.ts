import { lancamentosRepo, metasRepo } from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { Lancamento, Meta, TipoLancamento } from '@/types'

export function useLancamentos(de: string, ate: string) {
  return useConsulta<Lancamento[]>(`${CHAVES.financeiro}:${de}:${ate}`, () =>
    lancamentosRepo.noPeriodo(de, ate),
  )
}

export function useMetaDoMes(referencia: Date) {
  const mes = `${referencia.getFullYear()}-${referencia.getMonth() + 1}`
  return useConsulta<Meta | null>(`${CHAVES.metas}:${mes}`, () => metasRepo.doMes(referencia))
}

type DadosLancamento = Omit<Lancamento, 'id' | 'criadoEm' | 'atualizadoEm'>

export function useSalvarLancamento() {
  return useAcao(
    ({ id, dados }: { id?: string; dados: DadosLancamento }) =>
      id ? lancamentosRepo.atualizar(id, dados) : lancamentosRepo.criar(dados),
    [CHAVES.financeiro, CHAVES.painel],
  )
}

export function useQuitarLancamento() {
  return useAcao(
    ({ id, tipo }: { id: string; tipo: TipoLancamento }) => lancamentosRepo.quitar(id, tipo),
    [CHAVES.financeiro, CHAVES.painel],
  )
}

export function useDefinirMeta() {
  return useAcao(
    ({ referencia, valor }: { referencia: Date; valor: number }) =>
      metasRepo.definir(referencia, valor),
    [CHAVES.metas, CHAVES.painel],
  )
}

/** Resumo consolidado — cálculo puro, sem consulta extra. */
export const resumirLancamentos = lancamentosRepo.resumir.bind(lancamentosRepo)
