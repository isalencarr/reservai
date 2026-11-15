import { type Interval, overlaps } from './schedule.ts'
import { MINUTE_MS } from './time.ts'

export type AvailabilityInput = {
  /** Faixas de expediente do dia, já em UTC. */
  working: Interval[]
  /** Tudo que segura horário: agendamentos e bloqueios. */
  busy: Interval[]
  durationMinutes: number
  slotMinutes: number
  now: Date
  minLeadMinutes: number
}

/**
 * Horários de início em que o serviço cabe inteiro. Três filtros, nesta ordem:
 * termina dentro da faixa de expediente, não toca nada ocupado e respeita a
 * antecedência mínima do prestador. Oferecer um horário que não cabe foi o furo
 * que derrubou a primeira versão da regra.
 */
export function availableStarts(input: AvailabilityInput): Date[] {
  const { working, busy, durationMinutes, slotMinutes, now, minLeadMinutes } = input
  if (durationMinutes <= 0 || slotMinutes <= 0) return []

  const durationMs = durationMinutes * MINUTE_MS
  const stepMs = slotMinutes * MINUTE_MS
  const earliest = now.getTime() + minLeadMinutes * MINUTE_MS
  const starts: Date[] = []

  for (const band of working) {
    for (let at = band.start.getTime(); at + durationMs <= band.end.getTime(); at += stepMs) {
      if (at < earliest) continue
      const candidate = { start: new Date(at), end: new Date(at + durationMs) }
      if (busy.some((b) => overlaps(candidate, b))) continue
      starts.push(candidate.start)
    }
  }

  return starts
}
