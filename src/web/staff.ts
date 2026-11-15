import type { Context, MiddlewareHandler } from 'hono'
import type { Auth } from '../auth/config.ts'
import type { Provider } from '../db/schema.ts'
import type { ProviderRepo } from '../repos/providers.ts'
import type { TenantEnv } from './tenant.ts'

export type StaffEnv = TenantEnv & {
  Variables: TenantEnv['Variables'] & { staff: Provider }
}

/** Quem não está identificado vai para a porta da equipe; o HTMX precisa do
 * cabeçalho porque um 303 dentro de um fragmento não troca a página. */
function redirectToLogin(c: Context<StaffEnv>) {
  const target = `/equipe/entrar?next=${encodeURIComponent(new URL(c.req.url).pathname)}`
  if (c.req.header('HX-Request')) {
    c.header('HX-Redirect', target)
    return c.body(null, 204)
  }
  return c.redirect(target, 303)
}

/**
 * A sessão é da biblioteca e vale para a pessoa; quem define o que ela pode
 * fazer é o cadastro da equipe naquele salão. Um e-mail com sessão válida que
 * não esteja na equipe deste domínio não entra.
 */
export async function staffOf(
  auth: Auth,
  repo: ProviderRepo,
  c: Context<StaffEnv>,
): Promise<Provider | undefined> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  const email = session?.user.email
  if (!email) return undefined

  const staff = await repo.findByEmail(c.get('company').id, email)
  return staff?.active ? staff : undefined
}

export function staffMiddleware(auth: Auth, repo: ProviderRepo): MiddlewareHandler<StaffEnv> {
  return async (c, next) => {
    const staff = await staffOf(auth, repo, c)
    if (!staff) return redirectToLogin(c)
    c.set('staff', staff)
    await next()
  }
}

/** Catálogo, carteira e cadastro da equipe são do salão, não de quem atende. */
export function requireOwner(): MiddlewareHandler<StaffEnv> {
  return async (c, next) => {
    if (c.get('staff').role !== 'owner') {
      return c.text('Só o dono do salão acessa esta área.', 403)
    }
    await next()
  }
}

/** O prestador mexe na própria agenda; o dono mexe na de qualquer um. */
export function canManage(staff: Provider, providerId: string): boolean {
  return staff.role === 'owner' || staff.id === providerId
}
