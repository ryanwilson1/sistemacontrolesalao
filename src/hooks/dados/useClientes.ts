import { agendamentosRepo, clientesRepo, resumoDoCliente } from '@/services'
import { PAGINACAO } from '@/constants'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { AgendamentoDetalhado, Cliente, Pagina, ResumoCliente } from '@/types'

export function useClientes(termo: string, pagina: number) {
  const chave = `${CHAVES.clientes}:lista:${termo}:${pagina}`
  return useConsulta<Pagina<Cliente>>(chave, () =>
    clientesRepo.paginar(termo, pagina, PAGINACAO.clientesPorPagina),
  )
}

export function useCliente(id?: string) {
  return useConsulta<{ cliente: Cliente | null; resumo: ResumoCliente }>(
    `${CHAVES.clientes}:ficha:${id ?? ''}`,
    async () => {
      const [cliente, resumo] = await Promise.all([
        clientesRepo.buscar(id!),
        resumoDoCliente(id!),
      ])
      return { cliente, resumo }
    },
    { ativa: !!id },
  )
}

export function useHistoricoDoCliente(id?: string) {
  return useConsulta<AgendamentoDetalhado[]>(
    `${CHAVES.clientes}:historico:${id ?? ''}`,
    async () => agendamentosRepo.detalhar(await agendamentosRepo.doCliente(id!)),
    { ativa: !!id },
  )
}

export function useSugerirClientes(termo: string) {
  return useConsulta<Cliente[]>(
    `${CHAVES.clientes}:sugestao:${termo}`,
    () => clientesRepo.sugerir(termo),
    { ativa: termo.trim().length >= 2 },
  )
}

export function useSalvarCliente() {
  return useAcao(
    async ({ id, dados }: { id?: string; dados: Omit<Cliente, 'id' | 'criadoEm' | 'atualizadoEm'> }) => {
      await clientesRepo.garantirTelefoneUnico(dados.telefone, id)
      return id ? clientesRepo.atualizar(id, dados) : clientesRepo.criar(dados)
    },
    [CHAVES.clientes, CHAVES.painel],
  )
}
