import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import type { Db } from '../db/client.ts'
import * as schema from '../db/schema.ts'
import type { Notifier } from '../notify/notifier.ts'
import { createAuthEventRepo } from '../repos/auth-events.ts'
import { createCompanyRepo } from '../repos/companies.ts'
import { createProviderRepo } from '../repos/providers.ts'
import { backofficeHost, isBackofficeHost } from '../web/backoffice/host.ts'
import { resolveTenant } from '../web/tenant.ts'

/** O link precisa ser curto de validade: ele é a senha de quem o recebe. */
export const MAGIC_LINK_TTL_SECONDS = 15 * 60
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

/** O valor local existe para o app subir sem configuração; em produção o
 * segredo vem do ambiente e nunca viaja junto com o deploy. */
export function authSecret(): string {
  return process.env.BETTER_AUTH_SECRET ?? 'reservai-desenvolvimento-apenas-nao-use-em-producao'
}

/**
 * Cada salão tem o seu endereço de equipe, então a biblioteca não pode ter um
 * endereço base fixo: ela monta a URL a partir do host da requisição, limitado
 * aos endereços de equipe.
 */
function allowedHosts(): string[] {
  // O host chega com a porta em desenvolvimento e a comparação da biblioteca é
  // literal, então o backoffice entra nas duas formas. `equipe.*` já engole a
  // porta pelo curinga.
  const back = backofficeHost()
  const padrao = `equipe.*,${back},${back}:*`
  return (process.env.AUTH_ALLOWED_HOSTS ?? padrao).split(',').map((h) => h.trim())
}

export type Auth = ReturnType<typeof createAuth>

export function createAuth(db: Db, notifier: Notifier) {
  const production = process.env.NODE_ENV === 'production'

  return betterAuth({
    appName: 'reservai',
    secret: authSecret(),
    basePath: '/api/auth',
    baseURL: {
      allowedHosts: allowedHosts(),
      protocol: production ? 'https' : 'http',
    },
    trustedOrigins: allowedHosts().map((host) => `${production ? 'https' : 'http'}://${host}`),
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    // Só magic link: senha é mais uma coisa para o salão perder.
    emailAndPassword: { enabled: false },
    session: { expiresIn: SESSION_TTL_SECONDS },
    databaseHooks: {
      session: {
        create: {
          /** Único lugar por onde toda entrada passa, venha de onde vier. */
          after: async (created, ctx) => {
            const host = ctx?.request?.headers.get('host') ?? ''
            const tenant = await resolveTenant(createCompanyRepo(db), host)
            const person = await db.query.user.findFirst({
              where: (u, { eq }) => eq(u.id, created.userId),
            })
            const staff =
              tenant && person
                ? await createProviderRepo(db).findByEmail(tenant.company.id, person.email)
                : undefined

            await createAuthEventRepo(db).record({
              companyId: tenant?.company.id,
              type: 'login',
              email: person?.email,
              ip: created.ipAddress ?? '',
              userAgent: created.userAgent,
              // Entrada sem salão é a da plataforma; fica dito para o registro
              // não parecer um login órfão.
              reason: isBackofficeHost(host) ? 'backoffice' : undefined,
            })

            // Primeiro acesso fecha o convite: a pessoa deixa de ser pendente.
            if (staff && !staff.joinedAt) {
              await createProviderRepo(db).markJoined(staff.id, new Date())
            }
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url }) => {
          await notifier.send({ kind: 'magic-link', to: email, url })
        },
      }),
    ],
  })
}
