import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { cn } from '@/utils/cn'

type Tipo = 'sucesso' | 'erro' | 'info'

interface Aviso {
  id: number
  tipo: Tipo
  titulo: string
  detalhe?: string
}

interface ContextoAviso {
  sucesso: (titulo: string, detalhe?: string) => void
  erro: (titulo: string, detalhe?: string) => void
  info: (titulo: string, detalhe?: string) => void
}

const Contexto = createContext<ContextoAviso | null>(null)

const ESTILO: Record<Tipo, { icone: typeof Check; classe: string; duracao: number }> = {
  sucesso: { icone: Check, classe: 'text-sucesso bg-[#E8F0EA]', duracao: 3800 },
  erro: { icone: AlertTriangle, classe: 'text-perigo bg-[#F7E9EA]', duracao: 6000 },
  info: { icone: Info, classe: 'text-ouro-600 bg-ouro-100', duracao: 4200 },
}

const MAXIMO_EMPILHADO = 3

export function AvisoProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])

  const remover = useCallback((id: number) => {
    setAvisos((atuais) => atuais.filter((a) => a.id !== id))
  }, [])

  const empilhar = useCallback(
    (tipo: Tipo, titulo: string, detalhe?: string) => {
      const id = Date.now() + Math.random()
      setAvisos((atuais) => [...atuais.slice(-(MAXIMO_EMPILHADO - 1)), { id, tipo, titulo, detalhe }])
      window.setTimeout(() => remover(id), ESTILO[tipo].duracao)
    },
    [remover],
  )

  const valor = useMemo<ContextoAviso>(
    () => ({
      sucesso: (titulo, detalhe) => empilhar('sucesso', titulo, detalhe),
      erro: (titulo, detalhe) => empilhar('erro', titulo, detalhe),
      info: (titulo, detalhe) => empilhar('info', titulo, detalhe),
    }),
    [empilhar],
  )

  return (
    <Contexto.Provider value={valor}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 pb-safe sm:bottom-auto sm:right-0 sm:top-0 sm:items-end"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {avisos.map((aviso) => {
            const { icone: Icone, classe } = ESTILO[aviso.tipo]
            return (
              <motion.div
                key={aviso.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-onix-100 bg-white p-3.5 shadow-alta"
              >
                <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full', classe)}>
                  <Icone className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-onix-800">{aviso.titulo}</p>
                  {aviso.detalhe && (
                    <p className="mt-0.5 text-[13px] leading-snug text-onix-400">{aviso.detalhe}</p>
                  )}
                </div>
                <button
                  onClick={() => remover(aviso.id)}
                  className="-m-1 rounded-lg p-1 text-onix-300 transition-colors hover:text-onix-600"
                  aria-label="Fechar aviso"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Contexto.Provider>
  )
}

export function useAviso() {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useAviso precisa estar dentro de AvisoProvider')
  return contexto
}
