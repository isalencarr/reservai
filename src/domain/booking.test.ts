import { describe, expect, it } from 'bun:test'
import {
  canCustomerCancel,
  canRequest,
  confirmDeadline,
  isOverdue,
  remainingMinutes,
} from './booking.ts'

const now = new Date('2026-11-16T12:00:00Z')
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000)

describe('confirmDeadline', () => {
  it('usa as 24 horas quando o atendimento está longe', () => {
    expect(confirmDeadline(hours(72), now, 60).toISOString()).toBe('2026-11-17T12:00:00.000Z')
  })

  it('usa a antecedência quando o atendimento está perto', () => {
    // Pedido na sexta 18h para sábado 9h: 24h estourariam depois do atendimento.
    expect(confirmDeadline(hours(15), now, 60).toISOString()).toBe('2026-11-17T02:00:00.000Z')
  })

  it('acompanha a antecedência configurada pelo prestador', () => {
    expect(confirmDeadline(hours(2), now, 15).toISOString()).toBe('2026-11-16T13:45:00.000Z')
  })
})

describe('isOverdue e remainingMinutes', () => {
  it('vence no instante do prazo', () => {
    expect(isOverdue(now, now)).toBe(true)
    expect(isOverdue(hours(1), now)).toBe(false)
  })

  it('não devolve tempo negativo', () => {
    expect(remainingMinutes(hours(-3), now)).toBe(0)
    expect(remainingMinutes(hours(2), now)).toBe(120)
  })
})

describe('canRequest', () => {
  it('aceita pedido com folga para a resposta', () => {
    expect(canRequest(hours(3), now, 60)).toBe(true)
  })

  it('recusa pedido em cima da hora', () => {
    expect(canRequest(hours(0.5), now, 60)).toBe(false)
    expect(canRequest(hours(1), now, 60)).toBe(false)
  })
})

describe('canCustomerCancel', () => {
  it('libera até duas horas antes e fecha depois', () => {
    expect(canCustomerCancel(hours(3), now)).toBe(true)
    expect(canCustomerCancel(hours(2), now)).toBe(true)
    expect(canCustomerCancel(hours(1.5), now)).toBe(false)
  })
})
