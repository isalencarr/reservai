import { describe, expect, it } from 'bun:test'
import { CODE_TTL_MINUTES, codeExpiry, generateCode, hashCode } from './access-code.ts'

describe('generateCode', () => {
  it('devolve sempre seis dígitos', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/)
  })
})

describe('hashCode', () => {
  it('é estável e diferente por código', () => {
    expect(hashCode('123456')).toBe(hashCode('123456'))
    expect(hashCode('123456')).not.toBe(hashCode('123457'))
    expect(hashCode('123456')).not.toContain('123456')
  })
})

describe('codeExpiry', () => {
  it('vale dez minutos', () => {
    const now = new Date('2026-11-16T12:00:00Z')
    expect(codeExpiry(now).toISOString()).toBe('2026-11-16T12:10:00.000Z')
    expect(CODE_TTL_MINUTES).toBe(10)
  })
})
