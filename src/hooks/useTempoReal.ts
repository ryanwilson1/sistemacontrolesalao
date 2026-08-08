import { useEffect } from 'react'
import { armazenamento } from '@/services/storage'
import { tempoReal, IDENTIDADE_DESTA_ABA } from '@/services/tempo-real'
import { cache, CHAVES_POR_COLECAO } from './dados/cache'
import type { EventoTempoReal } from '@/services/tempo-real'

/**
 * Liga o tempo real às telas.
 *
 * Um lugar só no sistema inteiro, montado na raiz. As páginas não
 * escutam o canal — elas já reagem ao cache, e continuar assim é o que
 * mantém a tela burra e a atualização automática.
 *
 * O que acontece a cada aviso:
 *
 *   1. veio de outra aba? → descarta o espelho do armazenamento, senão
 *      a próxima leitura devolveria o estado anterior;
 *   2. traduz a coleção em chaves de consulta;
 *   3. invalida — e quem estiver na tela relê sozinho.
 *
 * Os avisos são juntados numa janela curta antes do passo 3. Confirmar
 * um agendamento mexe em agendamentos, lembretes e reservas quase ao
 * mesmo tempo; sem o agrupamento seriam três ondas de recarga para uma
 * ação só, e num celular isso pisca.
 */

const JANELA_MS = 60

export function useTempoReal(): void {
  useEffect(() => {
    let pendentes = new Set<string>()
    let remotoNoLote = false
    let agendado: number | null = null

    const despejar = () => {
      agendado = null

      const chaves = [...pendentes]
      pendentes = new Set()

      if (remotoNoLote) armazenamento.invalidar?.()
      remotoNoLote = false

      if (chaves.length > 0) cache.invalidar(...chaves)
    }

    const aoReceber = (evento: EventoTempoReal) => {
      const chaves = CHAVES_POR_COLECAO[evento.colecao]
      if (!chaves) return

      for (const chave of chaves) pendentes.add(chave)
      if (evento.origem !== IDENTIDADE_DESTA_ABA) remotoNoLote = true

      agendado ??= window.setTimeout(despejar, JANELA_MS)
    }

    const cancelar = tempoReal.inscrever(aoReceber)

    return () => {
      cancelar()
      if (agendado !== null) window.clearTimeout(agendado)
    }
  }, [])
}

/**
 * Roda uma tarefa de tempos em tempos enquanto a tela estiver visível.
 *
 * Usado pela varredura de reservas vencidas. Pausar com a aba escondida
 * não é economia de enfeite: um celular com dez abas abertas gastaria
 * bateria varrendo agenda que ninguém está olhando.
 */
export function useRelogio(tarefa: () => void, intervaloMs: number): void {
  useEffect(() => {
    let relogio: number | null = null

    const parar = () => {
      if (relogio !== null) window.clearInterval(relogio)
      relogio = null
    }

    const comecar = () => {
      if (relogio !== null) return
      tarefa()
      relogio = window.setInterval(tarefa, intervaloMs)
    }

    const aoTrocarVisibilidade = () => {
      if (document.visibilityState === 'visible') comecar()
      else parar()
    }

    aoTrocarVisibilidade()
    document.addEventListener('visibilitychange', aoTrocarVisibilidade)

    return () => {
      parar()
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervaloMs])
}
