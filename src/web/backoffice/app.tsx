import { type Context, Hono } from 'hono'
import { normalizeEmail } from '../../domain/email.ts'
import { clientIp } from '../../domain/privacy.ts'
import { criarSalao, editarSalao, type Identidade, type NovoSalao } from '../../platform/saloes.ts'
import { createAuthEventRepo } from '../../repos/auth-events.ts'
import { createCompanyRepo } from '../../repos/companies.ts'
import { createPlatformAdminRepo } from '../../repos/platform-admins.ts'
import type { Deps } from '../deps.ts'
import { type PlatformEnv, platformAdminMiddleware } from './admin.ts'
import { EntrarBackoffice, type EntrarProps } from './views/entrar.tsx'
import { BackofficeLayout } from './views/layout.tsx'
import { Saloes, type SaloesProps } from './views/saloes.tsx'

function safeNext(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '')

/** Identidade do salão: os mesmos campos no formulário de criar e no de editar. */
function lerIdentidade(body: Record<string, unknown>): Identidade {
  return {
    nome: texto(body.nome),
    host: texto(body.host),
    slug: texto(body.slug),
    fuso: texto(body.fuso),
  }
}

function lerNovoSalao(body: Record<string, unknown>): NovoSalao {
  return {
    ...lerIdentidade(body),
    dono: texto(body.dono),
    email: texto(body.email),
    telefone: texto(body.telefone),
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

  const render = (c: Context<PlatformEnv>, props: EntrarProps, status = 200) =>
    c.html(
      c.req.header('HX-Request') ? (
        <EntrarBackoffice {...props} />
      ) : (
        <BackofficeLayout title="Entrar">
          <EntrarBackoffice {...props} />
        </BackofficeLayout>
      ),
      status as 200,
    )

  app.get('/entrar', (c) => render(c, { next: safeNext(c.req.query('next')) }))

  /** O link só sai para e-mail que já está em `platform_admins`: a lista é
   * criada na migração, então não existe cadastro aberto nesta porta. */
  app.post('/entrar', async (c) => {
    const body = await c.req.parseBody()
    const next = safeNext(body.next)
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : undefined)
    if (!email) return render(c, { next, error: 'E-mail inválido.' }, 422)

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

    return render(c, { next, sentTo: email })
  })

  const painel = new Hono<PlatformEnv>()
  painel.use('*', platformAdminMiddleware(auth, adminRepo))

  async function props(options: { error?: string; editingId?: string } = {}) {
    const items = await companyRepo.listAll()
    return {
      items,
      editing: items.find((company) => company.id === options.editingId),
      error: options.error,
    }
  }

  const mostrar = (c: Context<PlatformEnv>, view: SaloesProps, status = 200) => {
    const html = c.req.header('HX-Request') ? (
      <Saloes {...view} />
    ) : (
      <BackofficeLayout title="Salões" admin={c.get('admin')} active="saloes">
        <Saloes {...view} />
      </BackofficeLayout>
    )
    return c.html(html, status as 200)
  }

  painel.get('/', async (c) => mostrar(c, await props({ editingId: c.req.query('editar') })))

  painel.post('/saloes', async (c) => {
    const feito = await criarSalao(db, lerNovoSalao(await c.req.parseBody()))
    if ('erro' in feito) return mostrar(c, await props({ error: feito.erro }), 422)
    return mostrar(c, await props())
  })

  painel.post('/saloes/:id', async (c) => {
    const id = c.req.param('id')
    if (!(await companyRepo.findById(id))) return c.notFound()

    const feito = await editarSalao(db, id, lerIdentidade(await c.req.parseBody()))
    if ('erro' in feito) {
      // O modal continua aberto com o aviso em vez de sumir com o que foi digitado.
      return mostrar(c, await props({ error: feito.erro, editingId: id }), 422)
    }
    return mostrar(c, await props())
  })

  painel.post('/sair', async (c) => {
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

  app.route('/', painel)

  return app
}
