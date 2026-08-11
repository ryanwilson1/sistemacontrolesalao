import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

const LARGURAS = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
} as const

export interface ModalProps {
  aberto: boolean
  aoFechar: () => void
  titulo?: string
  descricao?: string
  children: ReactNode
  rodape?: ReactNode
  largura?: keyof typeof LARGURAS

  /**
   * O estado atual do formulário. Ativa a guarda de digitação.
   *
   * A guarda mora aqui, e não em cada formulário, por uma razão
   * prática: são dez telas com modal de edição, e proteger uma por uma
   * significa que a décima primeira — a que alguém criar depois —
   * nasce desprotegida. Assim toda tela que passar este campo ganha a
   * proteção, e quem esquecer perde só ela.
   *
   * Basta passar um objeto com os campos: `{ nome, telefone, ... }`.
   * A comparação é por JSON, o que basta para texto, número e
   * booleano — que é tudo que estes formulários guardam.
   */
  estadoDoFormulario?: unknown
}

/**
 * No desktop é um diálogo centralizado; no celular vira folha deslizante
 * a partir da base — o gesto que a usuária já conhece de aplicativo.
 */
export function Modal({
  aberto, aoFechar, titulo, descricao, children, rodape, largura = 'md',
  estadoDoFormulario,
}: ModalProps) {
  const painel = useRef<HTMLDivElement>(null)
  const guarda = useGuardaDeDigitacao(aberto, estadoDoFormulario, aoFechar)

  useTravarFundo(aberto, guarda.pedirParaFechar)
  usePrenderFoco(aberto, painel)
  const alturaUtil = useAlturaVisivel(aberto)

  return createPortal(
    <AnimatePresence>
      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          /*
            A altura vem do `visualViewport`, não de `100dvh`.

            No iPhone, abrir o teclado não encolhe um elemento `fixed`:
            ele continua do tamanho da tela inteira e o teclado passa
            por cima. O rodapé do modal — onde mora o botão Salvar —
            fica embaixo do teclado, e a proprietária preenche o
            formulário sem conseguir enviá-lo.

            `visualViewport.height` é a única medida que enxerga o
            teclado. Com ela, o modal encolhe e o rodapé sobe.
          */
          style={alturaUtil ? { height: alturaUtil } : undefined}
        >
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={guarda.pedirParaFechar}
            className="absolute inset-0 bg-onix-900/25 backdrop-blur-[2px]"
          />

          <motion.div
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            initial={{ opacity: 0, y: 24, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className={cn(
              'relative flex max-h-full w-full flex-col overflow-hidden bg-white shadow-alta',
              'sm:max-h-[92dvh]',
              'rounded-t-3xl sm:rounded-2xl',
              LARGURAS[largura],
            )}
          >
            <span className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-onix-200 sm:hidden" />

            {titulo && (
              <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-4 sm:px-6 sm:pt-5">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-medium tracking-wide text-onix-900">
                    {titulo}
                  </h2>
                  {descricao && (
                    <p className="mt-1 text-[13px] leading-snug text-onix-400">{descricao}</p>
                  )}
                </div>
                <BotaoFechar aoFechar={guarda.pedirParaFechar} />
              </header>
            )}

            <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
              {children}
            </div>

            {rodape && (
              <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-onix-100 bg-quartzo-50 px-5 py-3.5 pb-safe sm:px-6 sm:pb-3.5">
                {rodape}
              </footer>
            )}
          </motion.div>

          {guarda.perguntando && (
            <PerguntaDeSaida
              aoContinuar={guarda.cancelarSaida}
              aoSair={guarda.confirmarSaida}
            />
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/**
 * Guarda de digitação para modais.
 *
 * Compara o estado atual com o que existia quando o modal abriu. Só
 * pergunta se houver diferença de verdade — um aviso que aparece
 * quando nada mudou ensina a clicar em "sair" sem ler, e aí ele deixa
 * de proteger no dia em que importa.
 */
function useGuardaDeDigitacao(
  aberto: boolean,
  estado: unknown,
  fechar: () => void,
) {
  const referencia = useRef<string | null>(null)
  const [perguntando, setPerguntando] = useState(false)

  useEffect(() => {
    if (aberto) {
      referencia.current = estado === undefined ? null : JSON.stringify(estado)
      setPerguntando(false)
    }
    // Só na abertura: incluir `estado` reporia a referência a cada
    // tecla digitada, e nada nunca pareceria alterado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const sujo =
    aberto &&
    referencia.current !== null &&
    JSON.stringify(estado) !== referencia.current

  return {
    perguntando,
    pedirParaFechar: () => (sujo ? setPerguntando(true) : fechar()),
    confirmarSaida: () => {
      setPerguntando(false)
      fechar()
    },
    cancelarSaida: () => setPerguntando(false),
  }
}

/**
 * Fica acima do modal (`z-[60]`) porque pergunta sobre ele.
 *
 * "Sair sem salvar" diz o que acontece; "Descartar" e "OK" não dizem.
 * Num diálogo que aparece sempre por engano, a pessoa lê o botão, não
 * o texto.
 */
function PerguntaDeSaida({
  aoContinuar, aoSair,
}: {
  aoContinuar: () => void
  aoSair: () => void
}) {
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-onix-900/40" onClick={aoContinuar} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="saida-modal"
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-alta"
      >
        <h2 id="saida-modal" className="font-display text-lg font-medium tracking-wide text-onix-900">
          Você tem alterações não salvas
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-onix-500">
          Se fechar agora, o que você digitou será perdido.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={aoSair}
            className="h-11 rounded-xl px-4 text-sm font-medium text-onix-500 transition-colors hover:bg-onix-50"
          >
            Sair sem salvar
          </button>
          <button
            onClick={aoContinuar}
            autoFocus
            className="h-11 rounded-xl bg-onix-800 px-4 text-sm font-medium text-white transition-colors hover:bg-onix-900"
          >
            Continuar editando
          </button>
        </div>
      </div>
    </div>
  )
}

/** Painel que entra pela lateral. Usado em detalhes longos no desktop. */
export function PainelLateral({
  aberto, aoFechar, titulo, children, rodape,
}: Omit<ModalProps, 'largura' | 'descricao'>) {
  useTravarFundo(aberto, aoFechar)

  return createPortal(
    <AnimatePresence>
      {aberto && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={aoFechar}
            className="absolute inset-0 bg-onix-900/25 backdrop-blur-[2px]"
          />
          <motion.aside
            role="dialog" aria-modal="true" aria-label={titulo}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-alta"
          >
            {titulo && (
              <header className="flex shrink-0 items-center justify-between gap-4 border-b border-onix-100 px-5 py-4 pt-safe">
                <h2 className="font-display text-lg font-medium tracking-wide text-onix-900">
                  {titulo}
                </h2>
                <BotaoFechar aoFechar={aoFechar} />
              </header>
            )}
            <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
            {rodape && (
              <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-onix-100 bg-quartzo-50 px-5 py-3.5 pb-safe">
                {rodape}
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function BotaoFechar({ aoFechar }: { aoFechar: () => void }) {
  return (
    <button
      onClick={aoFechar}
      className="-m-1.5 shrink-0 rounded-xl p-1.5 text-onix-300 transition-colors hover:bg-onix-50 hover:text-onix-700"
      aria-label="Fechar"
    >
      <X className="h-5 w-5" />
    </button>
  )
}

/**
 * Mede a altura realmente visível.
 *
 * Devolve `null` quando o navegador não expõe `visualViewport` (ou
 * fora do navegador), e aí o CSS assume — é por isso que a classe
 * `sm:max-h-[92dvh]` continua no elemento.
 */
function useAlturaVisivel(aberto: boolean): number | null {
  const [altura, setAltura] = useState<number | null>(null)

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!aberto || !vv) return

    const medir = () => setAltura(vv.height)
    medir()

    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => {
      vv.removeEventListener('resize', medir)
      vv.removeEventListener('scroll', medir)
      setAltura(null)
    }
  }, [aberto])

  return altura
}

/**
 * Prende o foco dentro do diálogo e o devolve ao fechar.
 *
 * Sem isto, Tab a partir do último campo sai do modal e passeia pelos
 * botões da página atrás dele — que estão visualmente cobertos. Quem
 * navega por teclado ou leitor de tela fica preso num lugar que não
 * consegue ver.
 */
function usePrenderFoco(aberto: boolean, painel: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!aberto) return

    const anterior = document.activeElement as HTMLElement | null

    const focaveis = () =>
      Array.from(
        painel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((elemento) => elemento.offsetParent !== null)

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Tab') return

      const lista = focaveis()
      if (lista.length === 0) return

      const primeiro = lista[0]
      const ultimo = lista[lista.length - 1]

      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primeiro.focus()
      }
    }

    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      // Devolve o foco a quem abriu o modal. Sem isto ele volta para o
      // começo da página, e a pessoa recomeça a navegação do zero.
      anterior?.focus?.()
    }
  }, [aberto, painel])
}

/** Esc fecha e o fundo para de rolar enquanto o diálogo está aberto. */
/**
 * Quantos modais estão abertos agora.
 *
 * ---------------------------------------------------------------
 * A tela que travava
 * ---------------------------------------------------------------
 * Cada modal guardava o `overflow` anterior do `body` e o restaurava ao
 * fechar. Com um modal só, funciona. Com dois — e há dois o tempo todo,
 * porque `Confirmar` é um Modal que abre POR CIMA do formulário —,
 * depende da ordem em que eles são desmontados:
 *
 *   formulário abre       anterior = ''        body = hidden
 *   Confirmar abre        anterior = 'hidden'  body = hidden
 *   formulário fecha      restaura ''
 *   Confirmar fecha       restaura 'hidden'  ← e fica assim
 *
 * O `body` ficava travado sem nenhum modal na tela. A página parava de
 * rolar, o conteúdo abaixo da dobra sumia, e nada indicava o motivo —
 * a única saída era recarregar ou fechar o aplicativo. É o relato de
 * \"entrei numa tela e não consigo sair\".
 *
 * A ordem de desmontagem não é garantida pelo React, então guardar o
 * valor anterior nunca ia funcionar. O contador não depende de ordem:
 * trava quando o primeiro abre, solta quando o último fecha.
 */
let modaisAbertos = 0

function travarFundo(): void {
  modaisAbertos += 1
  if (modaisAbertos === 1) document.body.style.overflow = 'hidden'
}

function soltarFundo(): void {
  modaisAbertos = Math.max(modaisAbertos - 1, 0)
  if (modaisAbertos === 0) document.body.style.overflow = ''
}

function useTravarFundo(aberto: boolean, aoFechar: () => void) {
  /*
    A referência evita que o efeito reinicie a cada render do pai.

    `aoFechar` costuma chegar como função inline — `() => setX(null)` —,
    que é nova a cada render. Com ela nas dependências, o efeito
    desmontava e remontava sem parar: contador subindo e descendo,
    listener removido e recriado, tudo isso enquanto a proprietária
    apenas digitava no formulário.
  */
  const fecharRef = useRef(aoFechar)
  fecharRef.current = aoFechar

  useEffect(() => {
    if (!aberto) return

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') fecharRef.current()
    }

    travarFundo()
    document.addEventListener('keydown', aoTeclar)

    return () => {
      soltarFundo()
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])
}
