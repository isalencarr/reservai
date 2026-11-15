import { and, asc, eq, like, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { appointments, type Customer, customers } from '../db/schema.ts'

/** Linha da carteira: quem é, quantas vezes veio e quando foi a última. */
export type CustomerRow = Customer & { visits: number; lastVisit: Date | null }

export interface CustomerRepo {
  list(companyId: string, query?: string): Promise<CustomerRow[]>
  findByPhone(companyId: string, phone: string): Promise<Customer | undefined>
  findById(companyId: string, id: string): Promise<Customer | undefined>
  /** Cria o cliente na carteira do salão ou atualiza o nome de quem já existe. */
  upsert(companyId: string, phone: string, name: string): Promise<Customer>
}

export function createCustomerRepo(db: Db): CustomerRepo {
  return {
    async list(companyId, query) {
      const term = (query ?? '').trim()
      const digits = term.replace(/\D/g, '')
      const search = term
        ? or(
            like(customers.name, `%${term}%`),
            digits ? like(customers.phone, `%${digits}%`) : undefined,
          )
        : undefined

      const rows = await db
        .select({
          id: customers.id,
          companyId: customers.companyId,
          name: customers.name,
          phone: customers.phone,
          createdAt: customers.createdAt,
          visits: sql<number>`count(${appointments.id})`,
          lastVisit: sql<number | null>`max(${appointments.startsAt})`,
        })
        .from(customers)
        .leftJoin(
          appointments,
          and(
            eq(appointments.customerId, customers.id),
            sql`${appointments.status} in ('confirmed', 'pending')`,
          ),
        )
        .where(and(eq(customers.companyId, companyId), search))
        .groupBy(customers.id)
        .orderBy(asc(customers.name))

      return rows.map((r) => ({
        ...r,
        visits: Number(r.visits),
        lastVisit: r.lastVisit === null ? null : new Date(Number(r.lastVisit)),
      }))
    },

    async findByPhone(companyId, phone) {
      return db.query.customers.findFirst({
        where: and(eq(customers.companyId, companyId), eq(customers.phone, phone)),
      })
    },

    async findById(companyId, id) {
      return db.query.customers.findFirst({
        where: and(eq(customers.companyId, companyId), eq(customers.id, id)),
      })
    },

    async upsert(companyId, phone, name) {
      const [row] = await db
        .insert(customers)
        .values({ companyId, phone, name })
        .onConflictDoUpdate({ target: [customers.companyId, customers.phone], set: { name } })
        .returning()
      if (!row) throw new Error('não foi possível salvar o cliente')
      return row
    },
  }
}
