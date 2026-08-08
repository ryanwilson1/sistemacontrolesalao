import { perguntar } from '@/services'
import { useAcao } from './useConsulta'
import type { Resposta } from '@/services'

/** O assistente não guarda estado no cache: cada pergunta é nova. */
export function usePerguntar() {
  return useAcao((pergunta: string): Promise<Resposta> => perguntar(pergunta), [])
}
