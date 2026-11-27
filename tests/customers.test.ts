import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { appointments, customers, providers } from '../src/db/schema.ts'
import { toUtc } from '../src/domain/time.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin, upcomingWeekday } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
const CLIENT_HOST = 'beleza-pura.localhost'
const SP = 'America/Sao_Paulo'
const MONDAY = upcomingWeekday(1, SP)

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const asStaff = async (email: string) => ({
    host: HOST,
    cookie: await staffLogin(app, notifier, HOST, email),
  })
  return { ...seeded, notifier, app, asStaff }
}

describe('porta da equipe', () => {
  it('manda para o login quem tenta a carteira sem entrar', async () => {
    const s = await setup()
    const res = await s.app.request('/clientes', { headers: { host: HOST } })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/equipe/entrar?next=%2Fclientes')
  })

  it('responde igual para e-mail de fora, sem mandar link', async () => {
    const s = await setup()
    const res = await s.app.request('/equipe/entrar', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'invasor@fora.com' }),
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('estiver na equipe deste negócio')
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('não manda link para quem foi tirado da equipe', async () => {
    const s = await setup()
    await s.db.update(providers).set({ active: false }).where(eq(providers.id, s.rafa.id))

    await s.app.request('/equipe/entrar', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: s.rafa.email ?? '' }),
    })
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('link usado duas vezes não cria sessão de novo', async () => {
    const s = await setup()
    await s.app.request('/equipe/entrar', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: s.carla.email ?? '' }),
    })
    const sent = s.notifier.sent.at(-1)
    if (sent?.kind !== 'magic-link') throw new Error('sem link')

    const first = await s.app.request(sent.url, { headers: { host: HOST } })
    expect(first.headers.getSetCookie().length).toBeGreaterThan(0)

    const second = await s.app.request(sent.url, { headers: { host: HOST } })
    expect(second.headers.getSetCookie()).toHaveLength(0)
  })

  it('a porta antiga por código some: o caminho vira pedido de login', async () => {
    const s = await setup()
    const res = await s.app.request('/equipe/entrar/codigo', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ telefone: s.carla.phone, codigo: '123456' }),
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/equipe/entrar')
  })
})

describe('acesso por papel', () => {
  it('prestador comum não entra na carteira nem no catálogo', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.rafa.email ?? '')

    expect((await s.app.request('/clientes', { headers })).status).toBe(403)
    expect((await s.app.request('/servicos', { headers })).status).toBe(403)
  })

  it('prestador abre a própria agenda, não a dos outros', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.rafa.email ?? '')

    expect((await s.app.request(`/agenda/${s.rafa.id}`, { headers })).status).toBe(200)
    expect((await s.app.request(`/agenda/${s.carla.id}`, { headers })).status).toBe(403)
    expect((await s.app.request(`/pendentes/${s.carla.id}`, { headers })).status).toBe(403)
  })

  it('dono abre a agenda de qualquer pessoa da equipe', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')
    expect((await s.app.request(`/agenda/${s.rafa.id}`, { headers })).status).toBe(200)
  })

  it('sessão de cliente não abre a área da equipe', async () => {
    const s = await setup()
    await s.app.request('/entrar', {
      method: 'POST',
      headers: { host: CLIENT_HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ nome: 'Joana Reis', telefone: '11977773333' }),
    })
    const issued = s.notifier.sent.at(-1)
    if (issued?.kind !== 'access-code') throw new Error('sem código')
    const entry = await s.app.request('/entrar/codigo', {
      method: 'POST',
      headers: { host: CLIENT_HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ telefone: '11977773333', codigo: issued.code }),
    })
    const cookie = entry.headers.get('set-cookie')?.split(';')[0] ?? ''

    const res = await s.app.request('/clientes', { headers: { host: HOST, cookie } })
    expect(res.status).toBe(303)
  })
})

describe('carteira de clientes', () => {
  it('mostra nome, telefone e quantidade de agendamentos', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')
    const [maria] = await s.db.select().from(customers).where(eq(customers.name, 'Maria Silva'))
    await s.db.insert(appointments).values({
      companyId: s.belezaPura.id,
      providerId: s.carla.id,
      customerId: maria?.id,
      serviceId: s.corte.id,
      startsAt: toUtc(MONDAY, 9 * 60, SP),
      endsAt: toUtc(MONDAY, 10 * 60, SP),
      status: 'confirmed',
      origin: 'app',
    })

    const html = await (await s.app.request('/clientes', { headers })).text()
    expect(html).toContain('Maria Silva')
    expect(html).toContain('(11) 97777-0001')
    expect(html).toContain('1 agendamento(s)')
  })

  it('não mostra cliente de outro salão', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')
    const html = await (await s.app.request('/clientes', { headers })).text()

    expect(html).toContain('João Prado')
    const fromOtherCompany = await s.db
      .select()
      .from(customers)
      .where(eq(customers.companyId, s.studioNorte.id))
    expect(fromOtherCompany).toHaveLength(1)
    expect(html.match(/Maria Silva/g)).toHaveLength(1)
  })

  it('busca por nome e por telefone', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')

    const byName = await (await s.app.request('/clientes?q=joão', { headers })).text()
    expect(byName).toContain('João Prado')
    expect(byName).not.toContain('Maria Silva')

    const byPhone = await (await s.app.request('/clientes?q=(11) 97777-0001', { headers })).text()
    expect(byPhone).toContain('Maria Silva')
    expect(byPhone).not.toContain('João Prado')
  })

  it('abre o histórico do cliente no modal', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')
    const [maria] = await s.db.select().from(customers).where(eq(customers.name, 'Maria Silva'))
    await s.db.insert(appointments).values({
      companyId: s.belezaPura.id,
      providerId: s.carla.id,
      customerId: maria?.id,
      serviceId: s.progressiva.id,
      startsAt: toUtc(MONDAY, 13 * 60, SP),
      endsAt: toUtc(MONDAY, 16 * 60, SP),
      status: 'confirmed',
      origin: 'app',
    })

    const html = await (await s.app.request(`/clientes?ver=${maria?.id}`, { headers })).text()
    expect(html).toContain('<div class="overlay">')
    expect(html).toContain('Progressiva')
    expect(html).toContain('Carla Mendes')
    expect(html).toContain('confirmado')
  })
})
