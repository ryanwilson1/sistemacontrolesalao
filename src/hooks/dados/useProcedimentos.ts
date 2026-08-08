import { fotosRepo, procedimentosRepo } from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { Foto, MomentoFoto, Procedimento } from '@/types'

export function useProcedimentosDoCliente(clienteId?: string) {
  return useConsulta<Procedimento[]>(
    `${CHAVES.procedimentos}:cliente:${clienteId ?? ''}`,
    () => procedimentosRepo.comFotos(clienteId!),
    { ativa: !!clienteId },
  )
}

export function useFotosDoCliente(clienteId?: string) {
  return useConsulta<Foto[]>(
    `${CHAVES.procedimentos}:fotos:${clienteId ?? ''}`,
    () => fotosRepo.doCliente(clienteId!),
    { ativa: !!clienteId },
  )
}

export function useGuardarFoto() {
  return useAcao(
    (dados: {
      procedimentoId: string
      clienteId: string
      momento: MomentoFoto
      conteudo: string
      legenda?: string | null
    }) => fotosRepo.guardar(dados),
    [CHAVES.procedimentos, CHAVES.clientes],
  )
}

export function useRemoverFoto() {
  return useAcao((id: string) => fotosRepo.remover(id), [CHAVES.procedimentos, CHAVES.clientes])
}
