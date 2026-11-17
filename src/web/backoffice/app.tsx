import { type Context, Hono } from 'hono'
import { normalizeEmail } from '../../domain/email.ts'
import { parsePrice } from '../../domain/money.ts'
import { clientIp } from '../../domain/privacy.ts'
import { paidUntilInstant } from '../../domain/subscription.ts'
import { formatWhen } from '../../domain/time.ts'
import {
  type CompanyIdentity,
  createCompany,
  type NewCompany,
  updateCompany,
} from '../../platform/companies.ts'
import { createAuthEventRepo } from '../../repos/auth-events.ts'
import { createCompanyRepo } from '../../repos/companies.ts'
import { createPlatformAdminRepo } from '../../repos/platform-admins.ts'
import { createSubscriptionRepo } from '../../repos/subscriptions.ts'
import { createSupportSessionRepo } from '../../repos/support-sessions.ts'
import type { Deps } from '../deps.ts'
import { type PlatformEnv, platformAdminMiddleware } from './admin.ts'
import { Companies, type CompaniesProps } from './views/companies.tsx'
import { BackofficeLayout } from './views/layout.tsx'
import { BackofficeLogin, type EntrarProps } from './views/login.tsx'

function safeNext(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Identidade do salão: os mesmos campos no formulário de criar e no de editar. */
function readIdentity(body: Record<string, unknown>): CompanyIdentity {
  return {
    name: text(body.nome),
    host: text(body.host),
    slug: text(body.slug),
    timezone: text(body.fuso),
  }
}

function readNewCompany(body: Record<string, unknown>): NewCompany {
  return {
    ...readIdentity(body),
    ownerName: text(body.dono),
    email: text(body.email),
    phone: text(body.telefone),
  }
}

/**
 * O app da plataforma. Vive num host próprio (`src/web/backoffice/host.ts`) e
 * não tem salão resolvido: nenhuma rota daqui enxerga `company` no contexto, e
 * é a lista `platform_admins` que decide quem entra.
 */
export function backofficeApp({ db, auth }: Deps) {
  const adminRepo = createPlatformAdminRepo(db)
  const companyRepo = createCompanyRepo(db)
  const subscriptionRepo = createSubscriptionRepo(db)
  const supportRepo = createSupportSessionRepo(db)
  const eventRepo = createAuthEventRepo(db)
  const app = new Hono<PlatformEnv>()

  app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    const res = await auth.handler(c.req.raw)

    // Link que não virou sessão é tentativa recusada. Sem empresa: o registro
    // da plataforma não pertence a salão nenhum.
    if (c.req.path.includes('/magic-link/verify') && res.headers.getSetCookie().length === 0) {
      await eventRepo.record({
        type: 'login_failed',
        ip: clientIp(c.req.raw.headers),
        userAgent: c.req.header('user-agent'),
        reason: 'backoffice: link inválido ou vencido',
      })
    }
    return res
  })

  const renderLogin = (c: Context<PlatformEnv>, props: EntrarProps, status = 200) =>
    c.html(
      c.req.header('HX-Request') ? (
        <BackofficeLogin {...props} />
      ) : (
        <BackofficeLayout title="Entrar">
          <BackofficeLogin {...props} />
        </BackofficeLayout>
      ),
      status as 200,
    )

  app.get('/entrar', (c) => renderLogin(c, { next: safeNext(c.req.query('next')) }))

  /** O link só sai para e-mail que já está em `platform_admins`: a lista é
   * criada na migração, então não existe cadastro aberto nesta porta. */
  app.post('/entrar', async (c) => {
    const body = await c.req.parseBody()
    const next = safeNext(body.next)
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : undefined)
    if (!email) return renderLogin(c, { next, error: 'E-mail inválido.' }, 422)

    const admin = await adminRepo.findByEmail(email)
    if (admin) {
      await auth.api.signInMagicLink({
        body: { email, callbackURL: next, name: admin.name },
        headers: c.req.raw.headers,
      })
    } else {
      // Pedido de link nesta porta por quem não administra a plataforma é o
      // sinal de que alguém achou o endereço do backoffice.
      await eventRepo.record({
        type: 'login_failed',
        email,
        ip: clientIp(c.req.raw.headers),
        userAgent: c.req.header('user-agent'),
        reason: 'backoffice: fora da lista',
      })
    }

    return renderLogin(c, { next, sentTo: email })
  })

  const panel = new Hono<PlatformEnv>()
  panel.use('*', platformAdminMiddleware(auth, adminRepo))

  async function props(options: { error?: string; editingId?: string } = {}) {
    const agora = new Date()
    const assinaturas = await subscriptionRepo.listAll()
    const suportes = await supportRepo.listActive(agora)
    const items = (await companyRepo.listAll()).map((company) => ({
      company,
      subscription: assinaturas.find((a) => a.companyId === company.id),
      support: suportes.find((s) => s.companyId === company.id),
    }))
    return {
      items,
      editing: items.find((row) => row.company.id === options.editingId),
      error: options.error,
      now: new Date(),
    }
  }

  const renderPanel = (c: Context<PlatformEnv>, view: CompaniesProps, status = 200) => {
    const html = c.req.header('HX-Request') ? (
      <Companies {...view} />
    ) : (
      <BackofficeLayout title="Salões" admin={c.get('admin')} active="companies">
        <Companies {...view} />
      </BackofficeLayout>
    )
    return c.html(html, status as 200)
  }

  panel.get('/', async (c) => renderPanel(c, await props({ editingId: c.req.query('editar') })))

  panel.post('/saloes', async (c) => {
    const result = await createCompany(db, readNewCompany(await c.req.parseBody()))
    if ('error' in result) return renderPanel(c, await props({ error: result.error }), 422)
    return renderPanel(c, await props())
  })

  /** Marcar pagamento é o gesto mais repetido daqui, então o modal fica aberto
   * em vez de fechar a cada salvamento. */
  panel.post('/saloes/:id/assinatura', async (c) => {
    const id = c.req.param('id')
    const company = await companyRepo.findById(id)
    if (!company) return c.notFound()

    const body = await c.req.parseBody()
    const plano = body.plano === 'anual' ? 'anual' : 'mensal'
    const priceCents = parsePrice(typeof body.valor === 'string' ? body.valor : undefined)
    if (priceCents === undefined) {
      return renderPanel(
        c,
        await props({ error: 'Valor inválido. Use algo como 149,00.', editingId: id }),
        422,
      )
    }

    const day = typeof body.pago_ate === 'string' ? body.pago_ate.trim() : ''
    if (day !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return renderPanel(
        c,
        await props({ error: 'Data de pagamento inválida.', editingId: id }),
        422,
      )
    }

    await subscriptionRepo.save(id, {
      plan: plano,
      priceCents,
      paidUntil: day === '' ? null : paidUntilInstant(day, company.timezone),
    })
    return renderPanel(c, await props({ editingId: id }))
  })

  panel.post('/saloes/:id/situacao', async (c) => {
    const id = c.req.param('id')
    if (!(await companyRepo.findById(id))) return c.notFound()

    const body = await c.req.parseBody()
    await companyRepo.setStatus(id, body.situacao === 'suspenso' ? 'suspended' : 'active')
    return renderPanel(c, await props({ editingId: id }))
  })

  /**
   * Abrir suporte é entrar nos dados de um cliente, então fica registrado no
   * log do próprio salão: o dono vê em `/equipe/acessos` quando e até quando.
   */
  panel.post('/saloes/:id/suporte', async (c) => {
    const id = c.req.param('id')
    const company = await companyRepo.findById(id)
    if (!company) return c.notFound()

    const admin = c.get('admin')
    const session = await supportRepo.open(id, admin.email)
    await eventRepo.record({
      companyId: id,
      type: 'support',
      email: admin.email,
      ip: clientIp(c.req.raw.headers),
      userAgent: c.req.header('user-agent'),
      reason: `acesso aberto até ${formatWhen(session.expiresAt, company.timezone)}`,
    })
    return renderPanel(c, await props({ editingId: id }))
  })

  panel.post('/suporte/:id/encerrar', async (c) => {
    const session = await supportRepo.findById(c.req.param('id'))
    if (!session) return c.notFound()

    await supportRepo.revoke(session.id)
    await eventRepo.record({
      companyId: session.companyId,
      type: 'support',
      email: session.adminEmail,
      ip: clientIp(c.req.raw.headers),
      userAgent: c.req.header('user-agent'),
      reason: 'acesso encerrado',
    })
    return renderPanel(c, await props({ editingId: session.companyId }))
  })

  panel.post('/saloes/:id', async (c) => {
    const id = c.req.param('id')
    if (!(await companyRepo.findById(id))) return c.notFound()

    const result = await updateCompany(db, id, readIdentity(await c.req.parseBody()))
    if ('error' in result) {
      // O modal continua aberto com o aviso em vez de sumir com o que foi digitado.
      return renderPanel(c, await props({ error: result.error, editingId: id }), 422)
    }
    return renderPanel(c, await props())
  })

  panel.post('/sair', async (c) => {
    await eventRepo.record({
      type: 'logout',
      email: c.get('admin').email,
      ip: clientIp(c.req.raw.headers),
      userAgent: c.req.header('user-agent'),
      reason: 'backoffice',
    })
    await auth.api.signOut({ headers: c.req.raw.headers, asResponse: false })
    c.header('HX-Redirect', '/entrar')
    return c.redirect('/entrar', 303)
  })

  app.route('/', panel)

  return app
}
