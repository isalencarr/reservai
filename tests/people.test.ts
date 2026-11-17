import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { providerHours, providers } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin, upcomingWeekday } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
const MONDAY = upcomingWeekday(1, 'America/Sao_Paulo')

/** O botão manda os campos por hx-vals. Se a tela e a rota discordarem do nome,
 * nada falha em voz alta: a pessoa só não volta para a equipe. */
function hxVals(html: string, label: string): Record<string, string> {
  const upToLabel = html.slice(0, html.indexOf(label))
  const found = upToLabel.match(/hx-vals="([^"]*)"(?![\s\S]*hx-vals=)/)
  if (!found?.[1]) throw new Error(`sem hx-vals no botão ${label}`)
  return JSON.parse(found[1].replaceAll('&quot;', '"'))
}

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const asStaff = async (email: string) => ({
    host: HOST,
    cookie: await staffLogin(app, notifier, HOST, email),
  })
  const form = (values: Record<string, string>, cookie: string) => ({
    method: 'POST',
    headers: {
      host: HOST,
      cookie,
      'HX-Request': 'true',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(values),
  })
  return { ...seeded, notifier, app, asStaff, form }
}

const PERSON = {
  nome: 'Bia Souza',
  email: 'bia@salao.com.br',
  telefone: '(11) 96666-1111',
  slot: '30',
  antecedencia: '60',
}

describe('cadastro da equipe', () => {
  it('só o dono abre a tela', async () => {
    const s = await setup()
    const owner = await s.asStaff(s.carla.email ?? '')
    const provider = await s.asStaff(s.rafa.email ?? '')

    expect((await s.app.request('/equipe/pessoas', { headers: owner })).status).toBe(200)
    expect((await s.app.request('/equipe/pessoas', { headers: provider })).status).toBe(403)
  })

  it('adiciona alguém já com jornada', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const res = await s.app.request('/equipe/pessoas', s.form(PERSON, cookie))
    expect(res.status).toBe(200)

    const [bia] = await s.db.select().from(providers).where(eq(providers.name, 'Bia Souza'))
    expect(bia).toMatchObject({
      phone: '11966661111',
      email: 'bia@salao.com.br',
      role: 'provider',
      slotMinutes: 30,
    })

    const workweek = await s.db
      .select()
      .from(providerHours)
      .where(eq(providerHours.providerId, bia?.id ?? ''))
    expect(workweek).toHaveLength(12)
  })

  it('quem entra na equipe consegue abrir a própria agenda', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    await s.app.request('/equipe/pessoas', s.form(PERSON, cookie))

    const headers = await s.asStaff('bia@salao.com.br')
    const [bia] = await s.db.select().from(providers).where(eq(providers.name, 'Bia Souza'))
    const res = await s.app.request(`/agenda/${bia?.id}?data=${MONDAY}`, { headers })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Bloquear 09:00')
  })

  it('recusa telefone repetido e slot fora da faixa', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')

    const duplicate = await s.app.request(
      '/equipe/pessoas',
      s.form({ ...PERSON, telefone: s.rafa.phone }, cookie),
    )
    expect(duplicate.status).toBe(422)
    expect(await duplicate.text()).toContain('Já existe alguém com esse telefone')

    const slot = await s.app.request(
      '/equipe/pessoas',
      s.form(
        { ...PERSON, email: 'outra@salao.com.br', telefone: '11966662222', slot: '3' },
        cookie,
      ),
    )
    expect(slot.status).toBe(422)
    expect(await slot.text()).toContain('entre 5 e 240 minutos')
  })

  it('edita papel e antecedência', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    await s.app.request(
      `/equipe/pessoas/${s.rafa.id}`,
      s.form(
        {
          nome: 'Rafa Lima',
          email: s.rafa.email ?? '',
          telefone: s.rafa.phone,
          papel: 'owner',
          slot: '30',
          antecedencia: '15',
        },
        cookie,
      ),
    )

    const [rafa] = await s.db.select().from(providers).where(eq(providers.id, s.rafa.id))
    expect(rafa).toMatchObject({ role: 'owner', minLeadMinutes: 15 })
  })

  it('tira da equipe quem saiu, e essa pessoa perde o acesso', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    const rafaHeaders = await s.asStaff(s.rafa.email ?? '')

    await s.app.request(`/equipe/pessoas/${s.rafa.id}/ativo`, s.form({ ativo: 'nao' }, cookie))

    const [rafa] = await s.db.select().from(providers).where(eq(providers.id, s.rafa.id))
    expect(rafa?.active).toBe(false)

    const res = await s.app.request(`/agenda/${s.rafa.id}`, { headers: rafaHeaders })
    expect(res.status).toBe(303)
  })

  it('não deixa o dono tirar a si mesmo nem o salão ficar sem dono', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')

    const me = await s.app.request(
      `/equipe/pessoas/${s.carla.id}/ativo`,
      s.form({ ativo: 'nao' }, cookie),
    )
    expect(me.status).toBe(422)
    expect(await me.text()).toContain('a si mesmo')

    const demote = await s.app.request(
      `/equipe/pessoas/${s.carla.id}`,
      s.form(
        {
          nome: 'Carla Mendes',
          email: s.carla.email ?? '',
          telefone: s.carla.phone,
          papel: 'provider',
          slot: '60',
          antecedencia: '60',
        },
        cookie,
      ),
    )
    expect(demote.status).toBe(422)
    expect(await demote.text()).toContain('pelo menos um dono')
  })
})

describe('o que a tela manda e a rota lê', () => {
  it('trazer de volta funciona com o payload que a própria tela monta', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.email ?? '')
    await s.app.request(`/equipe/pessoas/${s.rafa.id}/ativo`, s.form({ ativo: 'nao' }, cookie))

    // É a volta que separa: campo com nome errado chega vazio, e vazio tira da
    // equipe, então tirar passaria mesmo quebrado.
    const screen = await (
      await s.app.request(`/equipe/pessoas?editar=${s.rafa.id}`, {
        headers: { host: HOST, cookie },
      })
    ).text()
    const payload = hxVals(screen, 'Trazer de volta')
    await s.app.request(`/equipe/pessoas/${s.rafa.id}/ativo`, s.form(payload, cookie))

    const [row] = await s.db.select().from(providers).where(eq(providers.id, s.rafa.id))
    expect(row?.active).toBe(true)
  })
})
