/**
 * "Adicionar ao meu calendário".
 *
 * Três caminhos porque não existe um só que funcione em todo lugar:
 * Google e Outlook abrem uma página web com o evento pré-preenchido;
 * Apple e qualquer outro leem um arquivo `.ics`, que é o formato que
 * todos entendem e ninguém oferece.
 *
 * Vale o esforço porque agendamento esquecido é falta, e falta é o
 * prejuízo mais silencioso de um studio: o horário some, a cliente
 * some, e ninguém registra o motivo.
 */

export interface EventoDeCalendario {
  titulo: string
  inicio: Date
  fim: Date
  descricao?: string
  local?: string
}

/** "20260807T143000Z" — o formato que os calendários esperam. */
const carimbo = (data: Date): string =>
  data.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function linkGoogleCalendar(evento: EventoDeCalendario): string {
  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: evento.titulo,
    dates: `${carimbo(evento.inicio)}/${carimbo(evento.fim)}`,
    details: evento.descricao ?? '',
    location: evento.local ?? '',
  })

  return `https://calendar.google.com/calendar/render?${parametros.toString()}`
}

export function linkOutlook(evento: EventoDeCalendario): string {
  const parametros = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: evento.titulo,
    startdt: evento.inicio.toISOString(),
    enddt: evento.fim.toISOString(),
    body: evento.descricao ?? '',
    location: evento.local ?? '',
  })

  return `https://outlook.live.com/calendar/0/deeplink/compose?${parametros.toString()}`
}

/**
 * O arquivo `.ics`, montado à mão.
 *
 * São vinte linhas contra uma biblioteca inteira — e o formato não muda
 * desde 1998. As quebras de linha precisam ser CRLF: iPhone e Outlook
 * recusam o arquivo em silêncio se forem só LF, que é o tipo de bug
 * que ninguém descobre até a cliente reclamar.
 */
export function montarIcs(evento: EventoDeCalendario): string {
  const escapar = (texto: string) =>
    texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//System Studio//Agendamento//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${carimbo(evento.inicio)}-${Math.random().toString(36).slice(2, 8)}@systemstudio`,
    `DTSTAMP:${carimbo(new Date())}`,
    `DTSTART:${carimbo(evento.inicio)}`,
    `DTEND:${carimbo(evento.fim)}`,
    `SUMMARY:${escapar(evento.titulo)}`,
    evento.descricao ? `DESCRIPTION:${escapar(evento.descricao)}` : '',
    evento.local ? `LOCATION:${escapar(evento.local)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Lembrete',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

/** Baixa o `.ics`. No iPhone, abrir o arquivo já oferece adicionar. */
export function baixarIcs(evento: EventoDeCalendario, nomeArquivo = 'horario.ics'): void {
  const arquivo = new Blob([montarIcs(evento)], { type: 'text/calendar;charset=utf-8' })
  const endereco = URL.createObjectURL(arquivo)

  const ancora = document.createElement('a')
  ancora.href = endereco
  ancora.download = nomeArquivo
  document.body.appendChild(ancora)
  ancora.click()
  ancora.remove()

  // Revogar na hora quebra o download em alguns navegadores móveis.
  window.setTimeout(() => URL.revokeObjectURL(endereco), 2000)
}
