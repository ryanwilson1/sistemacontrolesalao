import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * Número em destaque com rótulo e detalhe.
 * Usado no painel e no financeiro — mesma forma, um componente só.
 */
export function Indicador({
  rotulo, valor, icone: Icone, detalhe, destaque, atraso = 0, className,
}: {
  rotulo: string
  valor: string
  icone?: LucideIcon
  detalhe?: string
  destaque?: boolean
  atraso?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: atraso * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        'min-w-0 rounded-2xl border p-4 shadow-carta sm:p-5',
        destaque ? 'border-ouro-200 bg-ouro-100/50' : 'border-onix-100 bg-white',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow truncate">{rotulo}</p>
        {Icone && (
          <Icone
            className={cn('h-4 w-4 shrink-0', destaque ? 'text-ouro-600' : 'text-onix-300')}
            strokeWidth={1.8}
          />
        )}
      </div>
      <p className="tabular mt-2.5 truncate font-display text-[22px] font-light leading-none tracking-tight text-onix-900 sm:text-[27px]">
        {valor}
      </p>
      {detalhe && <p className="mt-2 truncate text-[12.5px] leading-snug text-onix-400">{detalhe}</p>}
    </motion.div>
  )
}
