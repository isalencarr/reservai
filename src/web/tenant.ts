import type { Context, MiddlewareHandler } from 'hono'
import type { Company } from '../db/schema.ts'
import type { CompanyRepo } from '../repos/companies.ts'

/** A área da equipe vive num host próprio: quem chega pelo endereço divulgado
 * ao cliente não alcança a agenda, o catálogo nem a carteira. */
export const STAFF_PREFIX = 'equipe.'

export type Area = 'customer' | 'staff'

export type TenantEnv = { Variables: { company: Company; area: Area } }

/** Remove a porta e o ponto final do host. */
export function normalizeHost(rawHost: string): string {
  return rawHost.trim().toLowerCase().replace(/\.$/, '').split(':')[0] ?? ''
}

/** Primeiro rótulo do host, usado como atalho em desenvolvimento
 * (`salao-a.localhost` cai na empresa de slug `salao-a`). */
export function subdomainOf(host: string): string | undefined {
  const labels = host.split('.')
  if (labels.length < 2) return undefined
  const first = labels[0]
  return first && first !== 'www' ? first : undefined
}

export function areaOf(host: string): Area {
  return host.startsWith(STAFF_PREFIX) ? 'staff' : 'customer'
}

export async function resolveTenant(
  repo: CompanyRepo,
  rawHost: string,
): Promise<{ company: Company; area: Area } | undefined> {
  const host = normalizeHost(rawHost)
  if (!host) return undefined

  const area = areaOf(host)
  const lookup = area === 'staff' ? host.slice(STAFF_PREFIX.length) : host
  if (!lookup) return undefined

  const byHost = await repo.findByHost(lookup)
  if (byHost) return { company: byHost, area }

  const sub = subdomainOf(lookup)
  const bySlug = sub ? await repo.findBySlug(sub) : undefined
  return bySlug ? { company: bySlug, area } : undefined
}

/** Toda rota do app vive dentro de uma empresa: sem salão resolvido pelo
 * domínio, a requisição morre aqui em vez de cada rota ter de lembrar disso. */
export function tenantMiddleware(repo: CompanyRepo): MiddlewareHandler<TenantEnv> {
  return async (c: Context<TenantEnv>, next) => {
    const resolved = await resolveTenant(repo, c.req.header('host') ?? '')
    if (!resolved) return c.text('Negócio não encontrado para este endereço.', 404)
    c.set('company', resolved.company)
    c.set('area', resolved.area)
    await next()
  }
}

/** Rota de equipe no endereço do cliente (ou o contrário) responde como rota
 * inexistente: o endereço não deve nem revelar que a outra área existe. */
export function requireArea(area: Area): MiddlewareHandler<TenantEnv> {
  return async (c, next) => {
    if (c.get('area') !== area) return c.notFound()
    await next()
  }
}
