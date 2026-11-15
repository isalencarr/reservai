export const MINUTE_MS = 60_000
export const DAY_MINUTES = 24 * 60

/** Data local no formato `YYYY-MM-DD`. */
export type LocalDate = string

const partsFormatter = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatter.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatter.set(timeZone, fmt)
  }
  return fmt
}

function partsOf(instant: Date, timeZone: string) {
  const parts = formatterFor(timeZone).formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  // hour12:false devolve 24 para a meia-noite em alguns ambientes.
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  }
}

/** Deslocamento do fuso naquele instante, em milissegundos. */
export function offsetMs(instant: Date, timeZone: string): number {
  const p = partsOf(instant, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * Converte data local e minuto do dia no instante UTC correspondente. A segunda
 * passada existe para o salto de horário de verão, que muda o deslocamento
 * entre o palpite inicial e o instante real.
 */
export function toUtc(date: LocalDate, minuteOfDay: number, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay)
  const first = new Date(naive - offsetMs(new Date(naive), timeZone))
  return new Date(naive - offsetMs(first, timeZone))
}

/** Minuto do dia (0..1439) que o instante representa naquele fuso. */
export function minuteOfDay(instant: Date, timeZone: string): number {
  const p = partsOf(instant, timeZone)
  return p.hour * 60 + p.minute
}

export function localDate(instant: Date, timeZone: string): LocalDate {
  const p = partsOf(instant, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Domingo é 0, igual a `providerHours.weekday`. */
export function weekdayOf(date: LocalDate): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function formatTime(instant: Date, timeZone: string): string {
  const p = partsOf(instant, timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

export function formatMinute(minute: number): string {
  const n = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

const longDate = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
})

export function formatLongDate(date: LocalDate): string {
  return longDate.format(new Date(`${date}T12:00:00Z`))
}

/** Rótulo usado nas mensagens: "segunda-feira, 16 de novembro às 09:00". */
export function formatWhen(instant: Date, timeZone: string): string {
  return `${formatLongDate(localDate(instant, timeZone))} às ${formatTime(instant, timeZone)}`
}

const shortWeekday = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short' })

/** "seg.", "ter." — o suficiente para a tira de dias caber no celular. */
export function formatWeekdayShort(date: LocalDate): string {
  return shortWeekday.format(new Date(`${date}T12:00:00Z`))
}

export function formatDayMonth(date: LocalDate): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}
