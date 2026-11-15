import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { companies } from '../src/db/schema.ts'
import { PALETTES } from '../src/domain/theme.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
const CLIENT_HOST = 'beleza-pura.localhost'
const azul = PALETTES.find((p) => p.key === 'azul')?.seed ?? ''

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const asStaff = async (email: string) => ({
    host: HOST,
    cookie: await staffLogin(app, notifier, HOST, email),
  })
  const salvar = (campo: string, valor: string, cookie: string) =>
    app.request('/equipe/aparencia', {
      method: 'POST',
      headers: { host: HOST, cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ [campo]: valor }),
    })
  return { ...seeded, notifier, app, asStaff, salvar }
}

describe('aparência', () => {
  it('só o dono abre a tela', async () => {
    const s = await setup()
    const dono = await s.asStaff(s.carla.email ?? '')
    const prestador = await s.asStaff(s.rafa.email ?? '')

    expect((await s.app.request('/equipe/aparencia', { headers: dono })).status).toBe(200)
    expect((await s.app.request('/equipe/aparencia', { headers: prestador })).status).toBe(403)
  })

  it('troca a cor e isso muda a página do cliente', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const antes = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()

    const res = await s.salvar('cor', azul, cookie)
    expect(res.status).toBe(303)

    const [company] = await s.db.select().from(companies).where(eq(companies.id, s.belezaPura.id))
    expect(company?.themeSeed).toBe(azul)

    const depois = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()
    expect(depois).toContain('--md-primary:')
    expect(depois).not.toBe(antes)
  })

  it('o tom escolhido define o que o cliente vê', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')

    await s.salvar('tom', 'dark', cookie)
    const escuro = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()
    expect(escuro).toContain('color-scheme: dark')
    expect(escuro).not.toContain('@media (prefers-color-scheme: dark)')

    await s.salvar('tom', 'auto', cookie)
    const automatico = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()
    expect(automatico).toContain('@media (prefers-color-scheme: dark)')
  })

  it('recusa cor fora da lista e tom inventado', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')

    expect((await s.salvar('cor', '#ff0000', cookie)).status).toBe(422)
    expect((await s.salvar('tom', 'sepia', cookie)).status).toBe(422)

    const [company] = await s.db.select().from(companies).where(eq(companies.id, s.belezaPura.id))
    expect(company?.themeSeed).toBe('#6750A4')
  })

  it('cada salão tem o seu tema', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    await s.salvar('cor', azul, cookie)

    const outro = await (
      await s.app.request('/', { headers: { host: 'studio-norte.localhost' } })
    ).text()
    const nosso = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()
    expect(outro).not.toBe(nosso)
  })
})
