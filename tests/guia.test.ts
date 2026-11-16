import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { providerHours, services } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { criarSalao } from '../src/platform/saloes.ts'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb, createTestDb, staffLogin } from './helpers.ts'

const EQUIPE = 'equipe.beleza-pura.localhost'

async function setup() {
  const seeded = await createSeededDb()
  const notifier = createLogNotifier(false)
  const app = createApp(seeded.db, notifier)
  const como = async (email: string) => ({
    host: EQUIPE,
    cookie: await staffLogin(app, notifier, EQUIPE, email),
  })
  return { ...seeded, notifier, app, como }
}

/** Salão recém-criado: endereço no ar, nenhum serviço, ninguém com jornada
 * cadastrada além da que vem com o dono. */
async function salaoNovo() {
  const db = createTestDb()
  const notifier = createLogNotifier(false)
  const app = createApp(db, notifier)
  const feito = await criarSalao(db, {
    nome: 'Salão da Inês',
    host: 'ines.localhost',
    dono: 'Inês Prado',
    email: 'ines@ines.com.br',
    telefone: '11955552222',
  })
  if ('erro' in feito) throw new Error(feito.erro)

  const host = 'equipe.ines.localhost'
  const cookie = await staffLogin(app, notifier, host, feito.owner.email ?? '')
  return { db, app, headers: { host, cookie }, ...feito }
}

describe('aviso de pendência', () => {
  it('salão novo avisa em toda tela interna', async () => {
    const s = await salaoNovo()

    for (const path of ['/equipe', '/horarios', '/servicos']) {
      const res = await s.app.request(path, { headers: s.headers })
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('Falta configurar')
      expect(html).toContain('/equipe/guia')
    }
  })

  it('salão configurado não avisa nada', async () => {
    const s = await setup()
    const headers = await s.como(s.carla.email ?? '')

    const res = await s.app.request('/equipe', { headers })
    expect(await res.text()).not.toContain('Falta configurar')
  })

  it('convite não aceito não vira tarja: não impede ninguém de marcar', async () => {
    const s = await setup()
    const headers = await s.como(s.carla.email ?? '')

    // A Rafa do seed ainda não entrou no app.
    const res = await s.app.request('/equipe', { headers })
    expect(await res.text()).not.toContain('Falta configurar')

    const guia = await s.app.request('/equipe/guia', { headers })
    expect(await guia.text()).toContain('Ainda não entrou no app: Rafa Lima')
  })

  it('o aviso não aparece dentro do próprio guia', async () => {
    const s = await salaoNovo()
    const res = await s.app.request('/equipe/guia', { headers: s.headers })

    const html = await res.text()
    expect(html).not.toContain('Falta configurar')
    expect(html).toContain('O que falta configurar')
  })

  it('quem atende não vê o aviso: não é ele que resolve', async () => {
    const s = await setup()
    await s.db.delete(services).where(eq(services.companyId, s.belezaPura.id))
    const headers = await s.como(s.rafa.email ?? '')

    const res = await s.app.request(`/agenda/${s.rafa.id}`, { headers })
    expect(await res.text()).not.toContain('Falta configurar')
  })
})

describe('página do guia', () => {
  it('lista o que falta, com link para a tela que resolve', async () => {
    const s = await salaoNovo()
    const res = await s.app.request('/equipe/guia', { headers: s.headers })

    const html = await res.text()
    expect(html).toContain('Cadastre o primeiro serviço')
    expect(html).toContain('/servicos')
    expect(html).not.toContain('Pronto para divulgar')
  })

  it('mostra o endereço para divulgar quando está tudo pronto', async () => {
    const s = await setup()
    const headers = await s.como(s.carla.email ?? '')

    const res = await s.app.request('/equipe/guia', { headers })
    const html = await res.text()
    expect(html).toContain('Pronto para divulgar')
    expect(html).toContain('beleza-pura.localhost')
  })

  it('cobra jornada de quem ficou sem nenhuma', async () => {
    const s = await setup()
    await s.db.delete(providerHours).where(eq(providerHours.providerId, s.rafa.id))
    const headers = await s.como(s.carla.email ?? '')

    const res = await s.app.request('/equipe/guia', { headers })
    const html = await res.text()
    expect(html).toContain('Sem horário de trabalho: Rafa Lima')
    expect(html).toContain('/horarios')
  })

  it('explica o app para quem atende, sem as telas do dono', async () => {
    const s = await setup()
    const headers = await s.como(s.rafa.email ?? '')

    const res = await s.app.request('/equipe/guia', { headers })
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('Como o cliente marca')
    expect(html).toContain('Minha agenda')
    expect(html).not.toContain('O que falta configurar')
    expect(html).not.toContain('Carteira é do salão')
  })

  it('o guia exige sessão', async () => {
    const s = await setup()
    const res = await s.app.request('/equipe/guia', { headers: { host: EQUIPE } })
    expect(res.status).toBe(303)
  })
})
