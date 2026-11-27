import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { companies, providerHours } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createCompany, updateCompany } from '../src/platform/companies.ts'
import { createApp } from '../src/web/app.tsx'
import { createTestDb, staffLogin } from './helpers.ts'

const base = {
  name: 'Salão da Inês',
  host: 'ines.com.br',
  ownerName: 'Inês Prado',
  email: 'ines@ines.com.br',
  phone: '(11) 95555-2222',
}

/** Erro de cadastro é resposta, não exceção: o terminal imprime e o formulário
 * do backoffice mostra a mesma frase. */
function errorOf(result: unknown): string {
  if (result && typeof result === 'object' && 'error' in result) {
    return String((result as { error: unknown }).error)
  }
  throw new Error(`esperava erro, veio ${JSON.stringify(result)}`)
}

function companyOf(result: Awaited<ReturnType<typeof createCompany>>) {
  if ('error' in result) throw new Error(`esperava salão, veio ${result.error}`)
  return result
}

describe('criar salão', () => {
  it('cria salão, dono e jornada', async () => {
    const db = createTestDb()
    const { company, owner } = companyOf(await createCompany(db, base))

    expect(company).toMatchObject({
      slug: 'salao-da-ines',
      host: 'ines.com.br',
      timezone: 'America/Sao_Paulo',
    })
    expect(owner).toMatchObject({ role: 'owner', phone: '11955552222' })

    const workweek = await db
      .select()
      .from(providerHours)
      .where(eq(providerHours.providerId, owner.id))
    expect(workweek).toHaveLength(12)
  })

  it('o dono criado já entra pela porta da equipe', async () => {
    const db = createTestDb()
    const { owner } = companyOf(await createCompany(db, base))
    const notifier = createLogNotifier(false)
    const app = createApp(db, notifier)

    const cookie = await staffLogin(app, notifier, 'equipe.ines.com.br', owner.email ?? '')
    const res = await app.request('/clientes', { headers: { host: 'equipe.ines.com.br', cookie } })
    expect(res.status).toBe(200)
  })

  it('grava o host sem porta, protocolo ou barra', async () => {
    const db = createTestDb()
    const { company } = companyOf(
      await createCompany(db, { ...base, host: 'https://ZeBarber.localhost:3000/agenda' }),
    )
    expect(company.host).toBe('zebarber.localhost')
  })

  it('recusa o endereço da equipe como host do salão', async () => {
    const db = createTestDb()
    const error = errorOf(await createCompany(db, { ...base, host: 'equipe.ines.com.br' }))
    expect(error).toContain('endereço do cliente')
  })

  it('recusa o endereço do backoffice', async () => {
    const db = createTestDb()
    const error = errorOf(await createCompany(db, { ...base, host: 'backoffice.localhost' }))
    expect(error).toContain('backoffice')
  })

  it('recusa fuso que o Intl não conhece', async () => {
    const db = createTestDb()
    const error = errorOf(await createCompany(db, { ...base, timezone: 'America/Sao Paulo' }))
    expect(error).toContain('Fuso horário desconhecido')
  })

  it('explica a colisão de apelido e de endereço', async () => {
    const db = createTestDb()
    await createCompany(db, base)

    expect(errorOf(await createCompany(db, { ...base, host: 'outro.com.br' }))).toContain(
      'já está em uso',
    )
    expect(errorOf(await createCompany(db, { ...base, slug: 'outro' }))).toContain(
      'Já existe um negócio em',
    )
  })

  it('recusa telefone e e-mail inválidos', async () => {
    const db = createTestDb()
    expect(errorOf(await createCompany(db, { ...base, phone: '99' }))).toContain(
      'Telefone inválido',
    )
    expect(errorOf(await createCompany(db, { ...base, email: 'nao-e-email' }))).toContain(
      'E-mail inválido',
    )
  })

  it('não mistura salões criados pelo comando', async () => {
    const db = createTestDb()
    await createCompany(db, base)
    await createCompany(db, { ...base, name: 'Outro Salão', host: 'outro.com.br' })

    expect(await db.select().from(companies)).toHaveLength(2)
  })
})

describe('editar salão', () => {
  it('troca nome, endereço, apelido e fuso', async () => {
    const db = createTestDb()
    const { company } = companyOf(await createCompany(db, base))

    const updated = await updateCompany(db, company.id, {
      name: 'Studio Inês',
      host: 'studio-ines.com.br',
      slug: 'studio-ines',
      timezone: 'America/Manaus',
    })

    expect(updated).toMatchObject({
      name: 'Studio Inês',
      host: 'studio-ines.com.br',
      slug: 'studio-ines',
      timezone: 'America/Manaus',
    })
  })

  it('deixa salvar sem mudar o próprio endereço', async () => {
    const db = createTestDb()
    const { company } = companyOf(await createCompany(db, base))

    const updated = await updateCompany(db, company.id, {
      name: 'Salão da Inês Prado',
      host: company.host,
      slug: company.slug,
      timezone: company.timezone,
    })
    expect(updated).toMatchObject({ name: 'Salão da Inês Prado' })
  })

  it('recusa endereço que já é de outro salão', async () => {
    const db = createTestDb()
    companyOf(await createCompany(db, base))
    const other = companyOf(
      await createCompany(db, { ...base, name: 'Outro', host: 'outro.com.br', slug: 'outro' }),
    )

    const error = errorOf(
      await updateCompany(db, other.company.id, {
        name: 'Outro',
        host: 'ines.com.br',
        slug: 'outro',
        timezone: 'America/Sao_Paulo',
      }),
    )
    expect(error).toContain('Já existe um negócio em')
  })

  it('o salão passa a responder no endereço novo', async () => {
    const db = createTestDb()
    const { company } = companyOf(await createCompany(db, base))
    const app = createApp(db)

    await updateCompany(db, company.id, {
      name: company.name,
      host: 'studio-ines.com.br',
      slug: company.slug,
      timezone: company.timezone,
    })

    expect((await app.request('/', { headers: { host: 'studio-ines.com.br' } })).status).toBe(200)
    expect((await app.request('/', { headers: { host: 'ines.com.br' } })).status).toBe(404)
  })
})
