import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type Subscription, subscriptions } from '../db/schema.ts'

export type SubscriptionInput = {
  plan: Subscription['plan']
  priceCents: number | null
  paidUntil: Date | null
  note?: string | null
}

export interface SubscriptionRepo {
  find(companyId: string): Promise<Subscription | undefined>
  listAll(): Promise<Subscription[]>
  save(companyId: string, input: SubscriptionInput): Promise<Subscription>
}

export function createSubscriptionRepo(db: Db): SubscriptionRepo {
  return {
    async find(companyId) {
      return db.query.subscriptions.findFirst({
        where: eq(subscriptions.companyId, companyId),
      })
    },

    async listAll() {
      return db.select().from(subscriptions)
    },

    /** Uma assinatura por salão: salvar de novo substitui o que estava lá, e é
     * assim que o pagamento do mês entra. */
    async save(companyId, input) {
      const [row] = await db
        .insert(subscriptions)
        .values({ companyId, ...input, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: subscriptions.companyId,
          set: { ...input, updatedAt: new Date() },
        })
        .returning()
      if (!row) throw new Error('não foi possível salvar a assinatura')
      return row
    },
  }
}
