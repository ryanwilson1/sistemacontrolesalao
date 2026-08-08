import { useCallback, useEffect, useState } from 'react'

/**
 * Estado de formulário sem biblioteca.
 *
 * Os formulários deste sistema são diretos: campos controlados, validação
 * na hora de salvar. React Hook Form resolveria o mesmo com mais peso e
 * mais conceito para manter. Se um formulário crescer muito, aí sim vale
 * trocar — a assinatura aqui é parecida o bastante para facilitar.
 */
export function useFormulario<T extends Record<string, unknown>>(inicial: T) {
  const [valores, setValores] = useState<T>(inicial)
  const [erros, setErros] = useState<Partial<Record<keyof T, string>>>({})

  /** Repõe os valores quando o registro editado muda. */
  const repor = useCallback((novos: T) => {
    setValores(novos)
    setErros({})
  }, [])

  const alterar = useCallback(<C extends keyof T>(campo: C, valor: T[C]) => {
    setValores((atuais) => ({ ...atuais, [campo]: valor }))
    setErros((atuais) => (atuais[campo] ? { ...atuais, [campo]: undefined } : atuais))
  }, [])

  const marcarErro = useCallback((campo: keyof T, mensagem: string) => {
    setErros((atuais) => ({ ...atuais, [campo]: mensagem }))
  }, [])

  return { valores, erros, alterar, repor, marcarErro, setErros }
}

/** Repõe o formulário toda vez que o modal reabre. */
export function useAoAbrir(aberto: boolean, efeito: () => void) {
  useEffect(() => {
    if (aberto) efeito()
    // O efeito é recriado a cada render; depender dele reabriria em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])
}
