import { jornadaRepo, profissionaisRepo, studioRepo } from '@/services'
import { useConsulta, useAcao } from './useConsulta'
import { CHAVES } from './cache'
import type { JornadaDia, Profissional, Studio } from '@/types'

export function useProfissionais() {
  return useConsulta<Profissional[]>(`${CHAVES.equipe}:ativos`, () => profissionaisRepo.ativos())
}

/** Só quem atende — é quem aparece na grade e no link público. */
export function useAtendentes() {
  return useConsulta<Profissional[]>(`${CHAVES.equipe}:atendentes`, () =>
    profissionaisRepo.atendentes(),
  )
}

export function useSalvarProfissional() {
  return useAcao(
    async ({ id, dados }: { id: string; dados: Partial<Profissional> }) =>
      profissionaisRepo.atualizar(id, dados),
    [CHAVES.equipe, CHAVES.agenda],
  )
}

export function useJornada() {
  return useConsulta<JornadaDia[]>(`${CHAVES.jornada}:lista`, () => jornadaRepo.ler())
}

export function useSalvarJornada() {
  return useAcao(
    async (jornada: JornadaDia[]) => jornadaRepo.gravar(jornada),
    [CHAVES.jornada, CHAVES.horarios, CHAVES.agenda],
  )
}

export function useStudio() {
  return useConsulta<Studio | null>(`${CHAVES.studio}:atual`, () => studioRepo.ler())
}

export function useSalvarStudio() {
  return useAcao(
    async (mudancas: Partial<Studio>) => studioRepo.atualizar(mudancas),
    [CHAVES.studio, CHAVES.horarios],
  )
}
