import { Hono } from 'hono'
import { type Auth, createAuth } from '../auth/config.ts'
import type { Db } from '../db/client.ts'
import { clientIp } from '../domain/privacy.ts'
import { expirePending } from '../jobs/expire.ts'
import { createLogNotifier } from '../notify/log-notifier.ts'
import type { Notifier } from '../notify/notifier.ts'
import { createAuthEventRepo } from '../repos/auth-events.ts'
import { createCompanyRepo } from '../repos/companies.ts'
import { createProviderRepo } from '../repos/providers.ts'
import { backofficeApp } from './backoffice/app.tsx'
import { isBackofficeHost } from './backoffice/host.ts'
import { agendaRoutes } from './routes/agenda.tsx'
import { clientesRoutes } from './routes/clientes.tsx'
import { entrarRoutes } from './routes/entrar.tsx'
import { equipeRoutes } from './routes/equipe.tsx'
import { horariosRoutes } from './routes/horarios.tsx'
import { pendentesRoutes } from './routes/pendentes.tsx'
import { reservaRoutes } from './routes/reserva.tsx'
import { servicosRoutes } from './routes/servicos.tsx'
import { staffOf } from './staff.ts'
import { requireArea, type TenantEnv, tenantMiddleware } from './tenant.ts'
import { Icon } from './views/icon.tsx'
import { Indisponivel } from './views/indisponivel.tsx'
import { Layout } from './views/layout.tsx'

const ASSETS: Record<string, { path: string; type: string }> = {
  'app.css': { path: 'public/app.css', type: 'text/css; charset=utf-8' },
  'icons.svg': { path: 'public/icons.svg', type: 'image/svg+xml' },
  'htmx.js': {
    path: 'node_modules/htmx.org/dist/htmx.min.js',
    type: 'text/javascript; charset=utf-8',
  },
}

export function createApp(db: Db, notifier: Notifier = createLogNotifier(), auth?: Auth) {
  const deps = { db, notifier, auth: auth ?? createAuth(db, notifier) }
  const app = new Hono<TenantEnv>()

  app.get('/health', (c) => c.json({ ok: true }))

  app.get('/assets/:file', (c) => {
    const asset = ASSETS[c.req.param('file')]
    if (!asset) return c.notFound()
    return new Response(Bun.file(asset.path), { headers: { 'content-type': asset.type } })
  })

  /**
   * O backoffice responde num host próprio e sai do caminho aqui: ele não tem
   * salão, então nada do app do salão pode rodar antes dele. Host desconhecido
   * continua morrendo no `tenantMiddleware`.
   */
  const backoffice = backofficeApp(deps)
  app.use('*', async (c, next) => {
    if (!isBackofficeHost(c.req.header('host') ?? '')) return next()
    return backoffice.fetch(c.req.raw)
  })

  app.use('*', tenantMiddleware(createCompanyRepo(db)))

  /** Pedido vencido some antes de qualquer tela ser montada, então o horário
   * volta a ser oferecido mesmo sem ninguém rodar o comando. */
  app.use('*', async (c, next) => {
    await expirePending(db, notifier, new Date(), c.get('company').id)
    await next()
  })

  /**
   * O endereço do cliente convida a agendar. O da equipe não anuncia nada: sem
   * sessão, a página inicial é a própria tela de entrar.
   */
  app.get('/', async (c) => {
    const company = c.get('company')
    if (c.get('area') === 'staff') {
      const staff = await staffOf(deps.auth, createProviderRepo(db), c as never)
      return c.redirect(staff ? '/equipe' : '/equipe/entrar', 303)
    }
    // Suspenso: a porta do cliente explica em vez de oferecer um agendamento
    // que a próxima tela recusaria.
    if (company.status === 'suspended') {
      return c.html(
        <Layout title="Início" company={company}>
          <Indisponivel />
        </Layout>,
      )
    }

    return c.html(
      <Layout title="Início" company={company}>
        <h2>Bem-vindo</h2>
        <ul class="people">
          <li>
            <a class="item" href="/reserva">
              <Icon name="event_available" class="avatar" />
              <span class="text">
                <span>Agendar um horário</span>
                <small>escolha serviço, profissional e dia</small>
              </span>
              <Icon name="chevron_right" />
            </a>
          </li>
        </ul>
      </Layout>,
    )
  })

  /** As rotas da biblioteca de autenticação só existem no endereço da equipe. */
  const authRoutes = new Hono<TenantEnv>()
  authRoutes.use('*', requireArea('staff'))
  authRoutes.on(['GET', 'POST'], '/*', async (c) => {
    const res = await deps.auth.handler(c.req.raw)

    // Link que não virou sessão é tentativa recusada: o token não diz de quem é,
    // então fica o que dá para saber — quando, de onde e por qual caminho.
    if (c.req.path.includes('/magic-link/verify') && res.headers.getSetCookie().length === 0) {
      await createAuthEventRepo(db).record({
        companyId: c.get('company').id,
        type: 'login_failed',
        ip: clientIp(c.req.raw.headers),
        userAgent: c.req.header('user-agent'),
        reason: 'link inválido ou vencido',
      })
    }
    return res
  })
  app.route('/api/auth', authRoutes)

  app.route('/agenda', agendaRoutes(deps))
  app.route('/horarios', horariosRoutes(deps))
  app.route('/pendentes', pendentesRoutes(deps))
  app.route('/servicos', servicosRoutes(deps))
  app.route('/equipe', equipeRoutes(deps))
  app.route('/clientes', clientesRoutes(deps))
  app.route('/entrar', entrarRoutes(db, notifier))
  app.route('/reserva', reservaRoutes(db, notifier))

  return app
}
