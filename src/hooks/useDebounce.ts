import { useEffect, useState } from 'react'
import { FORMULARIO } from '@/constants'

/**
 * Atrasa a propagação de um valor.
 *
 * Usado nas buscas: sem isto, cada tecla dispararia uma consulta.
 */
export function useDebounce<T>(valor: T, atrasoMs = FORMULARIO.atrasoBuscaMs): T {
  const [atrasado, setAtrasado] = useState(valor)

  useEffect(() => {
    const temporizador = setTimeout(() => setAtrasado(valor), atrasoMs)
    return () => clearTimeout(temporizador)
  }, [valor, atrasoMs])

  return atrasado
}
