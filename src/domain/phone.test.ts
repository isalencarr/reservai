import { describe, expect, it } from 'bun:test'
import { formatPhone, normalizePhone } from './phone.ts'

describe('normalizePhone', () => {
  it('aceita as máscaras que as pessoas digitam', () => {
    expect(normalizePhone('(11) 98888-0001')).toBe('11988880001')
    expect(normalizePhone('11 9888 80001')).toBe('11988880001')
    expect(normalizePhone('+55 11 98888-0001')).toBe('11988880001')
  })

  it('aceita fixo com oito dígitos', () => {
    expect(normalizePhone('1133334444')).toBe('1133334444')
  })

  it('recusa número curto, vazio ou longo demais', () => {
    expect(normalizePhone('98888001')).toBeUndefined()
    expect(normalizePhone('')).toBeUndefined()
    expect(normalizePhone(undefined)).toBeUndefined()
    expect(normalizePhone('119888800011111')).toBeUndefined()
  })
})

describe('formatPhone', () => {
  it('escreve celular e fixo', () => {
    expect(formatPhone('11988880001')).toBe('(11) 98888-0001')
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444')
  })
})
