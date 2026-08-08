import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'

export interface CartaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  espacamento?: boolean
}

/** Superfície branca sobre o fundo de quartzo. A base de quase toda tela. */
export function Carta({ children, className, espacamento = true, ...resto }: CartaProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-onix-100 bg-white shadow-carta',
        espacamento && 'p-4 sm:p-5',
        className,
      )}
      {...resto}
    >
      {children}
    </div>
  )
}

export function CartaTitulo({
  titulo, descricao, acao, className,
}: { titulo: string; descricao?: string; acao?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="font-display text-[15px] font-medium tracking-wide text-onix-800">{titulo}</h3>
        {descricao && <p className="mt-0.5 text-[13px] leading-snug text-onix-400">{descricao}</p>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  )
}
