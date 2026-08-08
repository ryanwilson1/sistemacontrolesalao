import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, RotateCcw, Save } from 'lucide-react'
import { Botao } from '@/components/ui'
import { cn } from '@/utils/cn'

/**
 * Barra que aparece quando há algo para salvar.
 *
 * Resolve três coisas de uma vez, e as três estavam quebradas em telas
 * longas como a de identidade do salão:
 *
 * 1. **O botão salvar fica sempre alcançável.** Antes ele morava no pé
 *    da página. Num celular, depois de editar o quinto campo, salvar
 *    exigia rolar até o fim — e é exatamente aí que se esquece.
 *
 * 2. **Ela só existe quando há alteração.** Uma barra permanente vira
 *    parte do cenário e para de ser lida. Esta aparece porque algo
 *    mudou, o que já é metade do recado.
 *
 * 3. **"Salvo" significa salvo.** O estado vem de quem chamou, e quem
 *    chamou só o marca depois que o banco confirmou. A regra 9 do
 *    escopo em uma frase: nunca dizer "salvo com sucesso" antes da
 *    confirmação.
 */

export type EstadoDoSalvamento = 'parado' | 'salvando' | 'salvo'

export function BarraDeSalvamento({
  visivel,
  estado,
  aoSalvar,
  aoDescartar,
  rotulo = 'Salvar alterações',
}: {
  visivel: boolean
  estado: EstadoDoSalvamento
  aoSalvar: () => void
  aoDescartar?: () => void
  rotulo?: string
}) {
  return (
    <AnimatePresence>
      {(visivel || estado === 'salvando') && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          /*
            `bottom-[72px]` no celular: a barra inferior de navegação
            ocupa aquele espaço, e sobrepor as duas esconderia a
            navegação atrás de um botão de salvar — trocando um problema
            por outro pior.
          */
          className={cn(
            'fixed inset-x-0 bottom-[72px] z-30 px-4 pb-2',
            'lg:bottom-0 lg:left-[268px] lg:px-6 lg:pb-4',
          )}
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex w-full max-w-[1320px] items-center gap-3 rounded-2xl border border-onix-100 bg-white/95 px-4 py-3 shadow-alta backdrop-blur-lg">
            <span className="min-w-0 flex-1">
              {estado === 'salvando' ? (
                <span className="flex items-center gap-2 text-[13.5px] text-onix-500">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  Salvando…
                </span>
              ) : estado === 'salvo' ? (
                <span className="flex items-center gap-2 text-[13.5px] text-sucesso">
                  <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  Salvo
                </span>
              ) : (
                <span className="block truncate text-[13.5px] text-onix-500">
                  Você tem alterações não salvas
                </span>
              )}
            </span>

            {aoDescartar && estado === 'parado' && (
              <Botao variante="fantasma" tamanho="sm" onClick={aoDescartar}>
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Descartar</span>
              </Botao>
            )}

            <Botao
              variante="ouro"
              tamanho="sm"
              onClick={aoSalvar}
              carregando={estado === 'salvando'}
              disabled={estado === 'salvando'}
            >
              {estado !== 'salvando' && <Save className="h-3.5 w-3.5" />}
              {rotulo}
            </Botao>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Diálogo de saída com alterações pendentes.
 *
 * As palavras foram escolhidas com cuidado. "Sair sem salvar" diz o que
 * acontece; "Descartar" e "OK" não dizem. Num diálogo que aparece por
 * engano — e este aparece sempre por engano — a pessoa lê o botão, não
 * o texto.
 */
export function ConfirmarSaida({
  aberto,
  aoContinuar,
  aoSair,
}: {
  aberto: boolean
  aoContinuar: () => void
  aoSair: () => void
}) {
  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-onix-900/30 backdrop-blur-[2px]" onClick={aoContinuar} />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-saida"
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-alta"
      >
        <h2
          id="titulo-saida"
          className="font-display text-lg font-medium tracking-wide text-onix-900"
        >
          Você tem alterações não salvas
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-onix-500">
          Se sair agora, o que você digitou será perdido.
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Botao variante="fantasma" onClick={aoSair} bloco className="sm:w-auto">
            Sair sem salvar
          </Botao>
          <Botao variante="principal" onClick={aoContinuar} bloco className="sm:w-auto" autoFocus>
            Continuar editando
          </Botao>
        </div>
      </motion.div>
    </div>
  )
}
