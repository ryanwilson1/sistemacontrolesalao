import { CalendarPlus } from 'lucide-react'
import {
  baixarIcs, linkGoogleCalendar, linkOutlook, type EventoDeCalendario,
} from '@/utils/calendario'

/**
 * Botões de "adicionar ao calendário".
 *
 * Três, e não um menu: menu esconde a ação atrás de um toque a mais, e
 * este é o momento em que a cliente está mais disposta a agir — logo
 * depois de confirmar, com a tela de sucesso na frente.
 */
export function AdicionarAoCalendario({ evento }: { evento: EventoDeCalendario }) {
  const classe =
    'inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border ' +
    'border-onix-200 bg-white px-3 text-[13px] font-medium text-onix-600 ' +
    'transition-colors hover:border-marca hover:text-onix-900'

  return (
    <div className="mt-5">
      <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.14em] text-onix-300">
        <CalendarPlus className="h-3 w-3" /> Salvar no calendário
      </p>

      <div className="flex gap-2">
        <a href={linkGoogleCalendar(evento)} target="_blank" rel="noopener noreferrer" className={classe}>
          Google
        </a>
        <button type="button" onClick={() => baixarIcs(evento)} className={classe}>
          Apple
        </button>
        <a href={linkOutlook(evento)} target="_blank" rel="noopener noreferrer" className={classe}>
          Outlook
        </a>
      </div>
    </div>
  )
}
