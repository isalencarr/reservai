import { asc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type PlatformAdmin, platformAdmins } from '../db/schema.ts'
import { normalizeEmail } from '../domain/email.ts'

export interface PlatformAdminRepo {
  findByEmail(email: string): Promise<PlatformAdmin | undefined>
  listAll(): Promise<PlatformAdmin[]>
  ensure(email: string, name: string): Promise<PlatformAdmin | undefined>
}

export function createPlatformAdminRepo(db: Db): PlatformAdminRepo {
  return {
    /** O e-mail chega da sessão, então a busca ignora caixa e espaços. */
    async findByEmail(email) {
      const normalized = normalizeEmail(email)
      if (!normalized) return undefined
      return db.query.platformAdmins.findFirst({
        where: eq(platformAdmins.email, normalized),
      })
    },

    async listAll() {
      return db.select().from(platformAdmins).orderBy(asc(platformAdmins.email))
    },

    /**
     * Idempotente de propósito: roda a cada migração, então não pode falhar nem
     * sobrescrever o nome de quem já está na lista.
     */
    async ensure(email, name) {
      const normalized = normalizeEmail(email)
      if (!normalized) return undefined

      const existing = await db.query.platformAdmins.findFirst({
        where: eq(platformAdmins.email, normalized),
      })
      if (existing) return existing

      const [row] = await db
        .insert(platformAdmins)
        .values({ email: normalized, name: name.trim() || normalized })
        .returning()
      return row
    },
  }
}
