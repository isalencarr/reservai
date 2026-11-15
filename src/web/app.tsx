import { Hono } from 'hono'
import type { Db } from '../db/client.ts'
import { expirePending } from '../jobs/expire.ts'
import { createLogNotifier } from '../notify/log-notifier.ts'
import type { Notifier } from '../notify/notifier.ts'
import { createCompanyRepo } from '../repos/companies.ts'
import { agendaRoutes } from './routes/agenda.tsx'
import { clientesRoutes } from './routes/clientes.tsx'
import { entrarRoutes } from './routes/entrar.tsx'
import { equipeRoutes } from './routes/equipe.tsx'
import { horariosRoutes } from './routes/horarios.tsx'
import { pendentesRoutes } from './routes/pendentes.tsx'
import { reservaRoutes } from './routes/reserva.tsx'
import { servicosRoutes } from './routes/servicos.tsx'
import { type TenantEnv, tenantMiddleware } from './tenant.ts'
import { Layout } from './views/layout.tsx'

const ASSETS: Record<string, { path: string; type: string }> = {
  'app.css': { path: 'public/app.css', type: 'text/css; charset=utf-8' },
  'htmx.js': {
    path: 'node_modules/htmx.org/dist/htmx.min.js',
    type: 'text/javascript; charset=utf-8',
  },
}

export function createApp(db: Db, notifier: Notifier = createLogNotifier()) {
  const app = new Hono<TenantEnv>()

  app.get('/health', (c) => c.json({ ok: true }))

  app.get('/assets/:file', (c) => {
    const asset = ASSETS[c.req.param('file')]
    if (!asset) return c.notFound()
    return new Response(Bun.file(asset.path), { headers: { 'content-type': asset.type } })
  })

  app.use('*', tenantMiddleware(createCompanyRepo(db)))

  /** Pedido vencido some antes de qualquer tela ser montada, então o horário
   * volta a ser oferecido mesmo sem ninguém rodar o comando. */
  app.use('*', async (c, next) => {
    await expirePending(db, notifier, new Date(), c.get('company').id)
    await next()
  })

  /** Cada endereço tem a sua porta: o do salão atende cliente, o `equipe.` atende
   * quem trabalha lá. */
  app.get('/', (c) => {
    const company = c.get('company')
    const equipe = c.get('area') === 'staff'
    return c.html(
      <Layout title="Início" companyName={company.name}>
        <h2>{equipe ? 'Área da equipe' : 'Bem-vindo'}</h2>
        <ul class="people">
          <li>
            <a href={equipe ? '/equipe' : '/reserva'}>
              <span>{equipe ? 'Abrir o painel' : 'Agendar um horário'}</span>
              <small>
                {equipe
                  ? 'agenda, pedidos, catálogo e carteira'
                  : 'escolha serviço, profissional e dia'}
              </small>
            </a>
          </li>
        </ul>
      </Layout>,
    )
  })

  app.route('/agenda', agendaRoutes(db, notifier))
  app.route('/horarios', horariosRoutes(db))
  app.route('/pendentes', pendentesRoutes(db, notifier))
  app.route('/servicos', servicosRoutes(db))
  app.route('/equipe', equipeRoutes(db, notifier))
  app.route('/clientes', clientesRoutes(db))
  app.route('/entrar', entrarRoutes(db, notifier))
  app.route('/reserva', reservaRoutes(db, notifier))

  return app
}
