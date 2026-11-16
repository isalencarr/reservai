import { describe, expect, it } from 'bun:test'
import { supportSessions } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createPlatformAdminRepo } from '../src/repos/platform-admins.ts'
import { createSupportSessionRepo, SUPPORT_TTL_MS } from '../src/repos/support-sessions.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, magicLogin } from './helpers.ts'

const EQUIPE = 'equipe.beleza-pura.localhost'
const FORM = { 'content-type': 'application/x-www-form-urlencoded' }
const DONO = { email: 'isaac@plataforma.dev', nome: 'Isaac' }

async function setup() {
  const seeded = await createSeededDb()
  await createPlatformAdminRepo(seeded.db).ensure(DONO.email, DONO.nome)
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const suporte = createSupportSessionRepo(seeded.db)

  /** Entra na área da equipe do salão com o e-mail da plataforma, que é o que a
   * janela de suporte autoriza. */
  const entrarComoSuporte = () => magicLogin(app, notifier, EQUIPE, DONO.email, '/equipe/entrar')

  const pedirLink = (email: string) =>
    app.request('/equipe/entrar', {
      method: 'POST',
      headers: { ...FORM, host: EQUIPE },
      body: new URLSearchParams({ email }),
    })

  return { ...seeded, notifier, app, suporte, entrarComoSuporte, pedirLink }
}

describe('a janela é a autorização', () => {
  it('sem janela aberta, a porta da equipe não emite link', async () => {
    const s = await setup()
    await s.pedirLink(DONO.email)
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('com janela aberta, o link sai e o suporte entra', async () => {
    const s = await setup()
    await s.suporte.open(s.belezaPura.id, DONO.email)

    const cookie = await s.entrarComoSuporte()
    const res = await s.app.request('/equipe', { headers: { host: EQUIPE, cookie } })

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Acesso de suporte')
    expect(html).toContain('como Carla Mendes')
  })

  it('a janela de um salão não abre outro', async () => {
    const s = await setup()
    await s.suporte.open(s.studioNorte.id, DONO.email)

    await s.pedirLink(DONO.email)
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('janela vencida não vale', async () => {
    const s = await setup()
    const velha = new Date(Date.now() - SUPPORT_TTL_MS - 1000)
    await s.suporte.open(s.belezaPura.id, DONO.email, velha)

    await s.pedirLink(DONO.email)
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('janela encerrada corta o acesso de quem já estava dentro', async () => {
    const s = await setup()
    const sessao = await s.suporte.open(s.belezaPura.id, DONO.email)
    const cookie = await s.entrarComoSuporte()
    expect((await s.app.request('/equipe', { headers: { host: EQUIPE, cookie } })).status).toBe(200)

    await s.suporte.revoke(sessao.id)

    const depois = await s.app.request('/equipe', { headers: { host: EQUIPE, cookie } })
    expect(depois.status).toBe(303)
  })
})

describe('o que o suporte alcança', () => {
  async function dentro() {
    const s = await setup()
    await s.suporte.open(s.belezaPura.id, DONO.email)
    const cookie = await s.entrarComoSuporte()
    return { ...s, cookie, headers: { host: EQUIPE, cookie } }
  }

  it('vê agenda, pedidos, horários e serviços', async () => {
    const s = await dentro()
    for (const path of ['/equipe', `/agenda/${s.carla.id}`, '/horarios', '/servicos']) {
      expect((await s.app.request(path, { headers: s.headers })).status).toBe(200)
    }
  })

  it('não vê carteira de clientes, equipe nem acessos', async () => {
    const s = await dentro()
    for (const path of ['/clientes', '/equipe/pessoas', '/equipe/acessos']) {
      const res = await s.app.request(path, { headers: s.headers })
      expect(res.status).toBe(403)
      expect(await res.text()).toContain('Dados pessoais')
    }
  })

  it('o menu não oferece o que ele não alcança', async () => {
    const s = await dentro()
    const html = await (await s.app.request('/equipe', { headers: s.headers })).text()

    expect(html).toContain('/horarios')
    expect(html).not.toContain('/equipe/pessoas')
    expect(html).not.toContain('/equipe/acessos')
    expect(html).not.toContain('/clientes')
  })

  it('recusa qualquer escrita', async () => {
    const s = await dentro()
    const escritas: [string, Record<string, string>][] = [
      ['/servicos', { nome: 'Serviço do suporte', duracao: '30', preco: '10,00' }],
      [`/pendentes/${s.carla.id}`, {}],
      ['/equipe/aparencia', { cor: 'azul', tom: 'auto' }],
    ]

    for (const [path, campos] of escritas) {
      const res = await s.app.request(path, {
        method: 'POST',
        headers: { ...FORM, ...s.headers },
        body: new URLSearchParams(campos),
      })
      expect(res.status).toBe(403)
    }
  })

  it('consegue sair, que é a única escrita permitida', async () => {
    const s = await dentro()
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
    const agora = new Date('2026-11-15T12:00:00Z')
    await s.suporte.open(s.belezaPura.id, DONO.email, agora)

    const [sessao] = await s.db.select().from(supportSessions)
    expect(sessao?.expiresAt.toISOString()).toBe('2026-11-15T14:00:00.000Z')
    expect(sessao?.revokedAt).toBeNull()
  })
})
