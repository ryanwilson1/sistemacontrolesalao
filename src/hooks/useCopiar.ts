import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copia texto e devolve o estado "copiado" por alguns segundos.
 *
 * ---------------------------------------------------------------
 * O relógio que ficava para trás
 * ---------------------------------------------------------------
 * O `setTimeout` que desliga o "copiado" era disparado e esquecido. Dois
 * desfechos ruins vinham daí:
 *
 *   1. **copiar duas vezes seguidas** deixava dois relógios correndo, e
 *      o primeiro apagava o aviso do segundo antes da hora;
 *   2. **fechar o modal logo depois de copiar** — o gesto natural, já
 *      que copiar é a última coisa que se faz ali — deixava um relógio
 *      vivo por dois segundos chamando `setCopiado` num componente que
 *      já não existe.
 *
 * O segundo caso não quebra nada visível em React 18, e é exatamente por
 * isso que passa despercebido: ele apenas segura a closure — e com ela o
 * componente inteiro — na memória até disparar.
 */
export function useCopiar(duracaoMs = 2000) {
  const [copiado, setCopiado] = useState(false)
  const relogio = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (relogio.current !== null) window.clearTimeout(relogio.current)
    }
  }, [])

  const copiar = useCallback(
    async (texto: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(texto)

        // Um relógio por vez: o toque novo reinicia a contagem em vez de
        // somar um segundo relógio ao primeiro.
        if (relogio.current !== null) window.clearTimeout(relogio.current)

        setCopiado(true)
        relogio.current = window.setTimeout(() => {
          relogio.current = null
          setCopiado(false)
        }, duracaoMs)

        return true
      } catch {
        return false
      }
    },
    [duracaoMs],
  )

  return { copiado, copiar }
}
