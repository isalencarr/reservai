import { describe, expect, it } from 'bun:test'
import {
  addDays,
  formatMinute,
  formatTime,
  localDate,
  minuteOfDay,
  toUtc,
  weekdayOf,
} from './time.ts'

const SP = 'America/Sao_Paulo'
const NY = 'America/New_York'

describe('toUtc', () => {
  it('converte hora local de São Paulo para UTC', () => {
    expect(toUtc('2026-11-16', 9 * 60, SP).toISOString()).toBe('2026-11-16T12:00:00.000Z')
  })

  it('converte a meia-noite local sem cair no dia anterior', () => {
    expect(toUtc('2026-11-16', 0, SP).toISOString()).toBe('2026-11-16T03:00:00.000Z')
  })

  it('respeita o horário de verão antes e depois do salto', () => {
    expect(toUtc('2026-03-07', 12 * 60, NY).toISOString()).toBe('2026-03-07T17:00:00.000Z')
    expect(toUtc('2026-03-09', 12 * 60, NY).toISOString()).toBe('2026-03-09T16:00:00.000Z')
  })

  it('é o inverso de minuteOfDay', () => {
    const instant = toUtc('2026-11-16', 13 * 60 + 30, SP)
    expect(minuteOfDay(instant, SP)).toBe(13 * 60 + 30)
    expect(localDate(instant, SP)).toBe('2026-11-16')
  })
})

describe('weekdayOf', () => {
  it('usa domingo como zero', () => {
    expect(weekdayOf('2026-11-15')).toBe(0)
    expect(weekdayOf('2026-11-16')).toBe(1)
    expect(weekdayOf('2026-11-21')).toBe(6)
  })
})

describe('addDays', () => {
  it('atravessa mês e ano', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('formatação', () => {
  it('formata minuto do dia', () => {
    expect(formatMinute(9 * 60)).toBe('09:00')
    expect(formatMinute(13 * 60 + 5)).toBe('13:05')
  })

  it('formata o instante no fuso do salão', () => {
    expect(formatTime(new Date('2026-11-16T12:00:00Z'), SP)).toBe('09:00')
  })
})
