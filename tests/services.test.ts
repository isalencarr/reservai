import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { appointments, services } from '../src/db/schema.ts'
import { toUtc } from '../src/domain/time.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, staffLogin, upcomingWeekday } from './helpers.ts'

const HOST = 'equipe.beleza-pura.localhost'
const SP = 'America/Sao_Paulo'
const base = { host: HOST, 'HX-Request': 'true' }
const auth = { cookie: '' }
const headers = () => ({ ...base, cookie: auth.cookie })
const MONDAY = upcomingWeekday(1, SP)

function form(values: Record<string, string | string[]>) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(key, item)
  }
  return {
    method: 'POST',
    headers: { ...headers(), 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }
}

/** O botão manda os campos por hx-vals. Se a tela e a rota discordarem do nome,
 * nada falha em voz alta: o serviço só não desativa. */
function hxVals(html: string, label: string): Record<string, string> {
  const upToLabel = html.slice(0, html.indexOf(label))
  const found = upToLabel.match(/hx-vals="([^"]*)"(?![\s\S]*hx-vals=)/)
  if (!found?.[1]) throw new Error(`sem hx-vals no botão ${label}`)
  return JSON.parse(found[1].replaceAll('&quot;', '"'))
}

/** O catálogo é do dono, então os testes entram como Carla. */
async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  auth.cookie = await staffLogin(app, notifier, HOST, seeded.carla.email ?? '')
  return { ...seeded, notifier, app }
}

describe('catálogo de serviços', () => {
  it('cria serviço com duração, preço e quem executa', async () => {
    const s = await setup()
    const res = await s.app.request(
      '/servicos',
      form({ nome: 'Hidratação', duracao: '45', preco: 'R$ 120,00', prestador: s.rafa.id }),
    )
    expect(res.status).toBe(200)

    const [novo] = await s.db.select().from(services).where(eq(services.name, 'Hidratação'))
    expect(novo).toMatchObject({ durationMinutes: 45, priceCents: 12000, active: true })

    const html = await (
      await s.app.request(`/horarios?servico=${novo?.id}&data=${MONDAY}`, { headers: headers() })
    ).text()
    expect(html).toContain('Rafa Lima')
    expect(html).not.toContain('Carla Mendes')
  })

  it('recusa duração fora da faixa sem gravar nada', async () => {
    const s = await setup()
    const before = (await s.db.select().from(services)).length
    const res = await s.app.request('/servicos', form({ nome: 'Teste', duracao: '3', preco: '' }))

    expect(res.status).toBe(422)
    expect(await res.text()).toContain('entre 5 e 600 minutos')
    expect((await s.db.select().from(services)).length).toBe(before)
  })

  it('recusa preço que não dá para entender', async () => {
    const s = await setup()
    const res = await s.app.request(
      '/servicos',
      form({ nome: 'Teste', duracao: '30', preco: 'combinar' }),
    )
    expect(res.status).toBe(422)
    expect(await res.text()).toContain('Preço inválido')
  })

  it('edita o serviço e troca quem executa', async () => {
    const s = await setup()
    await s.app.request(
      `/servicos/${s.progressiva.id}`,
      form({
        nome: 'Progressiva longa',
        duracao: '240',
        preco: '400,00',
        prestador: [s.carla.id, s.rafa.id],
      }),
    )

    const [row] = await s.db.select().from(services).where(eq(services.id, s.progressiva.id))
    expect(row).toMatchObject({ name: 'Progressiva longa', durationMinutes: 240 })

    const html = await (
      await s.app.request(`/horarios?servico=${s.progressiva.id}&data=${MONDAY}`, {
        headers: headers(),
      })
    ).text()
    expect(html).toContain('Rafa Lima')
  })

  it('desativar tira do catálogo mas mantém o que já estava marcado', async () => {
    const s = await setup()
    await s.db.insert(appointments).values({
      companyId: s.belezaPura.id,
      providerId: s.carla.id,
      serviceId: s.corte.id,
      startsAt: toUtc(MONDAY, 9 * 60, SP),
      endsAt: toUtc(MONDAY, 10 * 60, SP),
      status: 'confirmed',
      origin: 'app',
    })

    await s.app.request(`/servicos/${s.corte.id}/ativo`, form({ ativo: 'nao' }))

    const availability = await (
      await s.app.request(`/horarios?data=${MONDAY}`, { headers: headers() })
    ).text()
    expect(availability).not.toContain('Corte feminino')

    const schedule = await (
      await s.app.request(`/agenda/${s.carla.id}?data=${MONDAY}`, { headers: headers() })
    ).text()
    expect(schedule).toContain('Corte feminino')
  })

  it('reativa o serviço', async () => {
    const s = await setup()
    await s.app.request(`/servicos/${s.corte.id}/ativo`, form({ ativo: 'nao' }))
    await s.app.request(`/servicos/${s.corte.id}/ativo`, form({ ativo: 'sim' }))

    const [row] = await s.db.select().from(services).where(eq(services.id, s.corte.id))
    expect(row?.active).toBe(true)
  })

  it('não deixa editar serviço de outra empresa', async () => {
    const s = await setup()
    const [manicure] = await s.db.select().from(services).where(eq(services.name, 'Manicure'))
    const res = await s.app.request(
      `/servicos/${manicure?.id}`,
      form({ nome: 'Invasão', duracao: '30', preco: '' }),
    )
    expect(res.status).toBe(404)
  })
})

describe('tela do catálogo', () => {
  it('lista só o nome e o atalho de editar', async () => {
    const s = await setup()
    const html = await (await s.app.request('/servicos', { headers: headers() })).text()

    expect(html).toContain('Corte feminino')
    expect(html).toContain('>editar</button>')
    expect(html).not.toContain('value="Corte feminino"')
    expect(html).not.toContain('<div class="overlay">')
  })

  it('abre o modal com os campos do serviço escolhido', async () => {
    const s = await setup()
    const html = await (
      await s.app.request(`/servicos?editar=${s.corte.id}`, { headers: headers() })
    ).text()

    expect(html).toContain('<div class="overlay">')
    expect(html).toContain('value="Corte feminino"')
    expect(html).toContain('value="90,00"')
    expect(html).toContain('Desativar')
  })

  it('mantém o modal aberto quando a edição é inválida', async () => {
    const s = await setup()
    const res = await s.app.request(
      `/servicos/${s.corte.id}`,
      form({ nome: 'Corte', duracao: '2', preco: '' }),
    )
    const html = await res.text()

    expect(res.status).toBe(422)
    expect(html).toContain('<div class="overlay">')
    expect(html).toContain('entre 5 e 600 minutos')
  })

  it('fecha o modal depois de salvar', async () => {
    const s = await setup()
    const html = await (
      await s.app.request(
        `/servicos/${s.corte.id}`,
        form({ nome: 'Corte curto', duracao: '45', preco: '80,00', prestador: s.carla.id }),
      )
    ).text()

    expect(html).not.toContain('<div class="overlay">')
    expect(html).toContain('Corte curto')
  })

  it('ignora pedido de edição de serviço de outra empresa', async () => {
    const s = await setup()
    const [manicure] = await s.db.select().from(services).where(eq(services.name, 'Manicure'))
    const html = await (
      await s.app.request(`/servicos?editar=${manicure?.id}`, { headers: headers() })
    ).text()

    expect(html).not.toContain('<div class="overlay">')
  })
})

describe('o que a tela manda e a rota lê', () => {
  it('reativar serviço funciona com o payload que a própria tela monta', async () => {
    const s = await setup()
    await s.app.request(`/servicos/${s.corte.id}/ativo`, form({ ativo: 'nao' }))

    // Reativar é o caso que separa: campo com nome errado chega vazio, e vazio
    // significa desativar, então desativar passaria mesmo quebrado.
    const screen = await (
      await s.app.request(`/servicos?editar=${s.corte.id}`, { headers: headers() })
    ).text()
    await s.app.request(`/servicos/${s.corte.id}/ativo`, form(hxVals(screen, 'Reativar')))

    const [row] = await s.db.select().from(services).where(eq(services.id, s.corte.id))
    expect(row?.active).toBe(true)
  })
})
