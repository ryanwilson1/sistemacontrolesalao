import { calcularRetornoMedio, montarPainelCompleto, serieDeReceita, serieSemanal } from '@/services'
import { useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import { isoData } from '@/utils/datas'
import type { PainelCompleto } from '@/types'

export function usePainelCompleto(data: Date) {
  return useConsulta<PainelCompleto>(`${CHAVES.painel}:completo:${isoData(data)}`, () =>
    montarPainelCompleto(data),
  )
}

export function useSerieDeReceita(dias = 14) {
  return useConsulta(`${CHAVES.painel}:serie:${dias}`, () => serieDeReceita(dias))
}

export function useSerieSemanal() {
  return useConsulta(`${CHAVES.painel}:semanal`, () => serieSemanal())
}

/** Consulta mais pesada: fica à parte para não travar o painel. */
export function useRetornoMedio() {
  return useConsulta<number | null>(`${CHAVES.painel}:retorno`, () => calcularRetornoMedio())
}
