import { describe, expect, it } from 'bun:test'
import { appointments } from '../src/db/schema.ts'
import { toUtc } from '../src/domain/time.ts'
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

const slotsOf = (html: string) =>
  [...html.matchAll(/<span class="chip">(\d{2}:\d{2})<\/span>/g)].map((m) => m[1])

describe('consulta de horários', () => {
  it('oferece um horário por slot num dia vazio', async () => {
    const { app, headers, corte } = await setup()
    const res = await app.request(`/horarios?servico=${corte.id}&data=${MONDAY}`, { headers })
    expect(slotsOf(await res.text())).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ])
  })

  it('não oferece horário em que a progressiva estoura o expediente', async () => {
    const { app, headers, progressiva, carla } = await setup()
    const res = await app.request(
      `/horarios?servico=${progressiva.id}&prestador=${carla.id}&data=${MONDAY}`,
      { headers },
    )
    expect(slotsOf(await res.text())).toEqual(['09:00', '13:00', '14:00', '15:00'])
  })

  it('mostra só quem executa o serviço', async () => {
    const { app, headers, progressiva, rafa } = await setup()
    const html = await (
      await app.request(`/horarios?servico=${progressiva.id}&data=${MONDAY}`, { headers })
    ).text()
    expect(html).toContain('Carla Mendes')
    expect(html).not.toContain(rafa.id)
  })

  it('some com o horário que esbarra em compromisso existente', async () => {
    const { app, headers, db, belezaPura, carla, corte } = await setup()
    await db.insert(appointments).values({
      companyId: belezaPura.id,
      providerId: carla.id,
      serviceId: corte.id,
      startsAt: at(10 * 60),
      endsAt: at(11 * 60),
      status: 'confirmed',
      origin: 'external',
      note: 'Bloqueado',
    })
    const res = await app.request(
      `/horarios?servico=${corte.id}&prestador=${carla.id}&data=${MONDAY}`,
      { headers },
    )
    expect(slotsOf(await res.text())).not.toContain('10:00')
  })

  it('não oferece nada em dia sem expediente', async () => {
    const { app, headers, corte } = await setup()
    const sunday = upcomingWeekday(0, SP)
    const res = await app.request(`/horarios?servico=${corte.id}&data=${sunday}`, { headers })
    expect(await res.text()).toContain('Nenhum horário disponível')
  })

  it('não oferece horário no passado', async () => {
    const { app, headers, corte } = await setup()
    const res = await app.request(`/horarios?servico=${corte.id}&data=2020-01-06`, { headers })
    expect(slotsOf(await res.text())).toEqual([])
  })

  it('devolve só o fragmento para o HTMX', async () => {
    const { app, hx, corte } = await setup()
    const res = await app.request(`/horarios?servico=${corte.id}&data=${MONDAY}`, {
      headers: hx,
    })
    const html = await res.text()
    expect(html.startsWith('<section id="consulta"')).toBe(true)
    expect(html).not.toContain('<html')
  })
})
