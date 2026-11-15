import { describe, expect, it } from 'bun:test'
import { formatPrice, parsePrice } from './money.ts'

describe('parsePrice', () => {
  it('aceita as formas que alguém digita no celular', () => {
    expect(parsePrice('90')).toBe(9000)
    expect(parsePrice('90,00')).toBe(9000)
    expect(parsePrice('R$ 90,50')).toBe(9050)
    expect(parsePrice('1.250,00')).toBe(125000)
  })

  it('trata vazio como sem preço', () => {
    expect(parsePrice('')).toBeNull()
    expect(parsePrice(undefined)).toBeNull()
  })

  it('devolve indefinido para texto inválido', () => {
    expect(parsePrice('grátis')).toBeUndefined()
    expect(parsePrice('90,000')).toBeUndefined()
    expect(parsePrice('-10')).toBeUndefined()
  })
})

describe('formatPrice', () => {
  it('usa vírgula e duas casas', () => {
    expect(formatPrice(9050)).toBe('90,50')
    expect(formatPrice(null)).toBe('')
  })
})
