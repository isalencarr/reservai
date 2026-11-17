import { describe, expect, it } from 'bun:test'
import { appointments, customers } from '../src/db/schema.ts'
import { toUtc } from '../src/domain/time.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
const SP = 'America/Sao_Paulo'
const MONDAY = '2026-11-16'
const at = (minute: number) => toUtc(MONDAY, minute, SP)

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const cookie = await staffLogin(app, notifier, HOST, seeded.carla.email ?? '')
  const plain = { host: HOST, cookie }
  const headers = { ...plain, 'HX-Request': 'true' }
  const form = (values: Record<string, string>) => ({
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  })
  return { ...seeded, notifier, app, plain, headers, form }
}

describe('agenda do prestador', () => {
  it('mostra o dia dividido em slots, com o almoço separando as faixas', async () => {
    const { app, carla, plain } = await setup()
    const res = await app.request(`/agenda/${carla.id}?data=${MONDAY}`, { headers: plain })
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain('Carla Mendes')
    expect(html).toContain('Bloquear 09:00')
    expect(html).toContain('Bloquear 13:00')
    expect(html).not.toContain('Bloquear 12:00')
  })

  it('não mostra expediente em dia de folga', async () => {
    const { app, carla, headers } = await setup()
    const res = await app.request(`/agenda/${carla.id}?data=2026-11-15`, { headers })
    expect(await res.text()).toContain('Sem expediente')
  })

  it('bloqueia um horário e devolve a agenda já com o bloqueio', async () => {
    const { app, carla, form } = await setup()
    const res = await app.request(
      `/agenda/${carla.id}/bloqueios?data=${MONDAY}`,
      form({ startsAt: at(600).toISOString(), endsAt: at(660).toISOString(), note: 'Dentista' }),
    )
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain('Dentista')
    expect(html).toContain('Liberar')
    expect(html).not.toContain('Bloquear 10:00')
  })

  it('recusa bloqueio sobre horário já ocupado', async () => {
    const { app, carla, form } = await setup()
    const body = { startsAt: at(600).toISOString(), endsAt: at(660).toISOString() }
    await app.request(`/agenda/${carla.id}/bloqueios`, form(body))
    const res = await app.request(`/agenda/${carla.id}/bloqueios`, form(body))
    expect(res.status).toBe(409)
  })

  it('libera um bloqueio criado antes', async () => {
    const { app, db, carla, headers, form } = await setup()
    await app.request(
      `/agenda/${carla.id}/bloqueios?data=${MONDAY}`,
      form({ startsAt: at(600).toISOString(), endsAt: at(660).toISOString() }),
    )
    const [created] = await db.select().from(appointments)
    if (!created) throw new Error('bloqueio não foi criado')

    const res = await app.request(`/agenda/${carla.id}/bloqueios/${created.id}?data=${MONDAY}`, {
      method: 'DELETE',
      headers,
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Bloquear 10:00')
  })

  it('não deixa liberar o horário de um cliente por essa rota', async () => {
    const { app, db, belezaPura, carla, corte, headers } = await setup()
    const [maria] = await db.select().from(customers).limit(1)
    if (!maria) throw new Error('seed sem cliente')

    const [booked] = await db
      .insert(appointments)
      .values({
        companyId: belezaPura.id,
        providerId: carla.id,
        customerId: maria.id,
        serviceId: corte.id,
        startsAt: at(600),
        endsAt: at(660),
        status: 'confirmed',
      })
      .returning()
    if (!booked) throw new Error('agendamento não criado')

    const res = await app.request(`/agenda/${carla.id}/bloqueios/${booked.id}`, {
      method: 'DELETE',
      headers,
    })
    expect(res.status).toBe(400)
  })

  it('mostra ao prestador o nome do cliente, nunca o telefone', async () => {
    const { app, db, belezaPura, carla, progressiva, headers } = await setup()
    const [maria] = await db.select().from(customers).limit(1)
    if (!maria) throw new Error('seed sem cliente')

    await db.insert(appointments).values({
      companyId: belezaPura.id,
      providerId: carla.id,
      customerId: maria.id,
      serviceId: progressiva.id,
      startsAt: at(540),
      endsAt: at(720),
      status: 'confirmed',
    })

    const html = await (await app.request(`/agenda/${carla.id}?data=${MONDAY}`, { headers })).text()
    expect(html).toContain(maria.name)
    expect(html).toContain('Progressiva')
    expect(html).not.toContain(maria.phone)
    expect(html).toContain('--span:3')
  })

  it('não serve a agenda de prestador de outra empresa', async () => {
    const { app, ines, headers } = await setup()
    const res = await app.request(`/agenda/${ines.id}`, { headers })
    expect(res.status).toBe(404)
  })
})
