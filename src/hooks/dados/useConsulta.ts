import { useCallback, useEffect, useRef, useState } from 'react'
import { cache } from './cache'
import { mensagemDeErro } from '@/utils/erros'

export interface Consulta<T> {
  dados: T | undefined
  carregando: boolean
  erro: string | null
  recarregar: () => void
}

/**
 * Busca assíncrona com cache e recarga automática.
 *
 * `chave` identifica o resultado no cache. `ativa` adia a busca até que
 * as dependências existam (evita consultar com id indefinido).
 */
export function useConsulta<T>(
  chave: string,
  buscar: () => Promise<T>,
  opcoes: { ativa?: boolean } = {},
): Consulta<T> {
  const { ativa = true } = opcoes

  const [dados, setDados] = useState<T | undefined>(() => cache.ler<T>(chave))
  const [carregando, setCarregando] = useState(ativa && cache.ler<T>(chave) === undefined)
  const [erro, setErro] = useState<string | null>(null)

  // A função de busca muda a cada render; a referência evita reexecutar à toa.
  const buscarRef = useRef(buscar)
  buscarRef.current = buscar

  const executar = useCallback(async () => {
    if (!ativa) return

    setCarregando(true)
    setErro(null)

    try {
      /*
        Uma busca por chave, ainda que várias telas peçam a mesma.

        Uma invalidação acorda todos os inscritos ao mesmo tempo, e cada
        um chamava a própria busca. Quatro cartões do painel lendo o
        mesmo resumo viravam quatro leituras completas do banco para
        montar um número idêntico quatro vezes.

        O registro mora no `cache` — e não num `Map` local deste
        arquivo — porque `cache.invalidar` precisa poder soltá-lo. Uma
        busca iniciada antes da invalidação carrega o estado anterior;
        se ela continuasse valendo para quem chega depois, a grade do
        portal seria repovoada com o horário que acabou de ser ocupado.
      */
      const resultado = await (cache.emVoo<T>(chave) ??
        cache.registrarBusca(chave, buscarRef.current()))

      cache.gravar(chave, resultado)
      setDados(resultado)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setCarregando(false)
    }
  }, [chave, ativa])

  useEffect(() => {
    if (!ativa) {
      setCarregando(false)
      return
    }

    const guardado = cache.ler<T>(chave)
    if (guardado !== undefined) {
      setDados(guardado)
      setCarregando(false)
    } else {
      void executar()
    }

    // Recarrega quando alguém invalida esta chave.
    return cache.inscrever(chave, () => {
      if (cache.ler(chave) === undefined) void executar()
    })
  }, [chave, ativa, executar])

  return { dados, carregando, erro, recarregar: executar }
}

export interface Acao<E, S> {
  executar: (entrada: E) => Promise<S>
  salvando: boolean
}

/**
 * Operação de escrita.
 *
 * Cuida do estado "salvando" e invalida o cache ao terminar, para que as
 * telas abertas se atualizem sozinhas.
 */
export function useAcao<E, S>(
  operacao: (entrada: E) => Promise<S>,
  invalidar: string[] = [],
): Acao<E, S> {
  const [salvando, setSalvando] = useState(false)

  const operacaoRef = useRef(operacao)
  operacaoRef.current = operacao

  const invalidarRef = useRef(invalidar)
  invalidarRef.current = invalidar

  const executar = useCallback(async (entrada: E): Promise<S> => {
    setSalvando(true)
    try {
      const resultado = await operacaoRef.current(entrada)
      if (invalidarRef.current.length > 0) cache.invalidar(...invalidarRef.current)
      return resultado
    } finally {
      setSalvando(false)
    }
  }, [])

  return { executar, salvando }
}
