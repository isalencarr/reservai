import { describe, expect, it } from 'bun:test'
import { createApp } from '../src/web/app.tsx'
import { createSeededDb } from './helpers.ts'

const get = (app: ReturnType<typeof createApp>, path: string, host?: string) =>
  app.request(path, host ? { headers: { host } } : undefined)

describe('app', () => {
  it('responde health sem precisar de salão', async () => {
    const { db } = await createSeededDb()
    const res = await get(createApp(db), '/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('mostra o salão do domínio', async () => {
    const { db } = await createSeededDb()
    const res = await get(createApp(db), '/', 'beleza-pura.localhost')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Beleza Pura')
  })

  it('responde 404 para domínio sem salão', async () => {
    const { db } = await createSeededDb()
    const res = await get(createApp(db), '/', 'desconhecido.exemplo.com')
    expect(res.status).toBe(404)
  })
})

describe('separação de área por endereço', () => {
  const STAFF = 'equipe.beleza-pura.localhost'

  it('esconde a área da equipe no endereço do cliente', async () => {
    const { db } = await createSeededDb()
    const app = createApp(db)

    for (const path of ['/equipe', '/equipe/entrar', '/servicos', '/clientes', '/horarios']) {
      expect((await get(app, path, 'beleza-pura.localhost')).status).toBe(404)
    }
  })

  it('esconde o fluxo do cliente no endereço da equipe', async () => {
    const { db } = await createSeededDb()
    const app = createApp(db)

    for (const path of ['/entrar', '/reserva', '/reserva/meus']) {
      expect((await get(app, path, STAFF)).status).toBe(404)
    }
  })

  it('o endereço do cliente convida a agendar', async () => {
    const { db } = await createSeededDb()
    const app = createApp(db)
    const html = await (await get(app, '/', 'beleza-pura.localhost')).text()

    expect(html).toContain('Agendar um horário')
    expect(html).toContain('Beleza Pura')
  })

  it('o endereço da equipe não anuncia nada sem sessão', async () => {
    const { db } = await createSeededDb()
    const res = await get(createApp(db), '/', STAFF)

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/equipe/entrar')
  })
})
