import { caixaRepo, movimentosCaixaRepo } from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import { isoData } from '@/utils/datas'
import type { Caixa, FormaPagamento, MovimentoCaixa, OrigemMovimento, ResumoCaixa } from '@/types'

const AFETA_CAIXA = [CHAVES.caixa, CHAVES.painel, CHAVES.financeiro]

export function useCaixaAberto() {
  return useConsulta<Caixa | null>(`${CHAVES.caixa}:aberto`, () => caixaRepo.aberto())
}

export function useCaixaDoDia(data: Date) {
  return useConsulta<Caixa | null>(`${CHAVES.caixa}:dia:${isoData(data)}`, () =>
    caixaRepo.doDia(data),
  )
}

export function useMovimentosDoCaixa(caixaId?: string) {
  return useConsulta<MovimentoCaixa[]>(
    `${CHAVES.caixa}:movimentos:${caixaId ?? ''}`,
    () => movimentosCaixaRepo.doCaixa(caixaId!),
    { ativa: !!caixaId },
  )
}

export function useResumoDoCaixa(caixaId?: string) {
  return useConsulta<ResumoCaixa>(
    `${CHAVES.caixa}:resumo:${caixaId ?? ''}`,
    () => caixaRepo.resumir(caixaId!),
    { ativa: !!caixaId },
  )
}

export function useHistoricoDeCaixas(limite = 30) {
  return useConsulta<Caixa[]>(`${CHAVES.caixa}:historico`, () => caixaRepo.historico(limite))
}

export function useAbrirCaixa() {
  return useAcao(
    (dados: { valorAbertura: number; responsavelId: string; observacoes?: string | null }) =>
      caixaRepo.abrir(dados),
    AFETA_CAIXA,
  )
}

export function useFecharCaixa() {
  return useAcao(
    (dados: {
      caixaId: string
      valorInformado: number
      responsavelId: string
      observacoes?: string | null
    }) => caixaRepo.fechar(dados),
    AFETA_CAIXA,
  )
}

export function useMovimentarCaixa() {
  return useAcao(
    (dados: {
      tipo: 'entrada' | 'saida'
      origem: OrigemMovimento
      descricao: string
      valor: number
      forma: FormaPagamento
      profissionalId?: string | null
    }) => caixaRepo.movimentar(dados),
    AFETA_CAIXA,
  )
}
