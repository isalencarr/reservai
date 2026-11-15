import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { appointments, customers } from '../src/db/schema.ts'
import { toUtc } from '../src/domain/time.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, upcomingWeekday } from './helpers.ts'

const HOST = 'beleza-pura.localhost'
const SP = 'America/Sao_Paulo'
const MONDAY = upcomingWeekday(1, SP)
const at = (minute: number) => toUtc(MONDAY, minute, SP)
const PHONE = '(11) 97777-3333'

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  return { ...seeded, notifier, app: createApp(seeded.db, notifier) }
}

type App = Awaited<ReturnType<typeof setup>>

function form(values: Record<string, string>, cookie?: string) {
  const headers: Record<string, string> = {
    host: HOST,
    'HX-Request': 'true',
    'content-type': 'application/x-www-form-urlencoded',
  }
  if (cookie) headers.cookie = cookie
  return { method: 'POST', headers, body: new URLSearchParams(values) }
}

const get = (s: App, path: string, cookie?: string) =>
  s.app.request(path, {
    headers: cookie ? { host: HOST, cookie } : { host: HOST },
  })

/** Faz o caminho completo de identificação e devolve o cookie de sessão. */
async function login(s: App, name = 'Joana Reis', phone = PHONE) {
  await s.app.request('/entrar', form({ nome: name, telefone: phone, next: '/reserva' }))
  const issued = s.notifier.sent.at(-1)
  if (issued?.kind !== 'access-code') throw new Error('código não foi enviado')

  const res = await s.app.request(
    '/entrar/codigo',
    form({ telefone: phone, codigo: issued.code, next: '/reserva' }),
  )
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('sessão não foi criada')
  return cookie
}

describe('identificação do cliente', () => {
  it('manda para a identificação quem tenta reservar sem entrar', async () => {
    const s = await setup()
    const res = await get(s, '/reserva')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/entrar?next=%2Freserva')
  })

  it('envia o código e cria o cliente na carteira da empresa', async () => {
    const s = await setup()
    const cookie = await login(s)

    const [novo] = await s.db.select().from(customers).where(eq(customers.name, 'Joana Reis'))
    expect(novo).toMatchObject({ phone: '11977773333', companyId: s.belezaPura.id })
    expect((await get(s, '/reserva', cookie)).status).toBe(200)
  })

  it('recusa código errado e não cria cliente', async () => {
    const s = await setup()
    await s.app.request('/entrar', form({ nome: 'Joana Reis', telefone: PHONE }))
    const res = await s.app.request('/entrar/codigo', form({ telefone: PHONE, codigo: '000000' }))

    expect(res.status).toBe(422)
    expect(await res.text()).toContain('Código errado')
    expect(
      await s.db.select().from(customers).where(eq(customers.name, 'Joana Reis')),
    ).toHaveLength(0)
  })

  it('queima o código depois de muitas tentativas', async () => {
    const s = await setup()
    await s.app.request('/entrar', form({ nome: 'Joana Reis', telefone: PHONE }))
    for (let i = 0; i < 4; i++) {
      await s.app.request('/entrar/codigo', form({ telefone: PHONE, codigo: '000000' }))
    }
    const res = await s.app.request('/entrar/codigo', form({ telefone: PHONE, codigo: '000000' }))
    expect(await res.text()).toContain('Peça um código novo')
  })

  it('recusa telefone malformado', async () => {
    const s = await setup()
    const res = await s.app.request('/entrar', form({ nome: 'Joana', telefone: '99' }))
    expect(res.status).toBe(422)
    expect(await res.text()).toContain('Telefone inválido')
  })

  it('não aceita a sessão de um salão no outro', async () => {
    const s = await setup()
    const cookie = await login(s)
    const res = await s.app.request('/reserva', {
      headers: { host: 'studio-norte.localhost', cookie },
    })
    expect(res.status).toBe(303)
  })
})

describe('pedido de horário', () => {
  it('percorre os passos e grava o pedido com prazo', async () => {
    const s = await setup()
    const cookie = await login(s)

    const passo1 = await (await get(s, '/reserva', cookie)).text()
    expect(passo1).toContain('Corte feminino')

    const passo2 = await (await get(s, `/reserva?servico=${s.corte.id}`, cookie)).text()
    expect(passo2).toContain('Carla Mendes')

    const passo3 = await (
      await get(s, `/reserva?servico=${s.corte.id}&prestador=${s.carla.id}&data=${MONDAY}`, cookie)
    ).text()
    expect(passo3).toContain('>09:00<')

    const res = await s.app.request(
      '/reserva',
      form({ servico: s.corte.id, prestador: s.carla.id, hora: at(9 * 60).toISOString() }, cookie),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('aguardando confirmação')

    const [pedido] = await s.db.select().from(appointments)
    expect(pedido).toMatchObject({ status: 'pending', providerId: s.carla.id })
    expect(pedido?.confirmDeadlineAt).not.toBeNull()
    expect(s.notifier.sent.at(-1)).toMatchObject({
      kind: 'pending-request',
      to: s.carla.phone,
      customerName: 'Joana Reis',
    })
  })

  it('recusa horário que acabou de ser ocupado', async () => {
    const s = await setup()
    const cookie = await login(s)
    await s.db.insert(appointments).values({
      companyId: s.belezaPura.id,
      providerId: s.carla.id,
      startsAt: at(9 * 60),
      endsAt: at(10 * 60),
      status: 'confirmed',
      origin: 'external',
      note: 'Bloqueado',
    })

    const res = await s.app.request(
      '/reserva',
      form({ servico: s.corte.id, prestador: s.carla.id, hora: at(9 * 60).toISOString() }, cookie),
    )
    expect(res.status).toBe(409)
    expect(await res.text()).toContain('acabou de ser ocupado')
  })

  it('recusa profissional que não executa o serviço', async () => {
    const s = await setup()
    const cookie = await login(s)
    const res = await s.app.request(
      '/reserva',
      form(
        { servico: s.progressiva.id, prestador: s.rafa.id, hora: at(9 * 60).toISOString() },
        cookie,
      ),
    )
    expect(res.status).toBe(422)
    expect(await res.text()).toContain('não faz esse serviço')
  })

  it('recusa pedido em cima da hora', async () => {
    const s = await setup()
    const cookie = await login(s)
    const res = await s.app.request(
      '/reserva',
      form(
        {
          servico: s.corte.id,
          prestador: s.carla.id,
          hora: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
        cookie,
      ),
    )
    expect(res.status).toBe(422)
    expect(await res.text()).toContain('perto demais')
  })
})

describe('meus horários', () => {
  async function comPedido(s: App, startMinute = 9 * 60) {
    const [row] = await s.db
      .insert(appointments)
      .values({
        companyId: s.belezaPura.id,
        providerId: s.carla.id,
        customerId: (
          await s.db.select().from(customers).where(eq(customers.phone, '11977773333'))
        )[0]?.id,
        serviceId: s.corte.id,
        startsAt: at(startMinute),
        endsAt: at(startMinute + 60),
        status: 'confirmed',
        origin: 'app',
      })
      .returning()
    if (!row) throw new Error('pedido não criado')
    return row
  }

  it('lista o agendamento com profissional e situação', async () => {
    const s = await setup()
    const cookie = await login(s)
    await comPedido(s)

    const html = await (await get(s, '/reserva/meus', cookie)).text()
    expect(html).toContain('Carla Mendes')
    expect(html).toContain('confirmado')
    expect(html).toContain('Cancelar')
  })

  it('cancela com mais de duas horas de antecedência e avisa o profissional', async () => {
    const s = await setup()
    const cookie = await login(s)
    const pedido = await comPedido(s)

    const res = await s.app.request(`/reserva/${pedido.id}/cancelar`, form({}, cookie))
    expect(res.status).toBe(200)

    const [row] = await s.db.select().from(appointments).where(eq(appointments.id, pedido.id))
    expect(row?.status).toBe('cancelled')
    expect(s.notifier.sent.at(-1)).toMatchObject({
      kind: 'customer-cancelled',
      to: s.carla.phone,
    })
  })

  it('não cancela faltando menos de duas horas', async () => {
    const s = await setup()
    const cookie = await login(s)
    const [row] = await s.db
      .insert(appointments)
      .values({
        companyId: s.belezaPura.id,
        providerId: s.carla.id,
        customerId: (
          await s.db.select().from(customers).where(eq(customers.phone, '11977773333'))
        )[0]?.id,
        serviceId: s.corte.id,
        startsAt: new Date(Date.now() + 60 * 60_000),
        endsAt: new Date(Date.now() + 120 * 60_000),
        status: 'confirmed',
        origin: 'app',
      })
      .returning()

    const res = await s.app.request(`/reserva/${row?.id}/cancelar`, form({}, cookie))
    expect(res.status).toBe(409)
    expect(await res.text()).toContain('fale com o salão')
  })

  it('não deixa cancelar agendamento de outra pessoa', async () => {
    const s = await setup()
    const cookie = await login(s)
    const [outra] = await s.db.select().from(customers).limit(1)
    const [row] = await s.db
      .insert(appointments)
      .values({
        companyId: s.belezaPura.id,
        providerId: s.carla.id,
        customerId: outra?.id,
        serviceId: s.corte.id,
        startsAt: at(11 * 60),
        endsAt: at(12 * 60),
        status: 'confirmed',
        origin: 'app',
      })
      .returning()

    const res = await s.app.request(`/reserva/${row?.id}/cancelar`, form({}, cookie))
    expect(res.status).toBe(404)
  })
})
