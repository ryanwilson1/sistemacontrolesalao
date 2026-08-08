import { cuponsRepo, usosCupomRepo } from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { Cupom, ResultadoCupom, UsoCupom } from '@/types'

export function useCupons() {
  return useConsulta<Cupom[]>(`${CHAVES.cupons}:lista`, () => cuponsRepo.ordenados())
}

export function useUsosDoCupom(cupomId?: string) {
  return useConsulta<UsoCupom[]>(
    `${CHAVES.cupons}:usos:${cupomId ?? ''}`,
    () => usosCupomRepo.doCupom(cupomId!),
    { ativa: !!cupomId },
  )
}

type DadosCupom = Omit<Cupom, 'id' | 'criadoEm' | 'atualizadoEm' | 'usos'>

export function useSalvarCupom() {
  return useAcao(async ({ id, dados }: { id?: string; dados: DadosCupom }) => {
    const codigo = await cuponsRepo.garantirCodigoUnico(dados.codigo, id)
    return id
      ? cuponsRepo.atualizar(id, { ...dados, codigo })
      : cuponsRepo.criar({ ...dados, codigo, usos: 0 })
  }, [CHAVES.cupons])
}

export function useRemoverCupom() {
  return useAcao((id: string) => cuponsRepo.remover(id), [CHAVES.cupons])
}

/** Conferência sob demanda, usada no formulário de agendamento. */
export function useValidarCupom() {
  return useAcao(
    (entrada: { codigo: string; valor: number; servicoId?: string | null }): Promise<ResultadoCupom> =>
      cuponsRepo.validar(entrada),
    [],
  )
}
