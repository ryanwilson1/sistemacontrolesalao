import { cn } from '@/utils/cn'
import { iniciais } from '@/utils/formato'

const TAMANHOS = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-14 w-14 text-base sm:h-16 sm:w-16 sm:text-lg',
} as const

/** Iniciais em círculo. Sem foto, o sistema não fica com buraco visual. */
export function Retrato({
  nome, tamanho = 'md', cor, className,
}: {
  nome: string
  tamanho?: keyof typeof TAMANHOS
  cor?: string | null
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={cor ? { backgroundColor: `${cor}22`, color: cor } : undefined}
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-display font-medium tracking-wide',
        !cor && 'bg-quartzo-100 text-quartzo-700',
        TAMANHOS[tamanho],
        className,
      )}
    >
      {iniciais(nome || '?')}
    </span>
  )
}
