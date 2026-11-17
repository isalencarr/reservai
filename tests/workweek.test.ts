import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { providerHours } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin, upcomingWeekday } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
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
  const form = (values: Record<string, string>, cookie: string) => ({
    method: 'POST',
    headers: {
      host: HOST,
      cookie,
      'HX-Request': 'true',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(values),
  })
  const hours = (providerId: string) =>
    seeded.db.select().from(providerHours).where(eq(providerHours.providerId, providerId))
  return { ...seeded, notifier, app, asStaff, form, hours }
}

const slotsOf = (html: string) =>
  [...html.matchAll(/<span class="chip">(\d{2}:\d{2})<\/span>/g)].map((m) => m[1])

/** Segunda das 9h às 11h, e folga no resto da semana. */
const MONDAY_ONLY = { d1i1: '09:00', d1f1: '11:00' }

describe('jornada da equipe', () => {
  it('só o dono abre a tela', async () => {
    const s = await setup()
    const owner = await s.asStaff(s.carla.email ?? '')
    const provider = await s.asStaff(s.rafa.email ?? '')

    expect((await s.app.request('/equipe/jornada', { headers: owner })).status).toBe(200)
    expect((await s.app.request('/equipe/jornada', { headers: provider })).status).toBe(403)
  })

  it('abre a semana de quem foi pedido', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')
    const html = await (
      await s.app.request(`/equipe/jornada?pessoa=${s.rafa.id}`, { headers })
    ).text()

    expect(html).toContain('Rafa Lima')
    expect(html).toContain('/equipe/jornada/'.concat(s.rafa.id))
  })

  it('salva a semana e o cliente deixa de ver horário fora dela', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const headers = { host: HOST, cookie }

    const res = await s.app.request(`/equipe/jornada/${s.carla.id}`, s.form(MONDAY_ONLY, cookie))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Jornada salva')
    expect(await s.hours(s.carla.id)).toMatchObject([
      { weekday: 1, startMinute: 540, endMinute: 660 },
    ])

    const second = await s.app.request(
      `/horarios?servico=${s.corte.id}&prestador=${s.carla.id}&data=${MONDAY}`,
      { headers },
    )
    expect(slotsOf(await second.text())).toEqual(['09:00', '10:00'])
  })

  it('dia sem faixa é folga', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const headers = { host: HOST, cookie }

    await s.app.request(
      `/equipe/jornada/${s.carla.id}`,
      s.form({ d2i1: '09:00', d2f1: '18:00' }, cookie),
    )

    const second = await s.app.request(
      `/horarios?servico=${s.corte.id}&prestador=${s.carla.id}&data=${MONDAY}`,
      { headers },
    )
    expect(slotsOf(await second.text())).toEqual([])
  })

  it('recusa fim antes do início e não grava nada', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const res = await s.app.request(
      `/equipe/jornada/${s.carla.id}`,
      s.form({ d1i1: '18:00', d1f1: '09:00' }, cookie),
    )

    expect(res.status).toBe(422)
    expect(await res.text()).toContain('o fim precisa vir depois do início')
    expect(await s.hours(s.carla.id)).toHaveLength(12)
  })

  it('recusa faixa com só uma ponta preenchida', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const res = await s.app.request(
      `/equipe/jornada/${s.carla.id}`,
      s.form({ d1i1: '09:00', d1f1: '' }, cookie),
    )

    expect(res.status).toBe(422)
    expect(await res.text()).toContain('precisa de início e fim')
    expect(await s.hours(s.carla.id)).toHaveLength(12)
  })

  it('recusa faixas que se cruzam no mesmo dia', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const res = await s.app.request(
      `/equipe/jornada/${s.carla.id}`,
      s.form({ d1i1: '09:00', d1f1: '14:00', d1i2: '13:00', d1f2: '18:00' }, cookie),
    )

    expect(res.status).toBe(422)
    expect(await res.text()).toContain('antes de a outra terminar')
    expect(await s.hours(s.carla.id)).toHaveLength(12)
  })

  it('a jornada padrão repõe a semana inteira', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')

    await s.app.request(`/equipe/jornada/${s.carla.id}`, s.form(MONDAY_ONLY, cookie))
    expect(await s.hours(s.carla.id)).toHaveLength(1)

    const res = await s.app.request(`/equipe/jornada/${s.carla.id}/padrao`, s.form({}, cookie))
    expect(res.status).toBe(200)

    const week = await s.hours(s.carla.id)
    expect(week).toHaveLength(12)
    expect(new Set(week.map((h) => h.weekday))).toEqual(new Set([1, 2, 3, 4, 5, 6]))
  })

  it('a lista conta os dias de cada pessoa', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    await s.app.request(`/equipe/jornada/${s.carla.id}`, s.form(MONDAY_ONLY, cookie))

    const html = await (
      await s.app.request('/equipe/jornada', { headers: { host: HOST, cookie } })
    ).text()
    expect(html).toContain('1 dia na semana')
    expect(html).toContain('6 dias na semana')
  })

  it('a jornada de um salão não alcança a pessoa de outro', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const res = await s.app.request(`/equipe/jornada/${s.ines.id}`, s.form(MONDAY_ONLY, cookie))

    expect(res.status).toBe(404)
    expect(await s.hours(s.ines.id)).toHaveLength(12)
  })
})
