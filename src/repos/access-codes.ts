import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type AccessCode, accessCodes } from '../db/schema.ts'

export type Audience = 'customer' | 'staff'

export interface AccessCodeRepo {
  issue(values: {
    companyId: string
    phone: string
    name: string
    audience: Audience
    codeHash: string
    expiresAt: Date
  }): Promise<AccessCode>
  findActive(
    companyId: string,
    phone: string,
    audience: Audience,
    now: Date,
  ): Promise<AccessCode | undefined>
  registerAttempt(id: string): Promise<void>
  clear(companyId: string, phone: string, audience: Audience): Promise<void>
}

export function createAccessCodeRepo(db: Db): AccessCodeRepo {
  return {
    /** Um código por telefone e porta: pedir outro invalida o anterior. */
    async issue(values) {
      await db
        .delete(accessCodes)
        .where(
          and(
            eq(accessCodes.companyId, values.companyId),
            eq(accessCodes.phone, values.phone),
            eq(accessCodes.audience, values.audience),
          ),
        )
      const [row] = await db.insert(accessCodes).values(values).returning()
      if (!row) throw new Error('não foi possível gerar o código')
      return row
    },

    async findActive(companyId, phone, audience, now) {
      return db.query.accessCodes.findFirst({
        where: and(
          eq(accessCodes.companyId, companyId),
          eq(accessCodes.phone, phone),
          eq(accessCodes.audience, audience),
          gt(accessCodes.expiresAt, now),
        ),
      })
    },

    async registerAttempt(id) {
      const current = await db.query.accessCodes.findFirst({ where: eq(accessCodes.id, id) })
      if (!current) return
      await db
        .update(accessCodes)
        .set({ attempts: current.attempts + 1 })
        .where(eq(accessCodes.id, id))
    },

    async clear(companyId, phone, audience) {
      await db
        .delete(accessCodes)
        .where(
          and(
            eq(accessCodes.companyId, companyId),
            eq(accessCodes.phone, phone),
            eq(accessCodes.audience, audience),
          ),
        )
    },
  }
}
