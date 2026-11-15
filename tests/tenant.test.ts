import { describe, expect, it } from 'bun:test'
import { createCompanyRepo } from '../src/repos/companies.ts'
import { areaOf, normalizeHost, resolveTenant, subdomainOf } from '../src/web/tenant.ts'
import { createSeededDb } from './helpers.ts'

describe('normalizeHost', () => {
  it('remove porta, espaços e maiúsculas', () => {
    expect(normalizeHost('  Beleza-Pura.localhost:3000 ')).toBe('beleza-pura.localhost')
  })

  it('remove o ponto final do host absoluto', () => {
    expect(normalizeHost('beleza-pura.localhost.')).toBe('beleza-pura.localhost')
  })
})

describe('subdomainOf', () => {
  it('devolve o primeiro rótulo', () => {
    expect(subdomainOf('beleza-pura.localhost')).toBe('beleza-pura')
  })

  it('ignora www e host sem rótulo', () => {
    expect(subdomainOf('www.exemplo.com')).toBeUndefined()
    expect(subdomainOf('localhost')).toBeUndefined()
  })
})

describe('areaOf', () => {
  it('separa o endereço do cliente do endereço da equipe', () => {
    expect(areaOf('beleza-pura.localhost')).toBe('customer')
    expect(areaOf('equipe.beleza-pura.localhost')).toBe('staff')
  })
})

describe('resolveTenant', () => {
  it('encontra pelo host cadastrado', async () => {
    const { db } = await createSeededDb()
    const found = await resolveTenant(createCompanyRepo(db), 'studio-norte.localhost:3000')
    expect(found?.company.slug).toBe('studio-norte')
    expect(found?.area).toBe('customer')
  })

  it('encontra o mesmo salão pelo endereço da equipe', async () => {
    const { db } = await createSeededDb()
    const found = await resolveTenant(createCompanyRepo(db), 'equipe.beleza-pura.localhost:3000')
    expect(found?.company.slug).toBe('beleza-pura')
    expect(found?.area).toBe('staff')
  })

  it('não encontra empresa para host desconhecido', async () => {
    const { db } = await createSeededDb()
    expect(await resolveTenant(createCompanyRepo(db), 'outro.exemplo.com')).toBeUndefined()
    expect(await resolveTenant(createCompanyRepo(db), 'equipe.outro.com')).toBeUndefined()
  })

  it('isola empresas diferentes no mesmo servidor', async () => {
    const { db } = await createSeededDb()
    const repo = createCompanyRepo(db)
    const a = await resolveTenant(repo, 'beleza-pura.localhost')
    const b = await resolveTenant(repo, 'studio-norte.localhost')
    expect(a?.company.id).not.toBe(b?.company.id)
  })
})
