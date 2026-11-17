import { type Context, Hono } from 'hono'
import { normalizeEmail } from '../../domain/email.ts'
import { normalizePhone } from '../../domain/phone.ts'
import { clientIp } from '../../domain/privacy.ts'
import { isThemeMode, paletteOf } from '../../domain/theme.ts'
import { parseMinute } from '../../domain/time.ts'
import {
  defaultWorkweek,
  WEEKDAY_NAMES,
  type WorkRange,
  workweekError,
} from '../../domain/workday.ts'
import { createAppointmentRepo } from '../../repos/appointments.ts'
import { createAuthEventRepo } from '../../repos/auth-events.ts'
import { createCompanyRepo } from '../../repos/companies.ts'
import { createProviderRepo, type ProviderInput } from '../../repos/providers.ts'
import type { Deps } from '../deps.ts'
import {
  denyOnSupport,
  layoutProps,
  requireOwner,
  type StaffEnv,
  staffMiddleware,
  supportEntryOf,
} from '../staff.ts'
import { requireArea, type TenantEnv } from '../tenant.ts'
import { AccessLog } from '../views/access-log.tsx'
import { Appearance } from '../views/appearance.tsx'
import { Guide } from '../views/guide.tsx'
import { Layout } from '../views/layout.tsx'
import { People, type PeopleProps } from '../views/people.tsx'
import { StaffLayout } from '../views/staff-layout.tsx'
import { StaffLogin, type StaffLoginProps, TeamPanel } from '../views/team.tsx'
import { Workweek, type WorkweekProps } from '../views/workweek.tsx'
import { rangeField, text, WIRE, type WireBody, YES } from '../wire.ts'

function safeNext(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/equipe'
}

export function teamRoutes({ db, auth }: Deps) {
  const providerRepo = createProviderRepo(db)
  const companyRepo = createCompanyRepo(db)
  const appointmentRepo = createAppointmentRepo(db)
  const eventRepo = createAuthEventRepo(db)
  const app = new Hono<TenantEnv>()
  app.use('*', requireArea('staff'))

  const render = (c: Context<TenantEnv>, props: StaffLoginProps, status = 200) =>
    c.html(
      c.req.header('HX-Request') ? (
        <StaffLogin {...props} />
      ) : (
        <Layout title="Entrar" company={c.get('company')}>
          <StaffLogin {...props} />
        </Layout>
      ),
      status as 200,
    )

  app.get('/entrar', (c) => render(c, { next: safeNext(c.req.query(WIRE.next)) }))

  /**
   * O link só é emitido para e-mail que já está na equipe ativa deste salão —
   * é isso que faz o acesso ser por convite, e não por cadastro aberto — ou
   * para quem cuida da plataforma com janela de suporte aberta aqui.
   */
  app.post('/entrar', async (c) => {
    const company = c.get('company')
    const body = await c.req.parseBody()
    const next = safeNext(text(body, WIRE.next))
    const email = normalizeEmail(text(body, WIRE.email))
    if (!email) return render(c, { next, error: 'E-mail inválido.' }, 422)

    const staff = await providerRepo.findByEmail(company.id, email)
    const support = staff ? undefined : await supportEntryOf(db, company.id, email)
    if (staff?.active || support) {
      await auth.api.signInMagicLink({
        body: { email, callbackURL: next, name: staff?.name ?? support?.name ?? email },
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

    return render(c, { next, sentTo: email })
  })

  const painel = new Hono<StaffEnv>()
  painel.use('*', staffMiddleware(auth, db))

  painel.get('/', async (c) => {
    const company = c.get('company')
    const staff = c.get('staff')

    // Quem atende tem uma agenda só: a lista não acrescenta nada.
    if (staff.role !== 'owner') return c.redirect(`/agenda/${staff.id}`, 303)

    return c.html(
      <StaffLayout title="Agendas" active="schedules" {...layoutProps(c)}>
        <TeamPanel
          staff={staff}
          providers={await providerRepo.listByCompany(company.id)}
          pending={await appointmentRepo.countPendingByProvider(company.id)}
        />
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
  const people = new Hono<StaffEnv>()
  people.use('*', staffMiddleware(auth, db))
  people.use('*', requireOwner())
  people.use('*', denyOnSupport())

  function readPerson(body: WireBody): ProviderInput | { error: string } {
    const name = text(body, WIRE.name)
    if (name.length < 2) return { error: 'Escreva o nome da pessoa.' }

    const email = normalizeEmail(text(body, WIRE.email))
    if (!email) return { error: 'E-mail inválido: é por ele que a pessoa entra.' }

    const phone = normalizePhone(text(body, WIRE.phone))
    if (!phone) return { error: 'Telefone inválido. Use DDD e número.' }

    const slotMinutes = Number(text(body, WIRE.slot))
    if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) {
      return { error: 'O slot precisa estar entre 5 e 240 minutos.' }
    }

    const minLeadMinutes = Number(text(body, WIRE.leadMinutes))
    if (!Number.isInteger(minLeadMinutes) || minLeadMinutes < 0 || minLeadMinutes > 1440) {
      return { error: 'A antecedência precisa estar entre 0 e 1440 minutos.' }
    }

    return {
      name,
      email,
      phone,
      role: text(body, WIRE.role) === 'owner' ? 'owner' : 'provider',
      slotMinutes,
      minLeadMinutes,
    }
  }

  async function peopleView(
    c: Context<StaffEnv>,
    options: { error?: string; editingId?: string } = {},
    status = 200,
  ) {
    const company = c.get('company')
    const items = await providerRepo.listAll(company.id)
    const view: PeopleProps = {
      items,
      me: c.get('staff'),
      editing: items.find((p) => p.id === options.editingId),
      error: options.error,
    }
    return c.html(
      c.req.header('HX-Request') ? (
        <People {...view} />
      ) : (
        <StaffLayout title="Equipe" active="people" {...layoutProps(c)}>
          <People {...view} />
        </StaffLayout>
      ),
      status as 200,
    )
  }

  /** Convite é o próprio link de acesso: a pessoa não escolhe senha nem
   * preenche cadastro, só clica e entra. */
  async function invite(c: Context<StaffEnv>, name: string, email: string) {
    if (!email) return
    await auth.api.signInMagicLink({
      body: { email, callbackURL: '/equipe', name },
      headers: c.req.raw.headers,
    })
  }

  people.get('/', (c) => peopleView(c, { editingId: c.req.query(WIRE.editing) }))

  people.post('/:id/convite', async (c) => {
    const company = c.get('company')
    const provider = await providerRepo.findById(company.id, c.req.param('id') ?? '')
    if (!provider) return c.notFound()
    if (!provider.active) {
      return peopleView(c, { error: 'Essa pessoa não está mais na equipe.' }, 422)
    }

    await invite(c, provider.name, provider.email ?? '')
    return peopleView(c, { editingId: provider.id })
  })

  people.post('/', async (c) => {
    const company = c.get('company')
    const parsed = readPerson(await c.req.parseBody())
    if ('error' in parsed) return peopleView(c, { error: parsed.error }, 422)

    if (await providerRepo.findByPhone(company.id, parsed.phone)) {
      return peopleView(c, { error: 'Já existe alguém com esse telefone.' }, 422)
    }
    if (parsed.email && (await providerRepo.findByEmail(company.id, parsed.email))) {
      return peopleView(c, { error: 'Já existe alguém com esse e-mail.' }, 422)
    }

    const criada = await providerRepo.create(company.id, parsed)
    await invite(c, criada.name, criada.email ?? '')
    return peopleView(c)
  })

  people.post('/:id', async (c) => {
    const company = c.get('company')
    const id = c.req.param('id') ?? ''
    const existing = await providerRepo.findById(company.id, id)
    if (!existing) return c.notFound()

    const parsed = readPerson(await c.req.parseBody())
    if ('error' in parsed) return peopleView(c, { error: parsed.error, editingId: id }, 422)

    const mesmoTelefone = await providerRepo.findByPhone(company.id, parsed.phone)
    if (mesmoTelefone && mesmoTelefone.id !== id) {
      return peopleView(c, { error: 'Já existe alguém com esse telefone.', editingId: id }, 422)
    }
    const mesmoEmail = parsed.email
      ? await providerRepo.findByEmail(company.id, parsed.email)
      : undefined
    if (mesmoEmail && mesmoEmail.id !== id) {
      return peopleView(c, { error: 'Já existe alguém com esse e-mail.', editingId: id }, 422)
    }

    // Rebaixar o último dono deixaria o salão sem quem administra catálogo e carteira.
    if (
      existing.role === 'owner' &&
      parsed.role !== 'owner' &&
      (await providerRepo.countOtherOwners(company.id, id)) === 0
    ) {
      return peopleView(c, { error: 'O salão precisa de pelo menos um dono.', editingId: id }, 422)
    }

    await providerRepo.update(company.id, id, parsed)
    return peopleView(c)
  })

  people.post('/:id/ativo', async (c) => {
    const company = c.get('company')
    const id = c.req.param('id') ?? ''
    const body = await c.req.parseBody()
    const active = text(body, WIRE.active) === YES

    if (id === c.get('staff').id) {
      return peopleView(
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
      return peopleView(c, { error: 'O salão precisa de pelo menos um dono.', editingId: id }, 422)
    }

    await providerRepo.setActive(company.id, id, active)
    return peopleView(c)
  })

  /** O registro é do salão, então fica com o dono. */
  const accessLog = new Hono<StaffEnv>()
  accessLog.use('*', staffMiddleware(auth, db))
  accessLog.use('*', requireOwner())
  accessLog.use('*', denyOnSupport())
  accessLog.get('/', async (c) => {
    const company = c.get('company')
    return c.html(
      <StaffLayout title="Acessos" active="access" {...layoutProps(c)}>
        <AccessLog items={await eventRepo.listRecent(company.id)} timeZone={company.timezone} />
      </StaffLayout>,
    )
  })

  /** O guia é a porta de entrada de quem está começando, então vale para a
   * equipe toda: cada um vê a explicação das telas que alcança. */
  const guide = new Hono<StaffEnv>()
  guide.use('*', staffMiddleware(auth, db))
  guide.get('/', (c) =>
    c.html(
      <StaffLayout title="Guia" active="guide" {...layoutProps(c)}>
        <Guide company={c.get('company')} staff={c.get('staff')} steps={c.get('setupSteps')} />
      </StaffLayout>,
    ),
  )

  /** Jornada é escala do salão, então fica com o dono: quem atende não decide
   * sozinho quando a própria agenda abre. */
  const workweek = new Hono<StaffEnv>()
  workweek.use('*', staffMiddleware(auth, db))
  workweek.use('*', requireOwner())

  async function workweekView(
    c: Context<StaffEnv>,
    options: { providerId?: string; error?: string; saved?: boolean } = {},
    status = 200,
  ) {
    const company = c.get('company')
    const team = await providerRepo.listByCompany(company.id)
    const provider = team.find((p) => p.id === options.providerId) ?? team[0]
    if (!provider) return c.notFound()

    const weeks = await Promise.all(
      team.map(async (member) => {
        const hours = await providerRepo.hoursFor(member.id)
        return { provider: member, days: new Set(hours.map((h) => h.weekday)).size }
      }),
    )

    const view: WorkweekProps = {
      items: weeks,
      provider,
      ranges: await providerRepo.hoursFor(provider.id),
      error: options.error,
      saved: options.saved,
    }

    return c.html(
      c.req.header('HX-Request') ? (
        <Workweek {...view} />
      ) : (
        <StaffLayout title="Jornada" active="workweek" {...layoutProps(c)}>
          <Workweek {...view} />
        </StaffLayout>
      ),
      status as 200,
    )
  }

  /** Duas faixas por dia no formulário: a lacuna entre elas é o almoço. Campo
   * vazio apaga a faixa, e dia sem faixa é folga. */
  function readWeek(body: WireBody): WorkRange[] | { error: string } {
    const ranges: WorkRange[] = []
    for (const weekday of WEEKDAY_NAMES.keys()) {
      for (const band of [1, 2] as const) {
        const start = parseMinute(text(body, rangeField(weekday, band, 'start')))
        const end = parseMinute(text(body, rangeField(weekday, band, 'end')))
        if (start === undefined && end === undefined) continue
        if (start === undefined || end === undefined) {
          return { error: `Em ${WEEKDAY_NAMES[weekday]}, a faixa precisa de início e fim.` }
        }
        ranges.push({ weekday, startMinute: start, endMinute: end })
      }
    }

    const error = workweekError(ranges)
    return error ? { error: error } : ranges
  }

  workweek.get('/', (c) => workweekView(c, { providerId: c.req.query(WIRE.person) }))

  workweek.post('/:id', async (c) => {
    const id = c.req.param('id') ?? ''
    const provider = await providerRepo.findById(c.get('company').id, id)
    if (!provider) return c.notFound()

    const week = readWeek(await c.req.parseBody())
    if ('error' in week) return workweekView(c, { providerId: id, error: week.error }, 422)

    await providerRepo.replaceHours(id, week)
    return workweekView(c, { providerId: id, saved: true })
  })

  workweek.post('/:id/padrao', async (c) => {
    const id = c.req.param('id') ?? ''
    const provider = await providerRepo.findById(c.get('company').id, id)
    if (!provider) return c.notFound()

    await providerRepo.replaceHours(id, defaultWorkweek())
    return workweekView(c, { providerId: id, saved: true })
  })

  /** Aparência é identidade do salão: fica com o dono. */
  const appearance = new Hono<StaffEnv>()
  appearance.use('*', staffMiddleware(auth, db))
  appearance.use('*', requireOwner())

  appearance.get('/', (c) => {
    const company = c.get('company')
    return c.html(
      <StaffLayout title="Aparência" active="appearance" {...layoutProps(c)}>
        <Appearance company={company} />
      </StaffLayout>,
    )
  })

  appearance.post('/', async (c) => {
    const company = c.get('company')
    const body = await c.req.parseBody()

    // Só cor da lista e só tom conhecido: a paleta é gerada, não digitada.
    const seed = paletteOf(text(body, WIRE.color))?.seed
    const typed = text(body, WIRE.mode)
    const mode = isThemeMode(typed) ? typed : undefined
    if (!seed && !mode) return c.text('Escolha uma cor ou um tom.', 422)

    await companyRepo.updateTheme(company.id, seed ?? company.themeSeed, mode ?? company.themeMode)
    return c.redirect('/equipe/aparencia', 303)
  })

  app.route('/guia', guide)
  app.route('/aparencia', appearance)
  app.route('/jornada', workweek)
  app.route('/acessos', accessLog)
  app.route('/pessoas', people)
  app.route('/', painel)
  return app
}
