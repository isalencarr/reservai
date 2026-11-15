import type { Context, MiddlewareHandler } from 'hono'
import type { Provider } from '../db/schema.ts'
import type { ProviderRepo } from '../repos/providers.ts'
import { readStaffId } from './auth.ts'
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

export function staffMiddleware(repo: ProviderRepo): MiddlewareHandler<StaffEnv> {
  return async (c, next) => {
    const company = c.get('company')
    const staffId = await readStaffId(c, company.id)
    const staff = staffId ? await repo.findById(company.id, staffId) : undefined
    if (!staff?.active) return redirectToLogin(c)
    c.set('staff', staff)
    await next()
  }
}

/** Catálogo e carteira são do salão, não de quem atende. */
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
