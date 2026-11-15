import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { criarSalao } from '../src/cli/novo-salao.ts'
import { companies, providerHours, providers } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, createTestDb, staffLogin, upcomingWeekday } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
const MONDAY = upcomingWeekday(1, 'America/Sao_Paulo')

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const asStaff = async (phone: string) => ({
    host: HOST,
    cookie: await staffLogin(app, notifier, HOST, phone),
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

const PESSOA = { nome: 'Bia Souza', telefone: '(11) 96666-1111', slot: '30', antecedencia: '60' }

describe('cadastro da equipe', () => {
  it('só o dono abre a tela', async () => {
    const s = await setup()
    const dono = await s.asStaff(s.carla.phone)
    const prestador = await s.asStaff(s.rafa.phone)

    expect((await s.app.request('/equipe/pessoas', { headers: dono })).status).toBe(200)
    expect((await s.app.request('/equipe/pessoas', { headers: prestador })).status).toBe(403)
  })

  it('adiciona alguém já com jornada', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.phone)
    const res = await s.app.request('/equipe/pessoas', s.form(PESSOA, cookie))
    expect(res.status).toBe(200)

    const [bia] = await s.db.select().from(providers).where(eq(providers.name, 'Bia Souza'))
    expect(bia).toMatchObject({ phone: '11966661111', role: 'provider', slotMinutes: 30 })

    const jornada = await s.db
      .select()
      .from(providerHours)
      .where(eq(providerHours.providerId, bia?.id ?? ''))
    expect(jornada).toHaveLength(12)
  })

  it('quem entra na equipe consegue abrir a própria agenda', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.phone)
    await s.app.request('/equipe/pessoas', s.form(PESSOA, cookie))

    const headers = await s.asStaff('11966661111')
    const [bia] = await s.db.select().from(providers).where(eq(providers.name, 'Bia Souza'))
    const res = await s.app.request(`/agenda/${bia?.id}?date=${MONDAY}`, { headers })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Bloquear 09:00')
  })

  it('recusa telefone repetido e slot fora da faixa', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.phone)

    const repetido = await s.app.request(
      '/equipe/pessoas',
      s.form({ ...PESSOA, telefone: s.rafa.phone }, cookie),
    )
    expect(repetido.status).toBe(422)
    expect(await repetido.text()).toContain('Já existe alguém com esse telefone')

    const slot = await s.app.request('/equipe/pessoas', s.form({ ...PESSOA, slot: '3' }, cookie))
    expect(slot.status).toBe(422)
    expect(await slot.text()).toContain('entre 5 e 240 minutos')
  })

  it('edita papel e antecedência', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.phone)
    await s.app.request(
      `/equipe/pessoas/${s.rafa.id}`,
      s.form(
        {
          nome: 'Rafa Lima',
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
    const { cookie } = await s.asStaff(s.carla.phone)
    const rafaHeaders = await s.asStaff(s.rafa.phone)

    await s.app.request(`/equipe/pessoas/${s.rafa.id}/ativo`, s.form({ ativo: 'nao' }, cookie))

    const [rafa] = await s.db.select().from(providers).where(eq(providers.id, s.rafa.id))
    expect(rafa?.active).toBe(false)

    const res = await s.app.request(`/agenda/${s.rafa.id}`, { headers: rafaHeaders })
    expect(res.status).toBe(303)
  })

  it('não deixa o dono tirar a si mesmo nem o salão ficar sem dono', async () => {
    const s = await setup()
    const { cookie } = await s.asStaff(s.carla.phone)

    const eu = await s.app.request(
      `/equipe/pessoas/${s.carla.id}/ativo`,
      s.form({ ativo: 'nao' }, cookie),
    )
    expect(eu.status).toBe(422)
    expect(await eu.text()).toContain('a si mesmo')

    const rebaixar = await s.app.request(
      `/equipe/pessoas/${s.carla.id}`,
      s.form(
        {
          nome: 'Carla Mendes',
          telefone: s.carla.phone,
          papel: 'provider',
          slot: '60',
          antecedencia: '60',
        },
        cookie,
      ),
    )
    expect(rebaixar.status).toBe(422)
    expect(await rebaixar.text()).toContain('pelo menos um dono')
  })
})

describe('criação de salão pelo terminal', () => {
  const base = {
    nome: 'Salão da Inês',
    host: 'ines.com.br',
    dono: 'Inês Prado',
    telefone: '(11) 95555-2222',
  }

  it('cria salão, dono e jornada', async () => {
    const db = createTestDb()
    const { company, owner } = await criarSalao(db, base)

    expect(company).toMatchObject({ slug: 'salao-da-ines', host: 'ines.com.br' })
    expect(owner).toMatchObject({ role: 'owner', phone: '11955552222' })

    const jornada = await db
      .select()
      .from(providerHours)
      .where(eq(providerHours.providerId, owner.id))
    expect(jornada).toHaveLength(12)
  })

  it('o dono criado já entra pela porta da equipe', async () => {
    const db = createTestDb()
    const { owner } = await criarSalao(db, base)
    const notifier = createLogNotifier(false)
    const app = createApp(db, notifier)

    const cookie = await staffLogin(app, notifier, 'equipe.ines.com.br', owner.phone)
    const res = await app.request('/clientes', { headers: { host: 'equipe.ines.com.br', cookie } })
    expect(res.status).toBe(200)
  })

  it('grava o host sem porta, protocolo ou barra', async () => {
    const db = createTestDb()
    const { company } = await criarSalao(db, {
      ...base,
      host: 'https://ZeBarber.localhost:3000/agenda',
    })
    expect(company.host).toBe('zebarber.localhost')
  })

  it('recusa o endereço da equipe como host do salão', async () => {
    const db = createTestDb()
    expect(criarSalao(db, { ...base, host: 'equipe.ines.com.br' })).rejects.toThrow(
      'informe o endereço do cliente',
    )
  })

  it('explica a colisão de apelido em vez de estourar', async () => {
    const db = createTestDb()
    await criarSalao(db, base)
    expect(criarSalao(db, { ...base, host: 'outro.com.br' })).rejects.toThrow(
      'já está em uso; escolha outro com --slug',
    )
  })

  it('recusa host repetido e telefone inválido', async () => {
    const db = createTestDb()
    await criarSalao(db, base)

    expect(criarSalao(db, { ...base, slug: 'outro' })).rejects.toThrow('já existe um salão em')
    expect(criarSalao(db, { ...base, host: 'novo.com.br', telefone: '99' })).rejects.toThrow(
      'Telefone inválido'.toLowerCase(),
    )
  })

  it('não mistura salões criados pelo comando', async () => {
    const db = createTestDb()
    await criarSalao(db, base)
    await criarSalao(db, { ...base, nome: 'Outro Salão', host: 'outro.com.br' })

    expect(await db.select().from(companies)).toHaveLength(2)
  })
})
