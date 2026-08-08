import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'

export type VarianteBotao = 'principal' | 'ouro' | 'secundario' | 'fantasma' | 'perigo'
export type TamanhoBotao = 'sm' | 'md' | 'lg' | 'icone'

const VARIANTES: Record<VarianteBotao, string> = {
  principal:  'bg-onix-800 text-white hover:bg-onix-900 disabled:bg-onix-200',
  ouro:       'bg-marca text-marca-contraste hover:brightness-95 disabled:bg-onix-200 disabled:text-onix-400',
  secundario: 'bg-white text-onix-700 border border-onix-200 hover:bg-quartzo-50 hover:border-onix-300 disabled:text-onix-300',
  fantasma:   'text-onix-500 hover:bg-onix-50 hover:text-onix-800 disabled:text-onix-300',
  perigo:     'bg-white text-perigo border border-[#EBD2D4] hover:bg-[#FBF3F4] disabled:text-onix-300',
}

const TAMANHOS: Record<TamanhoBotao, string> = {
  sm:    'h-9 px-3.5 text-[13px] gap-1.5 rounded-lg',
  md:    'h-11 px-4 text-sm gap-2 rounded-xl',
  lg:    'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icone: 'h-10 w-10 rounded-xl',
}

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  carregando?: boolean
  bloco?: boolean
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { variante = 'principal', tamanho = 'md', carregando, bloco, className, children, disabled, type = 'button', ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-all duration-150 active:scale-[.98]',
        'disabled:pointer-events-none disabled:active:scale-100',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        bloco && 'w-full',
        className,
      )}
      {...resto}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
})
