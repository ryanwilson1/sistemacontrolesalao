import type { ReactNode } from 'react'

/** Abertura padrão de toda tela: sobretítulo, título e ações. */
export function CabecalhoPagina({
  sobretitulo, titulo, descricao, acoes,
}: {
  sobretitulo?: string
  titulo: string
  descricao?: string
  acoes?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {sobretitulo && <p className="eyebrow mb-1.5">{sobretitulo}</p>}
        <h1 className="truncate font-display text-[24px] font-light leading-tight tracking-tight text-onix-900 sm:text-[30px]">
          {titulo}
        </h1>
        {descricao && (
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-onix-400 sm:text-[14px]">
            {descricao}
          </p>
        )}
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  )
}
