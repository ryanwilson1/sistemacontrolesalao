import {
  addDays, addMinutes, differenceInMinutes, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isToday, isTomorrow, parseISO, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Datas em português, com nomes que dizem o que fazem. */

const L = { locale: ptBR }

export const dt = (v: string | Date): Date => (typeof v === 'string' ? parseISO(v) : v)

/* ---------- Formatação ---------- */
export const dataCurta = (v: string | Date) => format(dt(v), "d 'de' MMM", L)
export const dataLonga = (v: string | Date) => format(dt(v), "EEEE, d 'de' MMMM", L)
export const dataNumerica = (v: string | Date) => format(dt(v), 'dd/MM/yyyy')
export const hora = (v: string | Date) => format(dt(v), 'HH:mm')
export const mesPorExtenso = (v: string | Date) => format(dt(v), 'MMMM', L)
export const mesAno = (v: string | Date) => format(dt(v), "MMMM 'de' yyyy", L)
export const isoData = (v: Date) => format(v, 'yyyy-MM-dd')

/** "Hoje", "Amanhã" ou a data por extenso. */
export function dataRelativa(v: string | Date): string {
  const d = dt(v)
  if (isToday(d)) return 'Hoje'
  if (isTomorrow(d)) return 'Amanhã'
  return format(d, "EEEE, d 'de' MMMM", L)
}

/** "há 3 dias", "em 2 meses" */
export function tempoRelativo(v: string | Date): string {
  const dias = Math.round((Date.now() - dt(v).getTime()) / 86_400_000)
  const absoluto = Math.abs(dias)
  const formatador = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

  if (absoluto < 1) return 'hoje'
  if (absoluto < 30) return formatador.format(-dias, 'day')
  if (absoluto < 365) return formatador.format(-Math.round(dias / 30), 'month')
  return formatador.format(-Math.round(dias / 365), 'year')
}

/* ---------- Recortes de calendário ---------- */
export const primeiroDiaDoMes = (d: Date) => startOfMonth(d)
export const ultimoDiaDoMes = (d: Date) => endOfMonth(d)

export const semanaDe = (d: Date) => ({
  inicio: startOfWeek(d, { weekStartsOn: 0 }),
  fim: endOfWeek(d, { weekStartsOn: 0 }),
})

export const diasDaSemana = (d: Date) =>
  eachDayOfInterval({ start: startOfWeek(d, { weekStartsOn: 0 }), end: endOfWeek(d, { weekStartsOn: 0 }) })

export const diasDoMes = (d: Date) =>
  eachDayOfInterval({
    start: startOfWeek(startOfMonth(d), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(d), { weekStartsOn: 0 }),
  })

/** Faixa [início, fim) em ISO — o formato que os repositórios esperam. */
export function faixaDoDia(d: Date) {
  const inicio = startOfDay(d)
  return { de: inicio.toISOString(), ate: addDays(inicio, 1).toISOString() }
}

export function faixaDeDias(inicio: Date, fim: Date) {
  return { de: startOfDay(inicio).toISOString(), ate: addDays(startOfDay(fim), 1).toISOString() }
}

/** Minutos decorridos desde a meia-noite. Base da grade da agenda. */
export function minutosDoDia(v: string | Date): number {
  const d = dt(v)
  return d.getHours() * 60 + d.getMinutes()
}

/** "09:30" aplicado a uma data. */
export function comHora(data: Date, horaTexto: string): Date {
  const [h, m] = horaTexto.split(':').map(Number)
  const saida = new Date(data)
  saida.setHours(h ?? 0, m ?? 0, 0, 0)
  return saida
}

export {
  addDays, addMinutes, differenceInMinutes, endOfMonth, format,
  isSameDay, isToday, startOfDay, startOfMonth,
}
