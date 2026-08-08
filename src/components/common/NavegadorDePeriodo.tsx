import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Botao } from '@/components/ui/Botao'

/**
 * Setas de anterior/próximo com atalho para hoje.
 * Compartilhado entre agenda, financeiro e relatórios.
 */
export function NavegadorDePeriodo({
  aoVoltar, aoAvancar, aoIrParaHoje, rotuloAtalho = 'Hoje', mostrarAtalho = true,
}: {
  aoVoltar: () => void
  aoAvancar: () => void
  aoIrParaHoje?: () => void
  rotuloAtalho?: string
  mostrarAtalho?: boolean
}) {
  const classe =
    'grid h-9 w-9 place-items-center rounded-lg border border-onix-200 bg-white text-onix-500 ' +
    'transition-colors hover:bg-quartzo-50 hover:text-onix-800'

  return (
    <div className="flex items-center gap-1">
      <button onClick={aoVoltar} className={classe} aria-label="Período anterior">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button onClick={aoAvancar} className={classe} aria-label="Próximo período">
        <ChevronRight className="h-4 w-4" />
      </button>
      {mostrarAtalho && aoIrParaHoje && (
        <Botao variante="fantasma" tamanho="sm" onClick={aoIrParaHoje} className="ml-1">
          {rotuloAtalho}
        </Botao>
      )}
    </div>
  )
}
