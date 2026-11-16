import { describe, expect, it } from 'bun:test'
import { paidUntilDate, paidUntilInstant, paymentState } from './subscription.ts'

const SP = 'America/Sao_Paulo'

describe('paymentState', () => {
  const agora = new Date('2026-11-15T12:00:00Z')

  it('separa salão sem pagamento de salão vencido', () => {
    expect(paymentState(null, agora)).toBe('sem-registro')
    expect(paymentState(undefined, agora)).toBe('sem-registro')
    expect(paymentState(new Date('2026-11-01T00:00:00Z'), agora)).toBe('vencido')
  })

  it('está em dia enquanto o prazo não passou', () => {
    expect(paymentState(new Date('2026-12-01T00:00:00Z'), agora)).toBe('em-dia')
  })

  it('vence no instante do prazo', () => {
    expect(paymentState(agora, agora)).toBe('vencido')
  })
})

describe('paidUntilInstant', () => {
  it('o dia pago vale até a virada, no fuso do salão', () => {
    // 10/11 em São Paulo (UTC-3) termina às 03:00 UTC do dia 11.
    expect(paidUntilInstant('2026-11-10', SP).toISOString()).toBe('2026-11-11T03:00:00.000Z')
  })

  it('quem pagou até hoje continua em dia durante o dia', () => {
    const prazo = paidUntilInstant('2026-11-15', SP)
    expect(paymentState(prazo, new Date('2026-11-15T20:00:00Z'))).toBe('em-dia')
    expect(paymentState(prazo, new Date('2026-11-16T04:00:00Z'))).toBe('vencido')
  })
})

describe('paidUntilDate', () => {
  it('devolve o mesmo dia que entrou', () => {
    for (const dia of ['2026-12-31', '2026-11-10', '2027-01-01']) {
      expect(paidUntilDate(paidUntilInstant(dia, SP), SP)).toBe(dia)
    }
  })

  it('não adianta o dia na virada do ano', () => {
    expect(paidUntilDate(new Date('2027-01-01T03:00:00Z'), SP)).toBe('2026-12-31')
  })
})
