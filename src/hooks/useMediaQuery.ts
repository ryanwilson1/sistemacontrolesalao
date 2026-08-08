import { useEffect, useState } from 'react'

/**
 * Responde a uma media query em JavaScript.
 *
 * Só para o que o CSS não resolve — por exemplo, decidir se um formulário
 * abre como modal ou como painel lateral. Layout continua sendo CSS.
 */
export function useMediaQuery(consulta: string): boolean {
  const [combina, setCombina] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(consulta).matches,
  )

  useEffect(() => {
    const lista = window.matchMedia(consulta)
    const aoMudar = (evento: MediaQueryListEvent) => setCombina(evento.matches)

    setCombina(lista.matches)
    lista.addEventListener('change', aoMudar)
    return () => lista.removeEventListener('change', aoMudar)
  }, [consulta])

  return combina
}

/** Atalhos para os pontos de quebra do Tailwind. */
export const useEhCelular = () => !useMediaQuery('(min-width: 640px)')
export const useEhDesktop = () => useMediaQuery('(min-width: 1024px)')
