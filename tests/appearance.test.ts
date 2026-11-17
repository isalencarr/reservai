import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { companies } from '../src/db/schema.ts'
import { PALETTES } from '../src/domain/theme.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
const CLIENT_HOST = 'beleza-pura.localhost'
const blue = PALETTES.find((p) => p.key === 'azul')?.seed ?? ''

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const asStaff = async (email: string) => ({
    host: HOST,
    cookie: await staffLogin(app, notifier, HOST, email),
  })
  const save = (campo: string, valor: string, cookie: string) =>
    app.request('/equipe/aparencia', {
      method: 'POST',
      headers: { host: HOST, cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ [campo]: valor }),
    })
  return { ...seeded, notifier, app, asStaff, save }
}

describe('aparência', () => {
  it('só o dono abre a tela', async () => {
    const s = await setup()
    const owner = await s.asStaff(s.carla.email ?? '')
    const provider = await s.asStaff(s.rafa.email ?? '')

    expect((await s.app.request('/equipe/aparencia', { headers: owner })).status).toBe(200)
    expect((await s.app.request('/equipe/aparencia', { headers: provider })).status).toBe(403)
  })

  it('troca a cor e isso muda a página do cliente', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const before = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()

    const res = await s.save('cor', blue, cookie)
    expect(res.status).toBe(303)

    const [company] = await s.db.select().from(companies).where(eq(companies.id, s.belezaPura.id))
    expect(company?.themeSeed).toBe(blue)

    const depois = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()
    expect(depois).toContain('--md-primary:')
    expect(depois).not.toBe(before)
  })

  it('o tom escolhido define o que o cliente vê', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')

    await s.save('tom', 'dark', cookie)
    const dark = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()
    expect(dark).toContain('color-scheme: dark')
    expect(dark).not.toContain('@media (prefers-color-scheme: dark)')

    await s.save('tom', 'auto', cookie)
    const automatic = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()
    expect(automatic).toContain('@media (prefers-color-scheme: dark)')
  })

  it('recusa cor fora da lista e tom inventado', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')

    expect((await s.save('cor', '#ff0000', cookie)).status).toBe(422)
    expect((await s.save('tom', 'sepia', cookie)).status).toBe(422)

    const [company] = await s.db.select().from(companies).where(eq(companies.id, s.belezaPura.id))
    expect(company?.themeSeed).toBe('#6750A4')
  })

  it('cada salão tem o seu tema', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    await s.save('cor', blue, cookie)

    const other = await (
      await s.app.request('/', { headers: { host: 'studio-norte.localhost' } })
    ).text()
    const ours = await (await s.app.request('/', { headers: { host: CLIENT_HOST } })).text()
    expect(other).not.toBe(ours)
  })
})
