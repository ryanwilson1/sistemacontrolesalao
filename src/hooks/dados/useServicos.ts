import { categoriasRepo, servicosRepo } from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { Categoria, Servico } from '@/types'

export function useServicos(apenasAtivos = true) {
  return useConsulta<Servico[]>(`${CHAVES.servicos}:${apenasAtivos ? 'ativos' : 'todos'}`, () =>
    apenasAtivos ? servicosRepo.ativos() : servicosRepo.listar(),
  )
}

export function useCategorias() {
  return useConsulta<Categoria[]>(`${CHAVES.categorias}:lista`, () => categoriasRepo.ordenadas())
}

type DadosServico = Omit<Servico, 'id' | 'criadoEm' | 'atualizadoEm'>

export function useSalvarServico() {
  return useAcao(
    ({ id, dados }: { id?: string; dados: DadosServico }) =>
      id ? servicosRepo.atualizar(id, dados) : servicosRepo.criar(dados),
    [CHAVES.servicos, CHAVES.horarios, CHAVES.agenda],
  )
}

export function useCriarCategoria() {
  return useAcao(
    (nome: string) => categoriasRepo.criar({ nome, ordem: 99 }),
    [CHAVES.categorias, CHAVES.servicos],
  )
}
