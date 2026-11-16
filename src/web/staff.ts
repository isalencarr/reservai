import type { Context, MiddlewareHandler } from 'hono'
import type { Auth } from '../auth/config.ts'
import type { Db } from '../db/client.ts'
import type { Provider, SupportSession } from '../db/schema.ts'
import { type Pendencia, pendenciasDeSetup } from '../domain/setup.ts'
import { createPlatformAdminRepo } from '../repos/platform-admins.ts'
import { createProviderRepo } from '../repos/providers.ts'
import { createSetupRepo } from '../repos/setup.ts'
import { createSupportSessionRepo } from '../repos/support-sessions.ts'
import type { TenantEnv } from './tenant.ts'

export type StaffEnv = TenantEnv & {
  Variables: TenantEnv['Variables'] & {
    staff: Provider
    support: SupportSession | undefined
    pendencias: Pendencia[]
  }
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

export type StaffAccess = { staff: Provider; support?: SupportSession }

/**
 * Quem é esta pessoa dentro deste salão. Primeiro a equipe: a sessão é da
 * biblioteca e vale para a pessoa, mas quem define o que ela pode fazer é o
 * cadastro em `providers` deste domínio. Depois o suporte: quem administra a
 * plataforma, com uma janela aberta para este salão, entra vendo o que o dono
 * vê — e só vendo.
 */
export async function staffAccessOf(
  auth: Auth,
  db: Db,
  c: Context<StaffEnv>,
): Promise<StaffAccess | undefined> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  const email = session?.user.email
  if (!email) return undefined

  const companyId = c.get('company').id
  const providerRepo = createProviderRepo(db)

  const staff = await providerRepo.findByEmail(companyId, email)
  if (staff) return staff.active ? { staff } : undefined

  const admin = await createPlatformAdminRepo(db).findByEmail(email)
  if (!admin) return undefined

  const support = await createSupportSessionRepo(db).activeFor(companyId, admin.email, new Date())
  if (!support) return undefined

  // Sem dono ativo não há o que ver: o suporte não inventa uma identidade que
  // o salão não tem.
  const owner = await providerRepo.findOwner(companyId)
  return owner ? { staff: owner, support } : undefined
}

/** A única escrita que o suporte faz é sair. Trancar a porta de saída deixaria
 * a janela aberta até vencer sozinha. */
const SAIDA = '/equipe/sair'

/**
 * Quem administra a plataforma só recebe link na porta de um salão enquanto
 * tiver janela de suporte aberta para ele: a janela é a autorização, e sem ela
 * essa porta responde como se o e-mail fosse desconhecido.
 */
export async function supportEntryOf(
  db: Db,
  companyId: string,
  email: string,
  now = new Date(),
): Promise<{ name: string; session: SupportSession } | undefined> {
  const admin = await createPlatformAdminRepo(db).findByEmail(email)
  if (!admin) return undefined

  const session = await createSupportSessionRepo(db).activeFor(companyId, admin.email, now)
  return session ? { name: admin.name, session } : undefined
}

export function staffMiddleware(auth: Auth, db: Db): MiddlewareHandler<StaffEnv> {
  return async (c, next) => {
    const access = await staffAccessOf(auth, db, c)
    if (!access) return redirectToLogin(c)
    c.set('staff', access.staff)
    c.set('support', access.support)

    // Suporte é só leitura, e o bloqueio mora aqui: rota de escrita nova nasce
    // protegida, em vez de depender de alguém lembrar de proteger.
    if (access.support && c.req.method !== 'GET' && new URL(c.req.url).pathname !== SAIDA) {
      return c.text('O acesso de suporte é só de leitura.', 403)
    }

    // O aviso do que falta configurar aparece em toda tela interna, então é
    // calculado aqui e não em cada rota. Em escrita ninguém mostra aviso.
    const dados =
      c.req.method === 'GET' ? await createSetupRepo(db).dataFor(c.get('company').id) : undefined
    c.set('pendencias', dados ? pendenciasDeSetup(dados) : [])

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

/** Telas que o suporte não abre: carteira de clientes, cadastro da equipe e
 * registro de acessos são dados pessoais de quem não pediu suporte. */
export function denyOnSupport(): MiddlewareHandler<StaffEnv> {
  return async (c, next) => {
    if (c.get('support')) {
      return c.text('Dados pessoais não aparecem no acesso de suporte.', 403)
    }
    await next()
  }
}

/** O prestador mexe na própria agenda; o dono mexe na de qualquer um. */
export function canManage(staff: Provider, providerId: string): boolean {
  return staff.role === 'owner' || staff.id === providerId
}

/** Props comuns de toda tela interna, montadas do contexto: um aviso novo no
 * layout não precisa ser passado em nove rotas. */
export function layoutProps(c: Context<StaffEnv>) {
  return {
    company: c.get('company'),
    staff: c.get('staff'),
    support: c.get('support'),
    pendencias: c.get('pendencias'),
  }
}
