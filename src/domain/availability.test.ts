import { describe, expect, it } from 'bun:test'
import { availableStarts } from './availability.ts'
import { workingIntervals } from './schedule.ts'
import { formatTime, toUtc } from './time.ts'

const SP = 'America/Sao_Paulo'
const DATE = '2026-11-16' // segunda-feira
const at = (minute: number) => toUtc(DATE, minute, SP)
const hours = [
  { weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
  { weekday: 1, startMinute: 13 * 60, endMinute: 18 * 60 },
]
const working = workingIntervals(hours, DATE, SP)
const YESTERDAY = new Date('2026-11-15T12:00:00Z')

const starts = (over: Partial<Parameters<typeof availableStarts>[0]>) =>
  availableStarts({
    working,
    busy: [],
    durationMinutes: 60,
    slotMinutes: 60,
    now: YESTERDAY,
    minLeadMinutes: 60,
    ...over,
  }).map((d) => formatTime(d, SP))

describe('availableStarts', () => {
  it('oferece um início por slot quando o dia está vazio', () => {
    expect(starts({})).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ])
  })

  it('não oferece horário em que o serviço estoura o fim do expediente', () => {
    expect(starts({ durationMinutes: 180 })).toEqual(['09:00', '13:00', '14:00', '15:00'])
  })

  it('aceita o serviço que termina exatamente no fim da faixa', () => {
    expect(starts({ durationMinutes: 120 })).toContain('16:00')
    expect(starts({ durationMinutes: 120 })).not.toContain('17:00')
  })

  it('tira os horários que esbarram em algo ocupado', () => {
    const busy = [{ start: at(10 * 60), end: at(11 * 60) }]
    expect(starts({ busy })).toEqual([
      '09:00',
      '11:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ])
  })

  it('serviço longo some quando um compromisso parte a tarde ao meio', () => {
    const busy = [{ start: at(15 * 60), end: at(16 * 60) }]
    expect(starts({ busy, durationMinutes: 180 })).toEqual(['09:00'])
  })

  it('respeita a antecedência mínima do prestador', () => {
    const now = at(9 * 60 + 30)
    expect(starts({ now, minLeadMinutes: 60 })).toEqual([
      '11:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ])
    expect(starts({ now, minLeadMinutes: 0 })).toContain('10:00')
  })

  it('usa o slot do prestador como passo entre inícios', () => {
    expect(starts({ slotMinutes: 30, durationMinutes: 30 })).toContain('09:30')
  })

  it('devolve vazio sem expediente ou com duração inválida', () => {
    expect(starts({ working: [] })).toEqual([])
    expect(starts({ durationMinutes: 0 })).toEqual([])
  })
})
