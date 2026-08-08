import { montarResumoDoDia } from '@/services'
import { isoData } from '@/utils/datas'
import { useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { ResumoDoDia } from '@/types'

export function useResumoDoDia(data: Date) {
  const chave = `${CHAVES.painel}:${isoData(data)}`
  return useConsulta<ResumoDoDia>(chave, () => montarResumoDoDia(data))
}
