import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/** Rótulo compacto: situação, contagem, marcador. */
export function Etiqueta({
  children, className, ponto,
}: { children: ReactNode; className?: string; ponto?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1',
        'text-[11.5px] font-medium leading-none',
        className ?? 'border-onix-200 bg-onix-50 text-onix-600',
      )}
    >
      {ponto && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ponto)} />}
      {children}
    </span>
  )
}
