import { fornecedoresRepo, movimentosRepo, produtosRepo } from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { Fornecedor, MovimentoEstoque, Produto, TipoMovimento } from '@/types'

export function useProdutos(termo = '') {
  return useConsulta<Produto[]>(`${CHAVES.produtos}:${termo}`, () => produtosRepo.ativos(termo))
}

export function useFornecedores() {
  return useConsulta<Fornecedor[]>(`${CHAVES.fornecedores}:lista`, () =>
    fornecedoresRepo.ordenados(),
  )
}

export function useMovimentosDoProduto(produtoId?: string) {
  return useConsulta<MovimentoEstoque[]>(
    `${CHAVES.produtos}:movimentos:${produtoId ?? ''}`,
    () => movimentosRepo.doProduto(produtoId!),
    { ativa: !!produtoId },
  )
}

type DadosProduto = Omit<Produto, 'id' | 'criadoEm' | 'atualizadoEm'>

export function useSalvarProduto() {
  return useAcao(
    ({ id, dados }: { id?: string; dados: DadosProduto }) =>
      id ? produtosRepo.atualizar(id, dados) : produtosRepo.criar(dados),
    [CHAVES.produtos, CHAVES.painel],
  )
}

export function useMovimentarEstoque() {
  return useAcao(
    (dados: { produtoId: string; tipo: TipoMovimento; quantidade: number; motivo?: string }) =>
      produtosRepo.movimentar(dados),
    [CHAVES.produtos, CHAVES.painel],
  )
}
