import { describe, expect, it } from 'bun:test'
import { slugify } from './slug.ts'

describe('slugify', () => {
  it('tira acento, espaço e maiúscula', () => {
    expect(slugify('Salão da Inês')).toBe('salao-da-ines')
    expect(slugify('  Beleza  Pura  ')).toBe('beleza-pura')
  })

  it('não deixa traço sobrando nas pontas', () => {
    expect(slugify('!!! Studio Norte ???')).toBe('studio-norte')
  })
})
