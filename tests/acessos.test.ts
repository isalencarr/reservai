import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { appointments, authEvents, customers, providers } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
const FORM = { host: HOST, 'content-type': 'application/x-www-form-urlencoded' }

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const asStaff = async (email: string) => ({
    host: HOST,
    cookie: await staffLogin(app, notifier, HOST, email),
  })
  const pedirLink = (email: string) =>
    app.request('/equipe/entrar', {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ email }),
    })
  return { ...seeded, notifier, app, asStaff, pedirLink }
}

describe('registro de acesso', () => {
  it('grava a entrada com e-mail mascarado e IP truncado', async () => {
    const s = await setup()
    await s.asStaff(s.carla.email ?? '')

    const [evento] = await s.db.select().from(authEvents)
    expect(evento).toMatchObject({ type: 'login', companyId: s.belezaPura.id })
    expect(evento?.emailMasked).toBe('ca***@b***.com.br')
    expect(evento?.emailMasked).not.toContain('carla@')
  })

  it('grava a saída', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')
    await s.app.request('/equipe/sair', { method: 'POST', headers })

    const tipos = (await s.db.select().from(authEvents)).map((e) => e.type)
    expect(tipos).toContain('logout')
  })

  it('grava tentativa de quem não é da equipe, sem mandar link', async () => {
    const s = await setup()
    await s.pedirLink('invasor@fora.com')

    const [evento] = await s.db.select().from(authEvents)
    expect(evento).toMatchObject({ type: 'login_failed', reason: 'e-mail desconhecido' })
    expect(evento?.emailMasked).toBe('in***@f***.com')
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('grava link inválido como tentativa recusada', async () => {
    const s = await setup()
    await s.app.request(
      `http://${HOST}/api/auth/magic-link/verify?token=naoexiste&callbackURL=/equipe`,
      { headers: { host: HOST } },
    )

    const [evento] = await s.db.select().from(authEvents)
    expect(evento).toMatchObject({ type: 'login_failed', reason: 'link inválido ou vencido' })
  })

  it('a tela é só do dono e mostra os eventos', async () => {
    const s = await setup()
    const dono = await s.asStaff(s.carla.email ?? '')
    const prestador = await s.asStaff(s.rafa.email ?? '')

    expect((await s.app.request('/equipe/acessos', { headers: prestador })).status).toBe(403)

    const html = await (await s.app.request('/equipe/acessos', { headers: dono })).text()
    expect(html).toContain('entrou')
    expect(html).toContain('ca***@b***.com.br')
    expect(html).not.toContain('carla@belezapura.com.br')
  })

  it('não mostra acesso de outro salão', async () => {
    const s = await setup()
    const dono = await s.asStaff(s.carla.email ?? '')
    await staffLogin(s.app, s.notifier, 'equipe.studio-norte.localhost', s.ines.email ?? '')

    const html = await (await s.app.request('/equipe/acessos', { headers: dono })).text()
    expect(html).not.toContain('in***@s***.com')
  })
})

describe('convite', () => {
  const PESSOA = {
    nome: 'Bia Souza',
    email: 'bia@salao.com.br',
    telefone: '11966661111',
    slot: '60',
    antecedencia: '60',
  }

  it('manda o link de acesso ao cadastrar e marca convite pendente', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    await s.app.request('/equipe/pessoas', {
      method: 'POST',
      headers: { ...FORM, cookie },
      body: new URLSearchParams(PESSOA),
    })

    const enviado = s.notifier.sent.at(-1)
    expect(enviado).toMatchObject({ kind: 'magic-link', to: 'bia@salao.com.br' })

    const [bia] = await s.db.select().from(providers).where(eq(providers.name, 'Bia Souza'))
    expect(bia?.joinedAt).toBeNull()

    const html = await (
      await s.app.request('/equipe/pessoas', { headers: { host: HOST, cookie } })
    ).text()
    expect(html).toContain('convite pendente')
  })

  it('o primeiro acesso fecha o convite', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    await s.app.request('/equipe/pessoas', {
      method: 'POST',
      headers: { ...FORM, cookie },
      body: new URLSearchParams(PESSOA),
    })

    const convite = s.notifier.sent.at(-1)
    if (convite?.kind !== 'magic-link') throw new Error('convite não enviado')
    await s.app.request(convite.url, { headers: { host: HOST } })

    const [bia] = await s.db.select().from(providers).where(eq(providers.name, 'Bia Souza'))
    expect(bia?.joinedAt).not.toBeNull()
  })

  it('não reenvia convite para quem saiu da equipe', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    await s.db.update(providers).set({ active: false }).where(eq(providers.id, s.rafa.id))

    const res = await s.app.request(`/equipe/pessoas/${s.rafa.id}/convite`, {
      method: 'POST',
      headers: { ...FORM, cookie },
    })
    expect(res.status).toBe(422)
    expect(
      s.notifier.sent.filter((m) => m.kind === 'magic-link' && m.to === s.rafa.email),
    ).toHaveLength(0)
  })
})

describe('navegação da área interna', () => {
  it('o dono vê todos os itens do menu', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')
    const html = await (await s.app.request('/equipe', { headers })).text()

    for (const item of [
      'Agendas',
      'Pedidos',
      'Horários',
      'Serviços',
      'Clientes',
      'Equipe',
      'Acessos',
    ]) {
      expect(html).toContain(`>${item}</a>`)
    }
    expect(html).toContain('>sair</button>')
  })

  it('o prestador só vê o que é dele e cai direto na agenda', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.rafa.email ?? '')

    const painel = await s.app.request('/equipe', { headers })
    expect(painel.status).toBe(303)
    expect(painel.headers.get('location')).toBe(`/agenda/${s.rafa.id}`)

    const html = await (await s.app.request(`/agenda/${s.rafa.id}`, { headers })).text()
    expect(html).toContain('Minha agenda')
    expect(html).not.toContain('/clientes')
    expect(html).not.toContain('/equipe/acessos')
    // Guia, Minha agenda, Pedidos e Horários.
    expect(html).toContain('/equipe/guia')
    expect(html.match(/class="menu-link/g)).toHaveLength(4)
  })

  it('marca a tela atual no menu', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')
    const html = await (await s.app.request('/clientes', { headers })).text()

    expect(html).toContain('aria-current="page"')
    expect(html).toContain('class="menu-link on"')
  })
})

describe('painel do dono', () => {
  it('mostra quantos pedidos esperam em cada agenda', async () => {
    const s = await setup()
    const headers = await s.asStaff(s.carla.email ?? '')
    const [maria] = await s.db.select().from(customers).limit(1)
    await s.db.insert(appointments).values({
      companyId: s.belezaPura.id,
      providerId: s.rafa.id,
      customerId: maria?.id,
      serviceId: s.corte.id,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      status: 'pending',
      origin: 'app',
      confirmDeadlineAt: new Date(Date.now() + 3_600_000),
    })

    const html = await (await s.app.request('/equipe', { headers })).text()
    expect(html).toContain(`/pendentes/${s.rafa.id}`)
    expect(html).toContain('class="side alert"')
    expect(html).toContain('<span>1</span>')
  })
})
