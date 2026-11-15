import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type AuthEvent, authEvents } from '../db/schema.ts'
import { maskEmail, truncateIp } from '../domain/privacy.ts'

export type AuthEventInput = {
  companyId?: string
  type: AuthEvent['type']
  email?: string | null
  ip?: string
  userAgent?: string | null
  reason?: string
}

export interface AuthEventRepo {
  record(input: AuthEventInput): Promise<void>
  listRecent(companyId: string, limit?: number): Promise<AuthEvent[]>
}

export function createAuthEventRepo(db: Db): AuthEventRepo {
  return {
    /** O mascaramento acontece aqui, não em quem chama: assim nenhum caminho
     * consegue gravar e-mail ou IP inteiro por esquecimento. */
    async record(input) {
      await db.insert(authEvents).values({
        companyId: input.companyId,
        type: input.type,
        emailMasked: maskEmail(input.email),
        ip: truncateIp(input.ip),
        userAgent: input.userAgent?.slice(0, 200) ?? null,
        reason: input.reason,
      })
    },

    async listRecent(companyId, limit = 50) {
      return db
        .select()
        .from(authEvents)
        .where(and(eq(authEvents.companyId, companyId)))
        .orderBy(desc(authEvents.createdAt))
        .limit(limit)
    },
  }
}
