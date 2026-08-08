import { cn } from '@/utils/cn'

/**
 * Monograma da fachada: "eb" em serifa itálica sobre ônix.
 * Assinatura visual do sistema — aparece no menu, no acesso e no link.
 */
export function Monograma({ tamanho = 'md', className }: { tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dimensoes = {
    sm: 'h-9 w-9 text-[16px]',
    md: 'h-10 w-10 text-[19px]',
    lg: 'h-11 w-11 text-[21px]',
  }[tamanho]

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-xl bg-onix-800',
        dimensoes, className,
      )}
      aria-hidden
    >
      <span className="font-assinatura italic leading-none text-ouro-300">eb</span>
    </span>
  )
}

/** Filete de ouro escovado. O detalhe que amarra a identidade. */
export function FileteDeOuro({ className }: { className?: string }) {
  return <span className={cn('filete-ouro block h-[2px] rounded-full', className)} aria-hidden />
}
