import { describe, expect, it } from 'bun:test'
import { supportSessions } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createPlatformAdminRepo } from '../src/repos/platform-admins.ts'
import { createSupportSessionRepo, SUPPORT_TTL_MS } from '../src/repos/support-sessions.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, magicLogin } from './helpers.ts'

const STAFF_HOST = 'equipe.beleza-pura.localhost'
const FORM = { 'content-type': 'application/x-www-form-urlencoded' }
const OWNER = { email: 'isaac@plataforma.dev', nome: 'Isaac' }

async function setup() {
  const seeded = await createSeededDb()
  await createPlatformAdminRepo(seeded.db).ensure(OWNER.email, OWNER.nome)
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const support = createSupportSessionRepo(seeded.db)

  /** Entra na área da equipe do salão com o e-mail da plataforma, que é o que a
   * janela de suporte autoriza. */
  const loginAsSupport = () => magicLogin(app, notifier, STAFF_HOST, OWNER.email, '/equipe/entrar')

  const askForLink = (email: string) =>
    app.request('/equipe/entrar', {
      method: 'POST',
      headers: { ...FORM, host: STAFF_HOST },
      body: new URLSearchParams({ email }),
    })

  return { ...seeded, notifier, app, support, loginAsSupport, askForLink }
}

describe('a janela é a autorização', () => {
  it('sem janela aberta, a porta da equipe não emite link', async () => {
    const s = await setup()
    await s.askForLink(OWNER.email)
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('com janela aberta, o link sai e o suporte entra', async () => {
    const s = await setup()
    await s.support.open(s.belezaPura.id, OWNER.email)

    const cookie = await s.loginAsSupport()
    const res = await s.app.request('/equipe', { headers: { host: STAFF_HOST, cookie } })

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Acesso de suporte')
    expect(html).toContain('como Carla Mendes')
  })

  it('a janela de um salão não abre outro', async () => {
    const s = await setup()
    await s.support.open(s.studioNorte.id, OWNER.email)

    await s.askForLink(OWNER.email)
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('janela vencida não vale', async () => {
    const s = await setup()
    const old = new Date(Date.now() - SUPPORT_TTL_MS - 1000)
    await s.support.open(s.belezaPura.id, OWNER.email, old)

    await s.askForLink(OWNER.email)
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('janela encerrada corta o acesso de quem já estava dentro', async () => {
    const s = await setup()
    const session = await s.support.open(s.belezaPura.id, OWNER.email)
    const cookie = await s.loginAsSupport()
    expect((await s.app.request('/equipe', { headers: { host: STAFF_HOST, cookie } })).status).toBe(
      200,
    )

    await s.support.revoke(session.id)

    const depois = await s.app.request('/equipe', { headers: { host: STAFF_HOST, cookie } })
    expect(depois.status).toBe(303)
  })
})

describe('o que o suporte alcança', () => {
  async function inside() {
    const s = await setup()
    await s.support.open(s.belezaPura.id, OWNER.email)
    const cookie = await s.loginAsSupport()
    return { ...s, cookie, headers: { host: STAFF_HOST, cookie } }
  }

  it('vê agenda, pedidos, horários e serviços', async () => {
    const s = await inside()
    for (const path of ['/equipe', `/agenda/${s.carla.id}`, '/horarios', '/servicos']) {
      expect((await s.app.request(path, { headers: s.headers })).status).toBe(200)
    }
  })

  it('não vê carteira de clientes, equipe nem acessos', async () => {
    const s = await inside()
    for (const path of ['/clientes', '/equipe/pessoas', '/equipe/acessos']) {
      const res = await s.app.request(path, { headers: s.headers })
      expect(res.status).toBe(403)
      expect(await res.text()).toContain('Dados pessoais')
    }
  })

  it('o menu não oferece o que ele não alcança', async () => {
    const s = await inside()
    const html = await (await s.app.request('/equipe', { headers: s.headers })).text()

    expect(html).toContain('/horarios')
    expect(html).not.toContain('/equipe/pessoas')
    expect(html).not.toContain('/equipe/acessos')
    expect(html).not.toContain('/clientes')
  })

  it('recusa qualquer escrita', async () => {
    const s = await inside()
    const writes: [string, Record<string, string>][] = [
      ['/servicos', { nome: 'Serviço do suporte', duracao: '30', preco: '10,00' }],
      [`/pendentes/${s.carla.id}`, {}],
      ['/equipe/aparencia', { cor: 'azul', tom: 'auto' }],
    ]

    for (const [path, campos] of writes) {
      const res = await s.app.request(path, {
        method: 'POST',
        headers: { ...FORM, ...s.headers },
        body: new URLSearchParams(campos),
      })
      expect(res.status).toBe(403)
    }
  })

  it('consegue sair, que é a única escrita permitida', async () => {
    const s = await inside()
    const res = await s.app.request('/equipe/sair', {
      method: 'POST',
      headers: { ...FORM, ...s.headers },
    })
    expect(res.status).not.toBe(403)

    const depois = await s.app.request('/equipe', { headers: s.headers })
    expect(depois.status).toBe(303)
  })
})

describe('a janela guardada', () => {
  it('vence em duas horas', async () => {
    const s = await setup()
    const rightNow = new Date('2026-11-15T12:00:00Z')
    await s.support.open(s.belezaPura.id, OWNER.email, rightNow)

    const [session] = await s.db.select().from(supportSessions)
    expect(session?.expiresAt.toISOString()).toBe('2026-11-15T14:00:00.000Z')
    expect(session?.revokedAt).toBeNull()
  })
})
