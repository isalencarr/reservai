import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { authEvents, companies } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createPlatformAdminRepo } from '../src/repos/platform-admins.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, magicLogin } from './helpers.ts'

const HOST = 'backoffice.localhost'
const STAFF = 'equipe.beleza-pura.localhost'
const FORM = { 'content-type': 'application/x-www-form-urlencoded' }
const DONO = { email: 'isaac@plataforma.dev', nome: 'Isaac' }

async function setup() {
  const seeded = await createSeededDb()
  await createPlatformAdminRepo(seeded.db).ensure(DONO.email, DONO.nome)
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)

  const pedirLink = (email: string, host = HOST) =>
    app.request('/entrar', {
      method: 'POST',
      headers: { ...FORM, host },
      body: new URLSearchParams({ email }),
    })

  return { ...seeded, notifier, app, pedirLink }
}

describe('porta do backoffice', () => {
  it('separa o backoffice do salão pelo endereço', async () => {
    const s = await setup()

    const outro = await s.app.request('/', { headers: { host: 'desconhecido.exemplo.com' } })
    expect(outro.status).toBe(404)

    const backoffice = await s.app.request('/entrar', { headers: { host: HOST } })
    expect(backoffice.status).toBe(200)
    expect(await backoffice.text()).toContain('backoffice')
  })

  it('manda quem não tem sessão para a tela de entrar', async () => {
    const s = await setup()
    const res = await s.app.request('/', { headers: { host: HOST } })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/entrar?next=%2F')
  })

  it('deixa entrar quem está na lista da plataforma', async () => {
    const s = await setup()
    const cookie = await magicLogin(s.app, s.notifier, HOST, DONO.email, '/entrar')

    const res = await s.app.request('/', { headers: { host: HOST, cookie } })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Beleza Pura')
    expect(html).toContain('Studio Norte')
  })

  /** Em desenvolvimento o host chega como `backoffice.localhost:3000`: a porta
   * já derrubou o envio do link uma vez. */
  it('deixa entrar com a porta no endereço', async () => {
    const s = await setup()
    const comPorta = `${HOST}:3000`
    const cookie = await magicLogin(s.app, s.notifier, comPorta, DONO.email, '/entrar')

    const res = await s.app.request('/', { headers: { host: comPorta, cookie } })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Beleza Pura')
  })

  it('não emite link para e-mail fora da lista', async () => {
    const s = await setup()
    await s.pedirLink('qualquer@exemplo.com')

    expect(s.notifier.sent).toHaveLength(0)
    const [evento] = await s.db.select().from(authEvents)
    expect(evento).toMatchObject({ type: 'login_failed', companyId: null })
    expect(evento?.reason).toContain('fora da lista')
  })

  it('não emite link para dono de salão na porta da plataforma', async () => {
    const s = await setup()
    const res = await s.pedirLink(s.carla.email ?? '')

    expect(res.status).toBe(200)
    expect(s.notifier.sent).toHaveLength(0)
  })

  it('não emite link para o dono da plataforma na porta da equipe', async () => {
    const s = await setup()
    await s.app.request('/equipe/entrar', {
      method: 'POST',
      headers: { ...FORM, host: STAFF },
      body: new URLSearchParams({ email: DONO.email }),
    })

    expect(s.notifier.sent).toHaveLength(0)
  })

  it('registra a entrada da plataforma sem salão', async () => {
    const s = await setup()
    await magicLogin(s.app, s.notifier, HOST, DONO.email, '/entrar')

    const [evento] = await s.db.select().from(authEvents)
    expect(evento).toMatchObject({ type: 'login', companyId: null, reason: 'backoffice' })
    expect(evento?.emailMasked).not.toContain(DONO.email)
  })

  it('não deixa criar salão sem sessão', async () => {
    const s = await setup()
    const res = await s.app.request('/saloes', {
      method: 'POST',
      headers: { ...FORM, host: HOST },
      body: new URLSearchParams({ nome: 'Invasor', host: 'invasor.com.br' }),
    })
    expect(res.status).toBe(303)
    expect(await s.db.select().from(companies)).toHaveLength(2)
  })

  it('sai e volta a pedir link', async () => {
    const s = await setup()
    const cookie = await magicLogin(s.app, s.notifier, HOST, DONO.email, '/entrar')

    const saiu = await s.app.request('/sair', { method: 'POST', headers: { host: HOST, cookie } })
    expect(saiu.headers.get('hx-redirect')).toBe('/entrar')

    const depois = await s.app.request('/', { headers: { host: HOST, cookie } })
    expect(depois.status).toBe(303)
  })
})

describe('salões pelo backoffice', () => {
  async function logado() {
    const s = await setup()
    const cookie = await magicLogin(s.app, s.notifier, HOST, DONO.email, '/entrar')
    const enviar = (path: string, campos: Record<string, string>) =>
      s.app.request(path, {
        method: 'POST',
        headers: { ...FORM, host: HOST, cookie },
        body: new URLSearchParams(campos),
      })
    return { ...s, cookie, enviar }
  }

  const novo = {
    nome: 'Salão da Inês',
    host: 'ines.com.br',
    slug: '',
    fuso: 'America/Manaus',
    dono: 'Inês Prado',
    email: 'ines@ines.com.br',
    telefone: '11955552222',
  }

  it('cria o salão e ele já atende no endereço', async () => {
    const s = await logado()
    const res = await s.enviar('/saloes', novo)

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('ines.com.br')

    const criado = await s.app.request('/', { headers: { host: 'ines.com.br' } })
    expect(criado.status).toBe(200)
    expect(await criado.text()).toContain('Salão da Inês')
  })

  it('o dono criado recebe link na porta da equipe dele', async () => {
    const s = await logado()
    await s.enviar('/saloes', novo)

    const cookie = await magicLogin(
      s.app,
      s.notifier,
      'equipe.ines.com.br',
      novo.email,
      '/equipe/entrar',
    )
    const res = await s.app.request('/equipe', { headers: { host: 'equipe.ines.com.br', cookie } })
    expect(res.status).toBe(200)
  })

  it('explica o endereço repetido sem criar nada', async () => {
    const s = await logado()
    const res = await s.enviar('/saloes', { ...novo, host: 'beleza-pura.localhost' })

    expect(res.status).toBe(422)
    expect(await res.text()).toContain('Já existe um salão em')
    expect(await s.db.select().from(companies)).toHaveLength(2)
  })

  it('edita o salão pelo formulário', async () => {
    const s = await logado()
    const res = await s.enviar(`/saloes/${s.belezaPura.id}`, {
      nome: 'Beleza Pura Hair',
      host: 'beleza-pura.localhost',
      slug: 'beleza-pura',
      fuso: 'America/Bahia',
    })

    expect(res.status).toBe(200)
    const [company] = await s.db.select().from(companies).where(eq(companies.id, s.belezaPura.id))
    expect(company).toMatchObject({ name: 'Beleza Pura Hair', timezone: 'America/Bahia' })
  })

  it('responde 404 para salão que não existe', async () => {
    const s = await logado()
    const res = await s.enviar('/saloes/nao-existe', {
      nome: 'X',
      host: 'x.com.br',
      slug: 'x',
      fuso: 'America/Sao_Paulo',
    })
    expect(res.status).toBe(404)
  })
})
