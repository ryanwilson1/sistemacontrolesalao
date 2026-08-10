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

/**
 * Cadastra ou atualiza uma profissional.
 *
 * `id` opcional: sem ele, cria. O hook só sabia atualizar — e era esse
 * o buraco por trás do texto "cadastro entra na próxima etapa" que
 * ficou na tela de Equipe. Não havia caminho para criar ninguém, nem
 * pela interface nem por baixo dela.
 */
export function useSalvarProfissional() {
  return useAcao(
    async ({ id, dados }: { id?: string; dados: Partial<Profissional> }) =>
      id
        ? profissionaisRepo.atualizar(id, dados)
        : profissionaisRepo.criar(dados as Omit<Profissional, 'id' | 'criadoEm' | 'atualizadoEm'>),
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
