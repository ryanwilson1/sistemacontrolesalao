import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

export interface Aba<T extends string> {
  valor: T
  rotulo: string
  contador?: number
}

/**
 * Abas com marcador deslizante. `idAnimacao` mantém instâncias diferentes
 * independentes — sem isso, duas abas na mesma tela disputam o marcador.
 */
export function Abas<T extends string>({
  abas, ativa, aoTrocar, idAnimacao = 'aba', className,
}: {
  abas: Aba<T>[]
  ativa: T
  aoTrocar: (valor: T) => void
  idAnimacao?: string
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn('scroll-fino -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5', className)}
    >
      {abas.map((aba) => {
        const selecionada = aba.valor === ativa
        return (
          <button
            key={aba.valor}
            role="tab"
            aria-selected={selecionada}
            onClick={() => aoTrocar(aba.valor)}
            className={cn(
              'relative shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13.5px] font-medium transition-colors',
              selecionada ? 'text-onix-900' : 'text-onix-400 hover:text-onix-700',
            )}
          >
            {selecionada && (
              <motion.span
                layoutId={`marcador-${idAnimacao}`}
                className="absolute inset-0 rounded-lg bg-quartzo-100"
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              />
            )}
            <span className="relative">
              {aba.rotulo}
              {aba.contador !== undefined && (
                <span className={cn('tabular ml-1.5', selecionada ? 'text-onix-500' : 'text-onix-300')}>
                  {aba.contador}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
