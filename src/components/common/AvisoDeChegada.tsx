import { useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, Clock, X } from 'lucide-react'
import { useSessao } from '@/contexts'
import { useRelogio } from '@/hooks/useTempoReal'
import { useChegadasDoPortal } from '@/hooks'
import { chegadasRecentes, nomeDaCliente } from '@/services'
import { ROTAS } from '@/constants'
import { dataRelativa, hora } from '@/utils/datas'
import type { AgendamentoDetalhado } from '@/types'

/**
 * Aviso de agendamento recém-chegado.
 *
 * Aparece sozinho quando uma cliente confirma pelo portal — sem
 * recarregar, sem clicar em nada. Dura o tempo de ser lido e sai.
 *
 * Fica separado do sino de propósito. O sino é a lista do que precisa de
 * atenção *em algum momento*; este cartão é o que está acontecendo
 * *agora*, e as duas coisas pedem tratamentos diferentes: uma se
 * consulta, a outra se anuncia.
 */

/** De quanto em quanto tempo o painel olha se chegou algo. */
const RITMO_MS = 8_000

/** Quanto tempo o cartão fica na tela antes de sair sozinho. */
const DURACAO_MS = 9_000

export function AvisoDeChegada() {
  const { ehGestor } = useSessao()
  const navegar = useNavigate()
  const { chegadas, anunciar, dispensar } = useChegadasDoPortal(DURACAO_MS)

  // A referência evita recriar o relógio a cada render.
  const anunciarRef = useRef(anunciar)
  anunciarRef.current = anunciar

  const verificar = useCallback(() => {
    void chegadasRecentes().then((novos) => {
      if (novos.length > 0) anunciarRef.current(novos)
    })
  }, [])

  /*
    O relógio só corre para quem vê o aviso.

    A varredura ficava acima do `if (!ehGestor) return null`, e as
    regras dos hooks obrigam a chamada a acontecer sempre — mas obrigam
    a *chamar*, não a *trabalhar*. O resultado era uma leitura da agenda
    inteira a cada oito segundos no aparelho de toda a equipe, para
    alimentar um cartão que aquela pessoa nunca veria.

    No celular, oito segundos é ininterrupto: a bateria some e a tela
    engasga em cada ciclo. Passar `0` desliga o relógio sem quebrar a
    ordem dos hooks.
  */
  useRelogio(verificar, ehGestor ? RITMO_MS : 0)

  if (!ehGestor) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col items-center gap-2 p-4 pt-safe sm:inset-x-auto sm:right-4 sm:items-end"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {chegadas.map((agendamento) => (
          <Cartao
            key={agendamento.id}
            agendamento={agendamento}
            aoAbrir={() => {
              dispensar(agendamento.id)
              navegar(ROTAS.agenda)
            }}
            aoFechar={() => dispensar(agendamento.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Cartao({
  agendamento, aoAbrir, aoFechar,
}: {
  agendamento: AgendamentoDetalhado
  aoAbrir: () => void
  aoFechar: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border border-ouro-200 bg-white shadow-alta"
    >
      <span className="filete-ouro block h-[3px] w-full" />

      <button onClick={aoAbrir} className="flex w-full items-start gap-3 p-3.5 text-left">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ouro-100 text-ouro-600">
          <BellRing className="h-4 w-4" strokeWidth={2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="eyebrow block text-ouro-600">Novo agendamento</span>

          <span className="mt-1 block truncate text-[15px] font-medium leading-snug text-onix-900">
            {nomeDaCliente(agendamento)}
          </span>

          <span className="mt-0.5 block truncate text-[13px] leading-snug text-onix-400">
            {agendamento.servico?.nome ?? 'Atendimento'}
            {agendamento.profissional && ` · ${agendamento.profissional.nome}`}
          </span>

          <span className="tabular mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-onix-600">
            <Clock className="h-3 w-3" />
            {hora(agendamento.inicio)} · {dataRelativa(agendamento.inicio)}
          </span>
        </span>
      </button>

      <button
        onClick={aoFechar}
        className="absolute right-2.5 top-4 rounded-lg p-1 text-onix-300 transition-colors hover:text-onix-600"
        aria-label="Dispensar aviso"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}
