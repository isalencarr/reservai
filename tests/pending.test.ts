import { describe, expect, it } from 'bun:test'
import { appointments, customers } from '../src/db/schema.ts'
import { confirmDeadline } from '../src/domain/booking.ts'
import { toUtc } from '../src/domain/time.ts'
import { expirePending } from '../src/jobs/expire.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin, upcomingWeekday } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
const SP = 'America/Sao_Paulo'
const MONDAY = upcomingWeekday(1, SP)
const at = (minute: number) => toUtc(MONDAY, minute, SP)

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const cookie = await staffLogin(app, notifier, HOST, seeded.carla.email ?? '')
  const headers = { host: HOST, cookie }
  return { ...seeded, notifier, app, headers, hx: { ...headers, 'HX-Request': 'true' } }
}

type RequestOpts = { deadline?: Date; startMinute?: number }

async function request(seeded: Awaited<ReturnType<typeof setup>>, opts: RequestOpts = {}) {
  const start = at(opts.startMinute ?? 9 * 60)
  const [maria] = await seeded.db.select().from(customers).limit(1)
  if (!maria) throw new Error('seed sem cliente')
  const [row] = await seeded.db
    .insert(appointments)
    .values({
      companyId: seeded.belezaPura.id,
      providerId: seeded.carla.id,
      customerId: maria.id,
      serviceId: seeded.corte.id,
      startsAt: start,
      endsAt: at((opts.startMinute ?? 9 * 60) + 60),
      status: 'pending',
      origin: 'app',
      confirmDeadlineAt: opts.deadline ?? confirmDeadline(start, new Date(), 60),
    })
    .returning()
  if (!row) throw new Error('pedido não criado')
  return { ...row, customer: maria }
}

describe('fila de pendentes', () => {
  it('lista o pedido com serviço, horário e prazo', async () => {
    const s = await setup()
    await request(s)
    const html = await (
      await s.app.request(`/pendentes/${s.carla.id}`, { headers: s.headers })
    ).text()
    expect(html).toContain('Maria Silva')
    expect(html).toContain('Corte feminino')
    expect(html).toContain('responda em')
  })

  it('confirma o pedido e avisa o cliente', async () => {
    const s = await setup()
    const p = await request(s)
    const res = await s.app.request(`/pendentes/${s.carla.id}/${p.id}/confirmar`, {
      method: 'POST',
      headers: s.hx,
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Nenhum pedido na fila')

    const [row] = await s.db.select().from(appointments)
    expect(row?.status).toBe('confirmed')
    expect(s.notifier.sent.at(-1)).toMatchObject({ kind: 'request-answer', accepted: true })
  })

  it('recusa sem exigir motivo e devolve o horário para a agenda', async () => {
    const s = await setup()
    const p = await request(s)
    await s.app.request(`/pendentes/${s.carla.id}/${p.id}/recusar`, {
      method: 'POST',
      headers: s.hx,
    })

    const [row] = await s.db.select().from(appointments)
    expect(row?.status).toBe('declined')
    expect(s.notifier.sent.at(-1)).toMatchObject({ accepted: false })

    const availability = await (
      await s.app.request(
        `/horarios?servico=${s.corte.id}&prestador=${s.carla.id}&data=${MONDAY}`,
        { headers: s.headers },
      )
    ).text()
    expect(availability).toContain('>09:00<')
  })

  it('não deixa responder pedido que já venceu', async () => {
    const s = await setup()
    const p = await request(s, { deadline: new Date(Date.now() - 60_000) })
    const res = await s.app.request(`/pendentes/${s.carla.id}/${p.id}/confirmar`, {
      method: 'POST',
      headers: s.hx,
    })
    expect(res.status).toBe(409)

    const [row] = await s.db.select().from(appointments)
    expect(row?.status).toBe('expired')
  })
})

describe('expiração', () => {
  it('expira o pedido vencido ao abrir qualquer tela e avisa o cliente', async () => {
    const s = await setup()
    await request(s, { deadline: new Date(Date.now() - 60_000) })
    await s.app.request('/', { headers: s.headers })

    const [row] = await s.db.select().from(appointments)
    expect(row?.status).toBe('expired')
    expect(s.notifier.sent.at(-1)).toMatchObject({ kind: 'request-answer', accepted: false })
  })

  it('também roda pelo comando, sem ninguém abrir o app', async () => {
    const s = await setup()
    await request(s, { deadline: new Date(Date.now() - 60_000) })
    const count = await expirePending(s.db, s.notifier)
    expect(count).toBe(1)
    expect(await expirePending(s.db, s.notifier)).toBe(0)
  })

  it('não mexe em pedido dentro do prazo', async () => {
    const s = await setup()
    await request(s)
    expect(await expirePending(s.db, s.notifier)).toBe(0)
  })
})

describe('folga do dia', () => {
  it('cancela o que estava marcado, avisa para remarcar e fecha o dia', async () => {
    const s = await setup()
    await request(s)
    const res = await s.app.request(`/agenda/${s.carla.id}/folga?data=${MONDAY}`, {
      method: 'POST',
      headers: s.hx,
    })
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain('Folga')
    expect(html).not.toContain('Bloquear 09:00')
    expect(s.notifier.sent.at(-1)).toMatchObject({ kind: 'reschedule-needed' })

    const availability = await (
      await s.app.request(`/horarios?servico=${s.corte.id}&data=${MONDAY}`, { headers: s.headers })
    ).text()
    expect(availability).toContain('Nenhum horário disponível')
  })

  it('recusa folga em dia sem expediente', async () => {
    const s = await setup()
    const sunday = upcomingWeekday(0, SP)
    const res = await s.app.request(`/agenda/${s.carla.id}/folga?data=${sunday}`, {
      method: 'POST',
      headers: s.hx,
    })
    expect(res.status).toBe(400)
  })
})
