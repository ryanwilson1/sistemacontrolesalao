import { useCallback, useState } from 'react'

/** Copia texto e devolve o estado "copiado" por alguns segundos. */
export function useCopiar(duracaoMs = 2000) {
  const [copiado, setCopiado] = useState(false)

  const copiar = useCallback(
    async (texto: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), duracaoMs)
        return true
      } catch {
        return false
      }
    },
    [duracaoMs],
  )

  return { copiado, copiar }
}
