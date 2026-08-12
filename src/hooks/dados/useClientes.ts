import { agendamentosRepo, clientesRepo, resumoDoCliente } from '@/services'
import { PAGINACAO } from '@/constants'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { AgendamentoDetalhado, Cliente, Pagina, ResumoCliente } from '@/types'

export function useClientes(termo: string, pagina: number, arquivadas = false) {
  /*
    `arquivadas` entra na chave do cache.

    Sem isso, alternar o filtro devolveria a lista guardada da outra
    aba — a proprietária clicaria em "Arquivadas" e continuaria vendo
    as ativas, achando que o botão não funciona.
  */
  const chave = `${CHAVES.clientes}:lista:${arquivadas ? 'arq' : 'ativas'}:${termo}:${pagina}`
  return useConsulta<Pagina<Cliente>>(chave, () =>
    clientesRepo.paginar(termo, pagina, PAGINACAO.clientesPorPagina, arquivadas),
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

/**
 * Tira a cliente da lista principal sem apagar o histórico.
 *
 * `clientesRepo.arquivar` já existia e **nenhuma tela o chamava** — era
 * código morto desde que foi escrito. A proprietária não tinha como
 * limpar a lista de quem não volta mais, e a alternativa que sobrava
 * era apagar a ficha, levando junto todo o histórico de atendimentos e
 * as fotos de evolução.
 *
 * Arquivar liga `ativo: false`. Quem consulta a lista já filtra por
 * `ativo` (`clientesRepo.paginar`), então a cliente some da tela e
 * continua ligada a cada agendamento que fez.
 */
export function useArquivarCliente() {
  return useAcao(
    (id: string) => clientesRepo.arquivar(id),
    [CHAVES.clientes, CHAVES.painel, CHAVES.agenda],
  )
}

/** Devolve à lista principal quem foi arquivada por engano. */
export function useReativarCliente() {
  return useAcao(
    (id: string) => clientesRepo.atualizar(id, { ativo: true } as Partial<Cliente>),
    [CHAVES.clientes, CHAVES.painel, CHAVES.agenda],
  )
}
