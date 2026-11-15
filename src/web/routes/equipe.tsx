import { type Context, Hono } from 'hono'
import { normalizeEmail } from '../../domain/email.ts'
import { normalizePhone } from '../../domain/phone.ts'
import { clientIp } from '../../domain/privacy.ts'
import { createAuthEventRepo } from '../../repos/auth-events.ts'
import { createProviderRepo, type ProviderInput } from '../../repos/providers.ts'
import type { Deps } from '../deps.ts'
import { requireOwner, type StaffEnv, staffMiddleware } from '../staff.ts'
import { requireArea, type TenantEnv } from '../tenant.ts'
import { Acessos } from '../views/acessos.tsx'
import { EntrarEquipe, type EntrarEquipeProps, Painel } from '../views/equipe.tsx'
import { Layout } from '../views/layout.tsx'
import { Pessoas, type PessoasProps } from '../views/pessoas.tsx'
import { StaffLayout } from '../views/staff-layout.tsx'

function safeNext(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/equipe'
}

export function equipeRoutes({ db, auth }: Deps) {
  const providerRepo = createProviderRepo(db)
  const eventRepo = createAuthEventRepo(db)
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
        <Layout title="Entrar" companyName={companyName}>
          <EntrarEquipe {...props} />
        </Layout>
      ),
      status as 200,
    )

  app.get('/entrar', (c) => {
    const company = c.get('company')
    return render(c, { next: safeNext(c.req.query('next')) }, company.name)
  })

  /**
   * O link só é emitido para e-mail que já está na equipe ativa deste salão:
   * é isso que faz o acesso ser por convite, e não por cadastro aberto.
   */
  app.post('/entrar', async (c) => {
    const company = c.get('company')
    const body = await c.req.parseBody()
    const next = safeNext(body.next)
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : undefined)
    if (!email) return render(c, { next, error: 'E-mail inválido.' }, company.name, 422)

    const staff = await providerRepo.findByEmail(company.id, email)
    if (staff?.active) {
      await auth.api.signInMagicLink({
        body: { email, callbackURL: next, name: staff.name },
        headers: c.req.raw.headers,
      })
    } else {
      // Pedido de link por quem não é da equipe é o sinal de que alguém está tentando entrar.
      await eventRepo.record({
        companyId: company.id,
        type: 'login_failed',
        email,
        ip: clientIp(c.req.raw.headers),
        userAgent: c.req.header('user-agent'),
        reason: staff ? 'fora da equipe' : 'e-mail desconhecido',
      })
    }

    return render(c, { next, sentTo: email }, company.name)
  })

  const painel = new Hono<StaffEnv>()
  painel.use('*', staffMiddleware(auth, providerRepo))

  painel.get('/', async (c) => {
    const company = c.get('company')
    const staff = c.get('staff')

    // Quem atende tem uma agenda só: a lista não acrescenta nada.
    if (staff.role !== 'owner') return c.redirect(`/agenda/${staff.id}`, 303)

    return c.html(
      <StaffLayout title="Agendas" company={company} staff={staff} active="agendas">
        <Painel staff={staff} providers={await providerRepo.listByCompany(company.id)} />
      </StaffLayout>,
    )
  })

  painel.post('/sair', async (c) => {
    await eventRepo.record({
      companyId: c.get('company').id,
      type: 'logout',
      email: c.get('staff').email,
      ip: clientIp(c.req.raw.headers),
      userAgent: c.req.header('user-agent'),
    })
    await auth.api.signOut({ headers: c.req.raw.headers, asResponse: false })
    c.header('HX-Redirect', '/equipe/entrar')
    return c.redirect('/equipe/entrar', 303)
  })

  /** Cadastro da equipe é do dono: é por aqui que entra quem vai atender. */
  const pessoas = new Hono<StaffEnv>()
  pessoas.use('*', staffMiddleware(auth, providerRepo))
  pessoas.use('*', requireOwner())

  function readPessoa(body: Record<string, unknown>): ProviderInput | { error: string } {
    const name = typeof body.nome === 'string' ? body.nome.trim() : ''
    if (name.length < 2) return { error: 'Escreva o nome da pessoa.' }

    const email = normalizeEmail(typeof body.email === 'string' ? body.email : undefined)
    if (!email) return { error: 'E-mail inválido: é por ele que a pessoa entra.' }

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
      email,
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
        <StaffLayout title="Equipe" company={company} staff={c.get('staff')} active="pessoas">
          <Pessoas {...view} />
        </StaffLayout>
      ),
      status as 200,
    )
  }

  /** Convite é o próprio link de acesso: a pessoa não escolhe senha nem
   * preenche cadastro, só clica e entra. */
  async function convidar(c: Context<StaffEnv>, name: string, email: string) {
    if (!email) return
    await auth.api.signInMagicLink({
      body: { email, callbackURL: '/equipe', name },
      headers: c.req.raw.headers,
    })
  }

  pessoas.get('/', (c) => pessoasView(c, { editingId: c.req.query('editar') }))

  pessoas.post('/:id/convite', async (c) => {
    const company = c.get('company')
    const pessoa = await providerRepo.findById(company.id, c.req.param('id') ?? '')
    if (!pessoa) return c.notFound()
    if (!pessoa.active) {
      return pessoasView(c, { error: 'Essa pessoa não está mais na equipe.' }, 422)
    }

    await convidar(c, pessoa.name, pessoa.email ?? '')
    return pessoasView(c, { editingId: pessoa.id })
  })

  pessoas.post('/', async (c) => {
    const company = c.get('company')
    const parsed = readPessoa(await c.req.parseBody())
    if ('error' in parsed) return pessoasView(c, { error: parsed.error }, 422)

    if (await providerRepo.findByPhone(company.id, parsed.phone)) {
      return pessoasView(c, { error: 'Já existe alguém com esse telefone.' }, 422)
    }
    if (parsed.email && (await providerRepo.findByEmail(company.id, parsed.email))) {
      return pessoasView(c, { error: 'Já existe alguém com esse e-mail.' }, 422)
    }

    const criada = await providerRepo.create(company.id, parsed)
    await convidar(c, criada.name, criada.email ?? '')
    return pessoasView(c)
  })

  pessoas.post('/:id', async (c) => {
    const company = c.get('company')
    const id = c.req.param('id') ?? ''
    const existing = await providerRepo.findById(company.id, id)
    if (!existing) return c.notFound()

    const parsed = readPessoa(await c.req.parseBody())
    if ('error' in parsed) return pessoasView(c, { error: parsed.error, editingId: id }, 422)

    const mesmoTelefone = await providerRepo.findByPhone(company.id, parsed.phone)
    if (mesmoTelefone && mesmoTelefone.id !== id) {
      return pessoasView(c, { error: 'Já existe alguém com esse telefone.', editingId: id }, 422)
    }
    const mesmoEmail = parsed.email
      ? await providerRepo.findByEmail(company.id, parsed.email)
      : undefined
    if (mesmoEmail && mesmoEmail.id !== id) {
      return pessoasView(c, { error: 'Já existe alguém com esse e-mail.', editingId: id }, 422)
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

  /** O registro é do salão, então fica com o dono. */
  const acessos = new Hono<StaffEnv>()
  acessos.use('*', staffMiddleware(auth, providerRepo))
  acessos.use('*', requireOwner())
  acessos.get('/', async (c) => {
    const company = c.get('company')
    return c.html(
      <StaffLayout title="Acessos" company={company} staff={c.get('staff')} active="acessos">
        <Acessos items={await eventRepo.listRecent(company.id)} timeZone={company.timezone} />
      </StaffLayout>,
    )
  })

  app.route('/acessos', acessos)
  app.route('/pessoas', pessoas)
  app.route('/', painel)
  return app
}
