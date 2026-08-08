import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

/* ------------------------------------------------------------------ */
/* Campo: rótulo, erro e dica em volta de qualquer controle            */
/* ------------------------------------------------------------------ */
export interface CampoProps {
  rotulo?: string
  erro?: string
  dica?: string
  obrigatorio?: boolean
  children: ReactNode
  className?: string
}

export function Campo({ rotulo, erro, dica, obrigatorio, children, className }: CampoProps) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      {rotulo && (
        <label className="block text-[13px] font-medium text-onix-600">
          {rotulo}
          {obrigatorio && <span className="ml-0.5 text-marca">*</span>}
        </label>
      )}
      {children}
      {/*
        `role="alert"` para o leitor de tela anunciar o erro sem a
        pessoa precisar voltar ao campo — e a cor nunca é o único
        sinal: a mensagem em texto é que carrega o recado, como o item
        28 do escopo exige.
      */}
      {erro ? (
        <p role="alert" className="text-[12.5px] leading-snug text-perigo">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-[12.5px] leading-snug text-onix-400">{dica}</p>
      ) : null}
    </div>
  )
}

/*
  `text-base` no celular, 15px a partir de `sm`.

  Não é gosto por letra grande: o Safari do iPhone **dá zoom na página
  inteira** quando um campo com fonte menor que 16px recebe foco. O
  layout salta, a pessoa perde o contexto, e ao sair do campo a página
  continua ampliada — ela precisa fechar o zoom com os dedos para
  seguir preenchendo.

  É o defeito de formulário mais comum em site feito para desktop, e o
  escopo pede exatamente isto: "não pode exigir zoom".

  `sm:` cobre tablet e desktop, onde 15px lê melhor e nenhum navegador
  aplica zoom.
*/
const BASE =
  'w-full rounded-xl border bg-white px-3.5 text-base sm:text-[15px] text-onix-800 ' +
  'placeholder:text-onix-300 transition-colors duration-150 ' +
  'disabled:cursor-not-allowed disabled:bg-onix-50 disabled:text-onix-400 ' +
  'focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/20'

const borda = (erro?: boolean) =>
  erro ? 'border-perigo focus:border-perigo focus:ring-perigo/20' : 'border-onix-200'

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */
export interface EntradaProps extends InputHTMLAttributes<HTMLInputElement> {
  erro?: boolean
  prefixo?: ReactNode
  sufixo?: ReactNode
}

export const Entrada = forwardRef<HTMLInputElement, EntradaProps>(function Entrada(
  { erro, prefixo, sufixo, className, ...resto },
  ref,
) {
  const campo = (
    <input
      ref={ref}
      className={cn(BASE, 'h-12 sm:h-11', borda(erro), !!prefixo && 'pl-10', !!sufixo && 'pr-10', className)}
      {...resto}
    />
  )

  if (!prefixo && !sufixo) return campo

  return (
    <div className="relative">
      {prefixo && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-onix-300">
          {prefixo}
        </span>
      )}
      {campo}
      {sufixo && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-onix-300">{sufixo}</span>
      )}
    </div>
  )
})

/* ------------------------------------------------------------------ */
/* Área de texto                                                       */
/* ------------------------------------------------------------------ */
export const AreaTexto = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { erro?: boolean }
>(function AreaTexto({ erro, className, rows = 3, ...resto }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(BASE, 'resize-y py-2.5 leading-relaxed', borda(erro), className)}
      {...resto}
    />
  )
})

/* ------------------------------------------------------------------ */
/* Seleção                                                             */
/* ------------------------------------------------------------------ */
export const Selecao = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { erro?: boolean }
>(function Selecao({ erro, className, children, ...resto }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(BASE, 'h-12 sm:h-11 appearance-none pr-9', borda(erro), className)}
        {...resto}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-onix-400"
        viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
})

/* ------------------------------------------------------------------ */
/* Interruptor                                                         */
/* ------------------------------------------------------------------ */
export interface InterruptorProps {
  ligado: boolean
  aoMudar: (valor: boolean) => void
  rotulo: string
  descricao?: string
  /**
   * Por que este controle está bloqueado.
   *
   * É `string`, não `boolean`, e isso é a regra 4 do escopo virando
   * tipo: **não existe bloquear sem explicar.** Um interruptor cinza
   * sem motivo faz a proprietária achar que o sistema quebrou; com o
   * motivo, ela sabe o que fazer para destravá-lo.
   */
  bloqueadoPorque?: string
}

export function Interruptor({
  ligado, aoMudar, rotulo, descricao, bloqueadoPorque,
}: InterruptorProps) {
  const bloqueado = !!bloqueadoPorque

  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={bloqueado}
      title={bloqueadoPorque}
      onClick={() => aoMudar(!ligado)}
      className="flex w-full items-center justify-between gap-4 py-1 text-left disabled:cursor-not-allowed"
    >
      <span className="min-w-0">
        <span className={cn('block text-sm font-medium', bloqueado ? 'text-onix-400' : 'text-onix-800')}>
          {rotulo}
        </span>
        {descricao && (
          <span className="mt-0.5 block text-[13px] leading-snug text-onix-400">{descricao}</span>
        )}
        {bloqueadoPorque && (
          <span className="mt-1 block text-[12.5px] leading-snug text-ouro-600">
            {bloqueadoPorque}
          </span>
        )}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          bloqueado ? 'bg-onix-100' : ligado ? 'bg-marca' : 'bg-onix-200',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
            ligado ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Seletor de cor                                                      */
/* ------------------------------------------------------------------ */
export function SeletorDeCor({
  cores, valor, aoMudar,
}: { cores: readonly string[]; valor: string; aoMudar: (cor: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {cores.map((cor) => (
        <button
          key={cor}
          type="button"
          onClick={() => aoMudar(cor)}
          style={{ background: cor }}
          aria-label={`Cor ${cor}`}
          aria-pressed={valor === cor}
          className={cn(
            // 44px é o alvo mínimo de toque recomendado. Antes eram
            // 32px, e errar a cor num celular era rotina.
            'h-11 w-11 rounded-xl transition-transform',
            valor === cor && 'scale-105 ring-2 ring-onix-800 ring-offset-2',
          )}
        />
      ))}
    </div>
  )
}
