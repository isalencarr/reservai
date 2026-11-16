import type { Context, MiddlewareHandler } from 'hono'
import type { Auth } from '../../auth/config.ts'
import type { PlatformAdmin } from '../../db/schema.ts'
import type { PlatformAdminRepo } from '../../repos/platform-admins.ts'

export type PlatformEnv = { Variables: { admin: PlatformAdmin } }

/**
 * A sessão é a mesma biblioteca que a equipe usa, mas quem decide o acesso aqui
 * é a lista `platform_admins`: sessão válida de dono de salão não abre o
 * backoffice, e o contrário também não.
 */
export async function adminOf(
  auth: Auth,
  repo: PlatformAdminRepo,
  c: Context<PlatformEnv>,
): Promise<PlatformAdmin | undefined> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  const email = session?.user.email
  return email ? repo.findByEmail(email) : undefined
}

export function platformAdminMiddleware(
  auth: Auth,
  repo: PlatformAdminRepo,
): MiddlewareHandler<PlatformEnv> {
  return async (c, next) => {
    const admin = await adminOf(auth, repo, c)
    if (!admin) {
      const target = `/entrar?next=${encodeURIComponent(new URL(c.req.url).pathname)}`
      if (c.req.header('HX-Request')) {
        c.header('HX-Redirect', target)
        return c.body(null, 204)
      }
      return c.redirect(target, 303)
    }
    c.set('admin', admin)
    await next()
  }
}
