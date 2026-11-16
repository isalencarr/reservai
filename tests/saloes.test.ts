import { describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { companies, providerHours } from '../src/db/schema.ts'
import { createLogNotifier } from '../src/notify/log-notifier.ts'
import { criarSalao, editarSalao } from '../src/platform/saloes.ts'
import { createApp } from '../src/web/app.tsx'
import { createTestDb, staffLogin } from './helpers.ts'

const base = {
  nome: 'Salão da Inês',
  host: 'ines.com.br',
  dono: 'Inês Prado',
  email: 'ines@ines.com.br',
  telefone: '(11) 95555-2222',
}

/** Erro de cadastro é resposta, não exceção: o terminal imprime e o formulário
 * do backoffice mostra a mesma frase. */
function erroDe(resultado: unknown): string {
  if (resultado && typeof resultado === 'object' && 'erro' in resultado) {
    return String((resultado as { erro: unknown }).erro)
  }
  throw new Error(`esperava erro, veio ${JSON.stringify(resultado)}`)
}

function salaoDe(resultado: Awaited<ReturnType<typeof criarSalao>>) {
  if ('erro' in resultado) throw new Error(`esperava salão, veio ${resultado.erro}`)
  return resultado
}

describe('criar salão', () => {
  it('cria salão, dono e jornada', async () => {
    const db = createTestDb()
    const { company, owner } = salaoDe(await criarSalao(db, base))

    expect(company).toMatchObject({
      slug: 'salao-da-ines',
      host: 'ines.com.br',
      timezone: 'America/Sao_Paulo',
    })
    expect(owner).toMatchObject({ role: 'owner', phone: '11955552222' })

    const jornada = await db
      .select()
      .from(providerHours)
      .where(eq(providerHours.providerId, owner.id))
    expect(jornada).toHaveLength(12)
  })

  it('o dono criado já entra pela porta da equipe', async () => {
    const db = createTestDb()
    const { owner } = salaoDe(await criarSalao(db, base))
    const notifier = createLogNotifier(false)
    const app = createApp(db, notifier)

    const cookie = await staffLogin(app, notifier, 'equipe.ines.com.br', owner.email ?? '')
    const res = await app.request('/clientes', { headers: { host: 'equipe.ines.com.br', cookie } })
    expect(res.status).toBe(200)
  })

  it('grava o host sem porta, protocolo ou barra', async () => {
    const db = createTestDb()
    const { company } = salaoDe(
      await criarSalao(db, { ...base, host: 'https://ZeBarber.localhost:3000/agenda' }),
    )
    expect(company.host).toBe('zebarber.localhost')
  })

  it('recusa o endereço da equipe como host do salão', async () => {
    const db = createTestDb()
    const erro = erroDe(await criarSalao(db, { ...base, host: 'equipe.ines.com.br' }))
    expect(erro).toContain('endereço do cliente')
  })

  it('recusa o endereço do backoffice', async () => {
    const db = createTestDb()
    const erro = erroDe(await criarSalao(db, { ...base, host: 'backoffice.localhost' }))
    expect(erro).toContain('backoffice')
  })

  it('recusa fuso que o Intl não conhece', async () => {
    const db = createTestDb()
    const erro = erroDe(await criarSalao(db, { ...base, fuso: 'America/Sao Paulo' }))
    expect(erro).toContain('Fuso horário desconhecido')
  })

  it('explica a colisão de apelido e de endereço', async () => {
    const db = createTestDb()
    await criarSalao(db, base)

    expect(erroDe(await criarSalao(db, { ...base, host: 'outro.com.br' }))).toContain(
      'já está em uso',
    )
    expect(erroDe(await criarSalao(db, { ...base, slug: 'outro' }))).toContain(
      'Já existe um salão em',
    )
  })

  it('recusa telefone e e-mail inválidos', async () => {
    const db = createTestDb()
    expect(erroDe(await criarSalao(db, { ...base, telefone: '99' }))).toContain('Telefone inválido')
    expect(erroDe(await criarSalao(db, { ...base, email: 'nao-e-email' }))).toContain(
      'E-mail inválido',
    )
  })

  it('não mistura salões criados pelo comando', async () => {
    const db = createTestDb()
    await criarSalao(db, base)
    await criarSalao(db, { ...base, nome: 'Outro Salão', host: 'outro.com.br' })

    expect(await db.select().from(companies)).toHaveLength(2)
  })
})

describe('editar salão', () => {
  it('troca nome, endereço, apelido e fuso', async () => {
    const db = createTestDb()
    const { company } = salaoDe(await criarSalao(db, base))

    const editado = await editarSalao(db, company.id, {
      nome: 'Studio Inês',
      host: 'studio-ines.com.br',
      slug: 'studio-ines',
      fuso: 'America/Manaus',
    })

    expect(editado).toMatchObject({
      name: 'Studio Inês',
      host: 'studio-ines.com.br',
      slug: 'studio-ines',
      timezone: 'America/Manaus',
    })
  })

  it('deixa salvar sem mudar o próprio endereço', async () => {
    const db = createTestDb()
    const { company } = salaoDe(await criarSalao(db, base))

    const editado = await editarSalao(db, company.id, {
      nome: 'Salão da Inês Prado',
      host: company.host,
      slug: company.slug,
      fuso: company.timezone,
    })
    expect(editado).toMatchObject({ name: 'Salão da Inês Prado' })
  })

  it('recusa endereço que já é de outro salão', async () => {
    const db = createTestDb()
    salaoDe(await criarSalao(db, base))
    const outro = salaoDe(
      await criarSalao(db, { ...base, nome: 'Outro', host: 'outro.com.br', slug: 'outro' }),
    )

    const erro = erroDe(
      await editarSalao(db, outro.company.id, {
        nome: 'Outro',
        host: 'ines.com.br',
        slug: 'outro',
        fuso: 'America/Sao_Paulo',
      }),
    )
    expect(erro).toContain('Já existe um salão em')
  })

  it('o salão passa a responder no endereço novo', async () => {
    const db = createTestDb()
    const { company } = salaoDe(await criarSalao(db, base))
    const app = createApp(db)

    await editarSalao(db, company.id, {
      nome: company.name,
      host: 'studio-ines.com.br',
      slug: company.slug,
      fuso: company.timezone,
    })

    expect((await app.request('/', { headers: { host: 'studio-ines.com.br' } })).status).toBe(200)
    expect((await app.request('/', { headers: { host: 'ines.com.br' } })).status).toBe(404)
  })
})
