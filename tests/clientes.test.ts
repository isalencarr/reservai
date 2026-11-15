import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { appointments, customers } from '../src/db/schema.ts'
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
  const asStaff = async (phone: string) => ({
    host: HOST,
    cookie: await staffLogin(app, notifier, HOST, phone),
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

  it('responde igual para número que não é da equipe, sem mandar código', async () => {
    const s = await setup()
    const res = await s.app.request('/equipe/entrar', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ telefone: '11999990000' }),
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Código')
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('não aceita código de cliente na porta da equipe', async () => {
    const s = await setup()
    await s.app.request('/entrar', {
      method: 'POST',
      headers: { host: CLIENT_HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ nome: 'Carla Mendes', telefone: s.carla.phone }),
    })
    const issued = s.notifier.sent.at(-1)
    if (issued?.kind !== 'access-code') throw new Error('sem código')

    const res = await s.app.request('/equipe/entrar/codigo', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ telefone: s.carla.phone, codigo: issued.code }),
    })
    expect(res.status).toBe(422)
    expect(await res.text()).toContain('O código venceu')
  })
})

describe('acesso por papel', () => {
  it('prestador comum não entra na carteira nem no catálogo', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.rafa.phone)

    expect((await s.app.request('/clientes', { headers })).status).toBe(403)
    expect((await s.app.request('/servicos', { headers })).status).toBe(403)
  })

  it('prestador abre a própria agenda, não a dos outros', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.rafa.phone)

    expect((await s.app.request(`/agenda/${s.rafa.id}`, { headers })).status).toBe(200)
    expect((await s.app.request(`/agenda/${s.carla.id}`, { headers })).status).toBe(403)
    expect((await s.app.request(`/pendentes/${s.carla.id}`, { headers })).status).toBe(403)
  })

  it('dono abre a agenda de qualquer pessoa da equipe', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.phone)
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
    const entrada = await s.app.request('/entrar/codigo', {
      method: 'POST',
      headers: { host: CLIENT_HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ telefone: '11977773333', codigo: issued.code }),
    })
    const cookie = entrada.headers.get('set-cookie')?.split(';')[0] ?? ''

    const res = await s.app.request('/clientes', { headers: { host: HOST, cookie } })
    expect(res.status).toBe(303)
  })
})

describe('carteira de clientes', () => {
  it('mostra nome, telefone e quantidade de agendamentos', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.phone)
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
    const headers = await s.asStaff(s.carla.phone)
    const html = await (await s.app.request('/clientes', { headers })).text()

    expect(html).toContain('João Prado')
    const doOutroSalao = await s.db
      .select()
      .from(customers)
      .where(eq(customers.companyId, s.studioNorte.id))
    expect(doOutroSalao).toHaveLength(1)
    expect(html.match(/Maria Silva/g)).toHaveLength(1)
  })

  it('busca por nome e por telefone', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.phone)

    const porNome = await (await s.app.request('/clientes?q=joão', { headers })).text()
    expect(porNome).toContain('João Prado')
    expect(porNome).not.toContain('Maria Silva')

    const porFone = await (await s.app.request('/clientes?q=(11) 97777-0001', { headers })).text()
    expect(porFone).toContain('Maria Silva')
    expect(porFone).not.toContain('João Prado')
  })

  it('abre o histórico do cliente no modal', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.phone)
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
