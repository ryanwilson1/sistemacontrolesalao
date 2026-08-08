import { cn } from '@/utils/cn'

/** Bloco cintilante no lugar do conteúdo que ainda está vindo. */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-brilho rounded-lg bg-[length:200%_100%]',
        'bg-[linear-gradient(90deg,#F0E3E4_0%,#F8F1F1_50%,#F0E3E4_100%)]',
        className,
      )}
    />
  )
}

export function EsqueletoCarta() {
  return (
    <div className="rounded-2xl border border-onix-100 bg-white p-4 shadow-carta sm:p-5">
      <Esqueleto className="h-3 w-24" />
      <Esqueleto className="mt-3 h-7 w-32" />
      <Esqueleto className="mt-4 h-2.5 w-full" />
    </div>
  )
}

export function EsqueletoLista({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: linhas }).map((_, indice) => (
        <div
          key={indice}
          className="flex items-center gap-3 rounded-xl border border-onix-100 bg-white p-4"
        >
          <Esqueleto className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Esqueleto className="h-3.5 w-2/5" />
            <Esqueleto className="h-3 w-1/4" />
          </div>
          <Esqueleto className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function EsqueletoGrade({ itens = 6 }: { itens?: number }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: itens }).map((_, indice) => (
        <EsqueletoCarta key={indice} />
      ))}
    </div>
  )
}
