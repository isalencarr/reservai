import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type SupportSession, supportSessions } from '../db/schema.ts'

/** Poucas horas: o suficiente para olhar um problema, pouco para esquecer
 * aberto. O prazo é o que faz o acesso se fechar sem ninguém lembrar. */
export const SUPPORT_TTL_MS = 2 * 60 * 60 * 1000

export interface SupportSessionRepo {
  open(companyId: string, adminEmail: string, now?: Date): Promise<SupportSession>
  findById(id: string): Promise<SupportSession | undefined>
  activeFor(companyId: string, adminEmail: string, now: Date): Promise<SupportSession | undefined>
  listActive(now: Date): Promise<SupportSession[]>
  revoke(id: string, now?: Date): Promise<void>
}

export function createSupportSessionRepo(db: Db): SupportSessionRepo {
  return {
    async open(companyId, adminEmail, now = new Date()) {
      const [row] = await db
        .insert(supportSessions)
        .values({
          companyId,
          adminEmail,
          expiresAt: new Date(now.getTime() + SUPPORT_TTL_MS),
          createdAt: now,
        })
        .returning()
      if (!row) throw new Error('não foi possível abrir o acesso de suporte')
      return row
    },

    async findById(id) {
      return db.query.supportSessions.findFirst({ where: eq(supportSessions.id, id) })
    },

    /** Vencida ou encerrada não vale: é o prazo que autoriza, não o cadastro. */
    async activeFor(companyId, adminEmail, now) {
      return db.query.supportSessions.findFirst({
        where: and(
          eq(supportSessions.companyId, companyId),
          eq(supportSessions.adminEmail, adminEmail),
          isNull(supportSessions.revokedAt),
          gt(supportSessions.expiresAt, now),
        ),
        orderBy: desc(supportSessions.expiresAt),
      })
    },

    async listActive(now) {
      return db
        .select()
        .from(supportSessions)
        .where(and(isNull(supportSessions.revokedAt), gt(supportSessions.expiresAt, now)))
        .orderBy(desc(supportSessions.expiresAt))
    },

    async revoke(id, now = new Date()) {
      await db.update(supportSessions).set({ revokedAt: now }).where(eq(supportSessions.id, id))
    },
  }
}
