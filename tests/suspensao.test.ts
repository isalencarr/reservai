import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { appointments, companies } from '../src/db/schema.ts'
import { toUtc } from '../src/domain/time.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createCompanyRepo } from '../src/repos/companies.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin, upcomingWeekday } from './helpers.ts'

const HOST = 'beleza-pura.localhost'
const EQUIPE = 'equipe.beleza-pura.localhost'
const SP = 'America/Sao_Paulo'
const MONDAY = upcomingWeekday(1, SP)
const PHONE = '(11) 97777-3333'

function form(values: Record<string, string>, cookie?: string) {
  const headers: Record<string, string> = {
    host: HOST,
    'HX-Request': 'true',
    'content-type': 'application/x-www-form-urlencoded',
  }
  if (cookie) headers.cookie = cookie
  return { method: 'POST', headers, body: new URLSearchParams(values) }
}

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)

  /** Faz o caminho completo de identificação e devolve o cookie de sessão. */
  const login = async () => {
    await app.request('/entrar', form({ nome: 'Joana Reis', telefone: PHONE, next: '/reserva' }))
    const issued = notifier.sent.at(-1)
    if (issued?.kind !== 'access-code') throw new Error('código não foi enviado')
    const res = await app.request(
      '/entrar/codigo',
      form({ telefone: PHONE, codigo: issued.code, next: '/reserva' }),
    )
    const cookie = res.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('sessão não foi criada')
    return cookie
  }

  const suspender = () => createCompanyRepo(seeded.db).setStatus(seeded.belezaPura.id, 'suspended')

  return { ...seeded, notifier, app, login, suspender }
}

describe('salão suspenso, lado do cliente', () => {
  it('a porta do cliente explica em vez de oferecer agendamento', async () => {
    const s = await setup()
    await s.suspender()

    const res = await s.app.request('/', { headers: { host: HOST } })
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('Agenda fechada')
    expect(html).not.toContain('Agendar um horário')
  })

  it('a tela de reserva não monta', async () => {
    const s = await setup()
    const cookie = await s.login()
    await s.suspender()

    const res = await s.app.request('/reserva', { headers: { host: HOST, cookie } })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Agenda fechada')
  })

  it('recusa o pedido novo', async () => {
    const s = await setup()
    const cookie = await s.login()
    await s.suspender()

    const res = await s.app.request(
      '/reserva',
      form(
        {
          servico: s.corte.id,
          prestador: s.carla.id,
          hora: toUtc(MONDAY, 9 * 60, SP).toISOString(),
        },
        cookie,
      ),
    )
    expect(res.status).toBe(403)
    expect(await res.text()).toContain('não está recebendo novos agendamentos')
    expect(await s.db.select().from(appointments)).toHaveLength(0)
  })

  it('o horário já pedido continua visível e cancelável', async () => {
    const s = await setup()
    const cookie = await s.login()

    const pedido = await s.app.request(
      '/reserva',
      form(
        {
          servico: s.corte.id,
          prestador: s.carla.id,
          hora: toUtc(MONDAY, 10 * 60, SP).toISOString(),
        },
        cookie,
      ),
    )
    expect(pedido.status).toBe(200)
    const [criado] = await s.db.select().from(appointments)
    if (!criado) throw new Error('o pedido não foi criado')

    await s.suspender()

    const meus = await s.app.request('/reserva/meus', { headers: { host: HOST, cookie } })
    expect(meus.status).toBe(200)
    expect(await meus.text()).toContain('Corte feminino')

    const cancelou = await s.app.request(`/reserva/${criado.id}/cancelar`, form({}, cookie))
    expect(cancelou.status).toBe(200)
    const [depois] = await s.db.select().from(appointments).where(eq(appointments.id, criado.id))
    expect(depois?.status).toBe('cancelled')
  })
})

describe('salão suspenso, lado da equipe', () => {
  it('a equipe entra e vê o aviso em toda tela', async () => {
    const s = await setup()
    const notifier = s.notifier
    const cookie = await staffLogin(s.app, notifier, EQUIPE, s.carla.email ?? '')
    await s.suspender()

    for (const path of ['/equipe', '/servicos', '/horarios']) {
      const res = await s.app.request(path, { headers: { host: EQUIPE, cookie } })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Salão suspenso')
    }
  })

  it('sem suspensão não aparece aviso', async () => {
    const s = await setup()
    const cookie = await staffLogin(s.app, s.notifier, EQUIPE, s.carla.email ?? '')

    const res = await s.app.request('/equipe', { headers: { host: EQUIPE, cookie } })
    expect(await res.text()).not.toContain('Salão suspenso')
  })
})

describe('reativar', () => {
  it('volta a aceitar pedido depois de reativado', async () => {
    const s = await setup()
    const cookie = await s.login()
    await s.suspender()
    await createCompanyRepo(s.db).setStatus(s.belezaPura.id, 'active')

    const res = await s.app.request(
      '/reserva',
      form(
        {
          servico: s.corte.id,
          prestador: s.carla.id,
          hora: toUtc(MONDAY, 11 * 60, SP).toISOString(),
        },
        cookie,
      ),
    )
    expect(res.status).toBe(200)
    expect(await s.db.select().from(appointments)).toHaveLength(1)
  })

  it('reativar limpa a data de suspensão', async () => {
    const s = await setup()
    await s.suspender()
    await createCompanyRepo(s.db).setStatus(s.belezaPura.id, 'active')

    const [company] = await s.db.select().from(companies).where(eq(companies.id, s.belezaPura.id))
    expect(company).toMatchObject({ status: 'active', suspendedAt: null })
  })
})
