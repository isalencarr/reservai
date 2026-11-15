import { type Context, Hono } from 'hono'
import type { Db } from '../../db/client.ts'
import { CODE_MAX_ATTEMPTS, codeExpiry, generateCode, hashCode } from '../../domain/access-code.ts'
import { normalizePhone } from '../../domain/phone.ts'
import type { Notifier } from '../../notify/notifier.ts'
import { createAccessCodeRepo } from '../../repos/access-codes.ts'
import type { ProviderInput } from '../../repos/providers.ts'
import { createProviderRepo } from '../../repos/providers.ts'
import { clearStaffSession, setStaffSession } from '../auth.ts'
import { requireOwner, type StaffEnv, staffMiddleware } from '../staff.ts'
import { requireArea, type TenantEnv } from '../tenant.ts'
import { EntrarEquipe, type EntrarEquipeProps, Painel } from '../views/equipe.tsx'
import { Layout } from '../views/layout.tsx'
import { Pessoas, type PessoasProps } from '../views/pessoas.tsx'

function safeNext(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/equipe'
}

export function equipeRoutes(db: Db, notifier: Notifier) {
  const providerRepo = createProviderRepo(db)
  const codeRepo = createAccessCodeRepo(db)
  const app = new Hono<TenantEnv>()
  app.use('*', requireArea('staff'))

  const render = (
    c: Context<TenantEnv>,
    props: EntrarEquipeProps,
    companyName: string,
    status = 200,
  ) =>
    c.html(
      c.req.header('HX-Request') ? (
        <EntrarEquipe {...props} />
      ) : (
        <Layout title="Equipe" companyName={companyName}>
          <EntrarEquipe {...props} />
        </Layout>
      ),
      status as 200,
    )

  app.get('/entrar', (c) => {
    const company = c.get('company')
    return render(c, { next: safeNext(c.req.query('next')) }, company.name)
  })

  /** A resposta é a mesma para número da equipe e número qualquer: a lista de
   * quem trabalha no salão não precisa vazar por tentativa e erro. */
  app.post('/entrar', async (c) => {
    const company = c.get('company')
    const body = await c.req.parseBody()
    const next = safeNext(body.next)
    const phone = normalizePhone(typeof body.telefone === 'string' ? body.telefone : undefined)
    if (!phone) {
      return render(c, { next, error: 'Telefone inválido. Use DDD e número.' }, company.name, 422)
    }

    const staff = await providerRepo.findByPhone(company.id, phone)
    if (staff?.active) {
      const code = generateCode()
      await codeRepo.issue({
        companyId: company.id,
        phone,
        name: staff.name,
        audience: 'staff',
        codeHash: hashCode(code),
        expiresAt: codeExpiry(new Date()),
      })
      await notifier.send({ kind: 'access-code', to: phone, code })
    }

    return render(c, { next, phone }, company.name)
  })

  app.post('/entrar/codigo', async (c) => {
    const company = c.get('company')
    const body = await c.req.parseBody()
    const next = safeNext(body.next)
    const phone = normalizePhone(typeof body.telefone === 'string' ? body.telefone : undefined)
    const typed = typeof body.codigo === 'string' ? body.codigo.replace(/\D/g, '') : ''
    if (!phone) return render(c, { next, error: 'Comece de novo, por favor.' }, company.name, 422)

    const active = await codeRepo.findActive(company.id, phone, 'staff', new Date())
    if (!active) {
      return render(c, { next, error: 'O código venceu. Peça outro.' }, company.name, 422)
    }

    if (active.attempts + 1 >= CODE_MAX_ATTEMPTS && active.codeHash !== hashCode(typed)) {
      await codeRepo.clear(company.id, phone, 'staff')
      return render(
        c,
        { next, error: 'Muitas tentativas. Peça um código novo.' },
        company.name,
        422,
      )
    }

    if (active.codeHash !== hashCode(typed)) {
      await codeRepo.registerAttempt(active.id)
      return render(c, { next, phone, error: 'Código errado.' }, company.name, 422)
    }

    const staff = await providerRepo.findByPhone(company.id, phone)
    if (!staff?.active) {
      return render(c, { next, error: 'Esse número não está mais na equipe.' }, company.name, 403)
    }

    await codeRepo.clear(company.id, phone, 'staff')
    await setStaffSession(c, company.id, staff.id)
    c.header('HX-Redirect', next)
    return c.redirect(next, 303)
  })

  const painel = new Hono<StaffEnv>()
  painel.use('*', staffMiddleware(providerRepo))

  painel.get('/', async (c) => {
    const company = c.get('company')
    const staff = c.get('staff')
    const providers =
      staff.role === 'owner' ? await providerRepo.listByCompany(company.id) : [staff]
    return c.html(
      <Layout title="Equipe" companyName={company.name}>
        <Painel staff={staff} providers={providers} />
      </Layout>,
    )
  })

  painel.post('/sair', (c) => {
    clearStaffSession(c)
    c.header('HX-Redirect', '/')
    return c.redirect('/', 303)
  })

  /** Cadastro da equipe é do dono: é por aqui que entra quem vai atender. */
  const pessoas = new Hono<StaffEnv>()
  pessoas.use('*', staffMiddleware(providerRepo))
  pessoas.use('*', requireOwner())

  function readPessoa(body: Record<string, unknown>): ProviderInput | { error: string } {
    const name = typeof body.nome === 'string' ? body.nome.trim() : ''
    if (name.length < 2) return { error: 'Escreva o nome da pessoa.' }

    const phone = normalizePhone(typeof body.telefone === 'string' ? body.telefone : undefined)
    if (!phone) return { error: 'Telefone inválido. Use DDD e número.' }

    const slotMinutes = Number(body.slot)
    if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) {
      return { error: 'O slot precisa estar entre 5 e 240 minutos.' }
    }

    const minLeadMinutes = Number(body.antecedencia)
    if (!Number.isInteger(minLeadMinutes) || minLeadMinutes < 0 || minLeadMinutes > 1440) {
      return { error: 'A antecedência precisa estar entre 0 e 1440 minutos.' }
    }

    return {
      name,
      phone,
      role: body.papel === 'owner' ? 'owner' : 'provider',
      slotMinutes,
      minLeadMinutes,
    }
  }

  async function pessoasView(
    c: Context<StaffEnv>,
    options: { error?: string; editingId?: string } = {},
    status = 200,
  ) {
    const company = c.get('company')
    const items = await providerRepo.listAll(company.id)
    const view: PessoasProps = {
      items,
      me: c.get('staff'),
      editing: items.find((p) => p.id === options.editingId),
      error: options.error,
    }
    return c.html(
      c.req.header('HX-Request') ? (
        <Pessoas {...view} />
      ) : (
        <Layout title="Equipe" companyName={company.name}>
          <Pessoas {...view} />
        </Layout>
      ),
      status as 200,
    )
  }

  pessoas.get('/', (c) => pessoasView(c, { editingId: c.req.query('editar') }))

  pessoas.post('/', async (c) => {
    const company = c.get('company')
    const parsed = readPessoa(await c.req.parseBody())
    if ('error' in parsed) return pessoasView(c, { error: parsed.error }, 422)

    if (await providerRepo.findByPhone(company.id, parsed.phone)) {
      return pessoasView(c, { error: 'Já existe alguém com esse telefone.' }, 422)
    }

    await providerRepo.create(company.id, parsed)
    return pessoasView(c)
  })

  pessoas.post('/:id', async (c) => {
    const company = c.get('company')
    const id = c.req.param('id') ?? ''
    const existing = await providerRepo.findById(company.id, id)
    if (!existing) return c.notFound()

    const parsed = readPessoa(await c.req.parseBody())
    if ('error' in parsed) return pessoasView(c, { error: parsed.error, editingId: id }, 422)

    const outro = await providerRepo.findByPhone(company.id, parsed.phone)
    if (outro && outro.id !== id) {
      return pessoasView(c, { error: 'Já existe alguém com esse telefone.', editingId: id }, 422)
    }

    // Rebaixar o último dono deixaria o salão sem quem administra catálogo e carteira.
    if (
      existing.role === 'owner' &&
      parsed.role !== 'owner' &&
      (await providerRepo.countOtherOwners(company.id, id)) === 0
    ) {
      return pessoasView(c, { error: 'O salão precisa de pelo menos um dono.', editingId: id }, 422)
    }

    await providerRepo.update(company.id, id, parsed)
    return pessoasView(c)
  })

  pessoas.post('/:id/ativo', async (c) => {
    const company = c.get('company')
    const id = c.req.param('id') ?? ''
    const body = await c.req.parseBody()
    const active = body.ativo === 'sim'

    if (id === c.get('staff').id) {
      return pessoasView(
        c,
        { error: 'Você não pode tirar a si mesmo da equipe.', editingId: id },
        422,
      )
    }

    const existing = await providerRepo.findById(company.id, id)
    if (!existing) return c.notFound()

    if (
      !active &&
      existing.role === 'owner' &&
      (await providerRepo.countOtherOwners(company.id, id)) === 0
    ) {
      return pessoasView(c, { error: 'O salão precisa de pelo menos um dono.', editingId: id }, 422)
    }

    await providerRepo.setActive(company.id, id, active)
    return pessoasView(c)
  })

  app.route('/pessoas', pessoas)
  app.route('/', painel)
  return app
}
