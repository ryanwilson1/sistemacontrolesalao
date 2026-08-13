import { useEffect, useRef } from 'react'
import { armazenamento, type Colecao } from '@/services/storage'
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
    let colecoesRemotas = new Set<Colecao>()
    let agendado: number | null = null

    const despejar = () => {
      agendado = null

      const chaves = [...pendentes]
      pendentes = new Set()

      /*
        Descarta o espelho **das coleções que mudaram**, não de todas.

        `invalidar()` sem argumento limpa o espelho inteiro, e era isso
        que acontecia a cada aviso. O efeito era desproporcional:
        confirmar um agendamento derrubava a cópia de clientes,
        serviços, produtos, lançamentos e mais meia dúzia de tabelas
        que ninguém tinha tocado — e a próxima renderização baixava
        todas de novo, uma por uma.

        Num computador com fibra isso é um piscar. No celular da
        proprietária, em rede de loja, é a tela congelada por segundos
        depois de cada clique. Era a causa da lentidão que ela
        descreveu.

        O evento sempre soube qual coleção mudou; o que faltava era
        usar essa informação.
      */
      for (const colecao of colecoesRemotas) armazenamento.invalidar?.(colecao)
      colecoesRemotas = new Set()

      if (chaves.length > 0) cache.invalidar(...chaves)
    }

    const aoReceber = (evento: EventoTempoReal) => {
      const chaves = CHAVES_POR_COLECAO[evento.colecao]
      if (!chaves) return

      for (const chave of chaves) pendentes.add(chave)
      if (evento.origem !== IDENTIDADE_DESTA_ABA) colecoesRemotas.add(evento.colecao)

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
  /*
    A tarefa vive num `ref`.

    Antes ela era capturada pela closure do efeito e omitida das
    dependências com um `eslint-disable`. Funcionava por acidente:
    funcionava porque quem chama passa um `useCallback` estável. No dia
    em que alguém passasse uma função inline — o que é o normal em React
    — o efeito recriaria o intervalo a cada render, e um `setInterval`
    recriado a cada render é a forma mais rápida de encher um celular de
    relógios.

    Com o `ref`, a tarefa sempre é a mais recente e o intervalo nunca
    reinicia por causa dela. O `eslint-disable` deixou de ser necessário:
    a lista de dependências agora é honesta.
  */
  const tarefaRef = useRef(tarefa)
  tarefaRef.current = tarefa

  useEffect(() => {
    /*
      Intervalo zero (ou negativo) desliga.

      Existe para quem precisa decidir *se* vai varrer depois de já ter
      chamado o hook — o que as regras dos hooks impõem. Sem esta saída,
      a alternativa era um `if` em volta da chamada, que o React proíbe,
      ou uma tarefa vazia, que continua acordando o navegador à toa.
    */
    if (intervaloMs <= 0) return

    let relogio: number | null = null

    const parar = () => {
      if (relogio !== null) window.clearInterval(relogio)
      relogio = null
    }

    const comecar = () => {
      if (relogio !== null) return
      tarefaRef.current()
      relogio = window.setInterval(() => tarefaRef.current(), intervaloMs)
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
  }, [intervaloMs])
}
