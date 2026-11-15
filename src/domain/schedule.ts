import { type LocalDate, MINUTE_MS, toUtc, weekdayOf } from './time.ts'

export type Interval = { start: Date; end: Date }
export type Busy<T> = Interval & { data: T }

export type WorkHour = { weekday: number; startMinute: number; endMinute: number }

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end
}

export function byStart(a: Interval, b: Interval): number {
  return a.start.getTime() - b.start.getTime()
}

/** Junta faixas que se tocam ou se sobrepõem, para a jornada virar uma lista limpa. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort(byStart)
  const merged: Interval[] = []
  for (const item of sorted) {
    const last = merged.at(-1)
    if (last && item.start <= last.end) {
      if (item.end > last.end) last.end = item.end
    } else {
      merged.push({ start: item.start, end: item.end })
    }
  }
  return merged
}

/** Jornada do prestador naquela data, já convertida para instantes UTC. */
export function workingIntervals(hours: WorkHour[], date: LocalDate, timeZone: string): Interval[] {
  const weekday = weekdayOf(date)
  const todays = hours
    .filter((h) => h.weekday === weekday && h.endMinute > h.startMinute)
    .map((h) => ({
      start: toUtc(date, h.startMinute, timeZone),
      end: toUtc(date, h.endMinute, timeZone),
    }))
  return mergeIntervals(todays)
}

export type GridRow<T> =
  | { kind: 'free'; start: Date; end: Date }
  | { kind: 'busy'; start: Date; end: Date; span: number; data: T }

export type GridBand<T> = { start: Date; end: Date; rows: GridRow<T>[] }

/**
 * Monta o dia como faixas de jornada divididas em slots. Um compromisso que
 * começa fora da grade é alinhado ao slot que o contém: a tela precisa de linhas
 * inteiras, e o conflito real continua sendo decidido pelos instantes, não aqui.
 */
export function buildDayGrid<T>(
  working: Interval[],
  busy: Busy<T>[],
  slotMinutes: number,
): GridBand<T>[] {
  const slotMs = slotMinutes * MINUTE_MS
  const pending = [...busy].sort(byStart)

  return working.map((band) => {
    const rows: GridRow<T>[] = []
    let cursor = band.start.getTime()

    while (cursor < band.end.getTime()) {
      const slotEnd = Math.min(cursor + slotMs, band.end.getTime())
      const hit = pending.find((b) => b.start.getTime() < slotEnd && b.end.getTime() > cursor)

      if (hit) {
        const until = Math.min(Math.max(hit.end.getTime(), slotEnd), band.end.getTime())
        const span = Math.max(1, Math.ceil((until - cursor) / slotMs))
        rows.push({
          kind: 'busy',
          start: hit.start,
          end: hit.end,
          span,
          data: hit.data,
        })
        pending.splice(pending.indexOf(hit), 1)
        cursor += span * slotMs
      } else {
        rows.push({ kind: 'free', start: new Date(cursor), end: new Date(slotEnd) })
        cursor = slotEnd
      }
    }

    return { start: band.start, end: band.end, rows }
  })
}
