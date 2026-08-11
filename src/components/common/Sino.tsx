import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Bell, Check, CheckCheck, Info, XCircle, type LucideIcon } from 'lucide-react'
import { useMarcarLida, useMarcarTodasLidas, useNaoLidas, useNotificacoes, useSincronizarNotificacoes } from '@/hooks'
import { useSessao } from '@/contexts'
import { tempoRelativo } from '@/utils/datas'
import { cn } from '@/utils/cn'
import type { TipoNotificacao } from '@/types'

const ESTILO: Record<TipoNotificacao, { icone: LucideIcon; classe: string }> = {
  info: { icone: Info, classe: 'bg-quartzo-100 text-quartzo-700' },
  sucesso: { icone: Check, classe: 'bg-[#E8F0EA] text-sucesso' },
  alerta: { icone: AlertTriangle, classe: 'bg-ouro-100 text-ouro-700' },
  erro: { icone: XCircle, classe: 'bg-[#F7E9EA] text-perigo' },
}

/**
 * Sino de avisos.
 *
 * Os avisos são recalculados na abertura e a cada 5 minutos: são sempre
 * um retrato do agora, nunca uma caixa de entrada que acumula coisa
 * resolvida.
 */
export function Sino() {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  const { dados: notificacoes } = useNotificacoes()
  const { dados: naoLidas } = useNaoLidas()
  const { soAgenda } = useSessao()
  const sincronizar = useSincronizarNotificacoes()
  const marcarLida = useMarcarLida()
  const marcarTodas = useMarcarTodasLidas()

  /*
    Recalcula ao abrir o sistema e de tempos em tempos.

    O `catch` não é zelo excessivo: `void promessa` sem tratamento vira
    rejeição não tratada, e este intervalo dispara sozinho para sempre.
    Uma fonte fora do ar transformava o sino num alarme silencioso que
    só o console ouvia.
  */
  useEffect(() => {
    if (soAgenda) return

    const apurar = () => {
      void sincronizar.executar(undefined).catch(() => {
        // Notificação é conveniência. Falhar aqui não interrompe nada
        // do que a pessoa veio fazer, e avisar sobre o aviso seria pior.
      })
    }

    apurar()
    const relogio = setInterval(apurar, 300_000)
    return () => clearInterval(relogio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soAgenda])

  // Clique fora fecha.
  useEffect(() => {
    if (!aberto) return

    const aoClicar = (evento: MouseEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false)
    }

    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [aberto])

  const total = naoLidas ?? 0

  /*
    Sem sino no acesso restrito.

    Tudo o que ele anuncia — estoque no mínimo, caixa aberto, backup
    atrasado — mora atrás de uma porta que ela não abre. Um sino que
    nunca toca é ruído visual; um que tocasse levaria a um erro de
    permissão, que é pior.
  */
  if (soAgenda) return null

  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto((a) => !a)}
        className="relative rounded-xl p-2 text-onix-500 transition-colors hover:bg-onix-50 hover:text-onix-800"
        aria-label={total > 0 ? `${total} avisos não lidos` : 'Avisos'}
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
        {total > 0 && (
          <span className="tabular absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-marca px-1 text-[10px] font-medium text-marca-contraste">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,340px)] overflow-hidden rounded-2xl border border-onix-100 bg-white shadow-alta"
          >
            <div className="flex items-center justify-between gap-3 border-b border-onix-100 px-4 py-3">
              <p className="font-display text-[13px] uppercase tracking-[0.14em] text-onix-700">
                Avisos
              </p>
              {total > 0 && (
                <button
                  onClick={() => void marcarTodas.executar(undefined)}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-onix-400 transition-colors hover:text-onix-800"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Marcar lidas
                </button>
              )}
            </div>

            <div className="scroll-fino max-h-[min(60vh,420px)] overflow-y-auto">
              {!notificacoes?.length ? (
                <p className="px-4 py-10 text-center text-[13px] leading-relaxed text-onix-400">
                  Nada precisa da sua atenção agora.
                </p>
              ) : (
                <ul className="divide-y divide-onix-50">
                  {notificacoes.map((notificacao) => {
                    const { icone: Icone, classe } = ESTILO[notificacao.tipo]

                    const conteudo = (
                      <>
                        <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', classe)}>
                          <Icone className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block text-[13.5px] leading-snug',
                              notificacao.lida ? 'text-onix-500' : 'font-medium text-onix-800',
                            )}
                          >
                            {notificacao.titulo}
                          </span>
                          {notificacao.detalhe && (
                            <span className="mt-0.5 block text-[12px] leading-snug text-onix-400">
                              {notificacao.detalhe}
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] text-onix-300">
                            {tempoRelativo(notificacao.criadoEm)}
                          </span>
                        </span>
                        {!notificacao.lida && (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-marca" />
                        )}
                      </>
                    )

                    const aoAbrir = () => {
                      if (!notificacao.lida) void marcarLida.executar(notificacao.id)
                      setAberto(false)
                    }

                    return (
                      <li key={notificacao.id}>
                        {notificacao.destino ? (
                          <Link
                            to={notificacao.destino}
                            onClick={aoAbrir}
                            className="flex gap-3 px-4 py-3 transition-colors hover:bg-quartzo-50"
                          >
                            {conteudo}
                          </Link>
                        ) : (
                          <button
                            onClick={aoAbrir}
                            className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-quartzo-50"
                          >
                            {conteudo}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
