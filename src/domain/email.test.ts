import { describe, expect, it } from 'bun:test'
import { normalizeEmail } from './email.ts'

describe('normalizeEmail', () => {
  it('tira espaço e caixa', () => {
    expect(normalizeEmail('  Carla@BelezaPura.com.BR ')).toBe('carla@belezapura.com.br')
  })

  it('recusa o que não tem cara de e-mail', () => {
    expect(normalizeEmail('carla')).toBeUndefined()
    expect(normalizeEmail('carla@')).toBeUndefined()
    expect(normalizeEmail('carla@salao')).toBeUndefined()
    expect(normalizeEmail('a b@salao.com')).toBeUndefined()
    expect(normalizeEmail('')).toBeUndefined()
    expect(normalizeEmail(undefined)).toBeUndefined()
  })

  it('aceita subdomínio e sinal de mais', () => {
    expect(normalizeEmail('carla+teste@mail.salao.com.br')).toBe('carla+teste@mail.salao.com.br')
  })
})
