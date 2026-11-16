import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { authEvents, companies, subscriptions, supportSessions } from '../src/db/schema.ts'
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

describe('assinatura e suspensão', () => {
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

  const futuro = () => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    return d.toISOString().slice(0, 10)
  }

  it('salão criado aqui nasce sem pagamento registrado', async () => {
    const s = await logado()
    await s.enviar('/saloes', {
      nome: 'Salão da Inês',
      host: 'ines.com.br',
      slug: '',
      fuso: 'America/Sao_Paulo',
      dono: 'Inês Prado',
      email: 'ines@ines.com.br',
      telefone: '11955552222',
    })

    const res = await s.app.request('/', { headers: { host: HOST, cookie: s.cookie } })
    expect(await res.text()).toContain('sem pagamento')
  })

  it('marca o pagamento e a lista passa a dizer até quando', async () => {
    const s = await logado()
    const res = await s.enviar(`/saloes/${s.belezaPura.id}/assinatura`, {
      plano: 'anual',
      valor: '149,00',
      pago_ate: futuro(),
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('pago até')

    const [assinatura] = await s.db.select().from(subscriptions)
    expect(assinatura).toMatchObject({ plan: 'anual', priceCents: 14900 })

    // O prazo é guardado como a virada do dia; a tela tem de mostrar o dia pago,
    // não o seguinte.
    const dia = futuro()
    await s.enviar(`/saloes/${s.belezaPura.id}/assinatura`, {
      plano: 'mensal',
      valor: '149,00',
      pago_ate: dia,
    })
    const tela = await s.app.request('/', { headers: { host: HOST, cookie: s.cookie } })
    const [, mes, diaDoMes] = dia.split('-')
    expect(await tela.text()).toContain(`pago até ${diaDoMes}/${mes}`)
  })

  it('recusa valor e data inválidos sem gravar', async () => {
    const s = await logado()

    const valor = await s.enviar(`/saloes/${s.belezaPura.id}/assinatura`, {
      plano: 'mensal',
      valor: 'muito',
      pago_ate: futuro(),
    })
    expect(valor.status).toBe(422)
    expect(await valor.text()).toContain('Valor inválido')

    const data = await s.enviar(`/saloes/${s.belezaPura.id}/assinatura`, {
      plano: 'mensal',
      valor: '149,00',
      pago_ate: '30/12/2026',
    })
    expect(data.status).toBe(422)
    expect(await data.text()).toContain('Data de pagamento inválida')

    expect(await s.db.select().from(subscriptions)).toHaveLength(0)
  })

  it('suspende e reativa o salão', async () => {
    const s = await logado()

    const suspendeu = await s.enviar(`/saloes/${s.belezaPura.id}/situacao`, {
      situacao: 'suspenso',
    })
    expect(suspendeu.status).toBe(200)
    expect(await suspendeu.text()).toContain('suspenso')

    const [depois] = await s.db.select().from(companies).where(eq(companies.id, s.belezaPura.id))
    expect(depois?.status).toBe('suspended')
    expect(depois?.suspendedAt).toBeInstanceOf(Date)

    await s.enviar(`/saloes/${s.belezaPura.id}/situacao`, { situacao: 'ativo' })
    const [reativado] = await s.db.select().from(companies).where(eq(companies.id, s.belezaPura.id))
    expect(reativado).toMatchObject({ status: 'active', suspendedAt: null })
  })

  it('não deixa suspender sem sessão', async () => {
    const s = await setup()
    const res = await s.app.request(`/saloes/${s.belezaPura.id}/situacao`, {
      method: 'POST',
      headers: { ...FORM, host: HOST },
      body: new URLSearchParams({ situacao: 'suspenso' }),
    })

    expect(res.status).toBe(303)
    const [company] = await s.db.select().from(companies).where(eq(companies.id, s.belezaPura.id))
    expect(company?.status).toBe('active')
  })
})

describe('acesso de suporte pelo backoffice', () => {
  async function logado() {
    const s = await setup()
    const cookie = await magicLogin(s.app, s.notifier, HOST, DONO.email, '/entrar')
    const enviar = (path: string, campos: Record<string, string> = {}) =>
      s.app.request(path, {
        method: 'POST',
        headers: { ...FORM, host: HOST, cookie },
        body: new URLSearchParams(campos),
      })
    return { ...s, cookie, enviar }
  }

  it('abre a janela e registra no log do salão', async () => {
    const s = await logado()
    const res = await s.enviar(`/saloes/${s.belezaPura.id}/suporte`)

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Encerrar suporte')

    const [sessao] = await s.db.select().from(supportSessions)
    expect(sessao).toMatchObject({ companyId: s.belezaPura.id, adminEmail: DONO.email })

    const [evento] = await s.db.select().from(authEvents).where(eq(authEvents.type, 'support'))
    expect(evento).toMatchObject({ companyId: s.belezaPura.id })
    expect(evento?.reason).toContain('acesso aberto até')
    expect(evento?.emailMasked).not.toContain(DONO.email)
  })

  it('o dono enxerga o acesso em /equipe/acessos', async () => {
    const s = await logado()
    await s.enviar(`/saloes/${s.belezaPura.id}/suporte`)

    const equipe = 'equipe.beleza-pura.localhost'
    const cookie = await magicLogin(
      s.app,
      s.notifier,
      equipe,
      s.carla.email ?? '',
      '/equipe/entrar',
    )
    const res = await s.app.request('/equipe/acessos', { headers: { host: equipe, cookie } })

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('suporte da plataforma')
  })

  it('encerra a janela antes do prazo', async () => {
    const s = await logado()
    await s.enviar(`/saloes/${s.belezaPura.id}/suporte`)
    const [sessao] = await s.db.select().from(supportSessions)
    if (!sessao) throw new Error('a janela não foi aberta')

    const res = await s.enviar(`/suporte/${sessao.id}/encerrar`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Abrir suporte')

    const [depois] = await s.db.select().from(supportSessions)
    expect(depois?.revokedAt).toBeInstanceOf(Date)

    const motivos = (
      await s.db.select().from(authEvents).where(eq(authEvents.type, 'support'))
    ).map((e) => e.reason)
    expect(motivos).toContain('acesso encerrado')
  })

  it('não deixa abrir suporte sem sessão', async () => {
    const s = await setup()
    const res = await s.app.request(`/saloes/${s.belezaPura.id}/suporte`, {
      method: 'POST',
      headers: { ...FORM, host: HOST },
    })

    expect(res.status).toBe(303)
    expect(await s.db.select().from(supportSessions)).toHaveLength(0)
  })
})
