import { and, asc, eq, ne } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type Provider, providerHours, providers } from '../db/schema.ts'
import type { WorkHour } from '../domain/schedule.ts'
import { defaultWorkweek } from '../domain/workday.ts'

export type ProviderInput = {
  name: string
  phone: string
  role: Provider['role']
  slotMinutes: number
  minLeadMinutes: number
}

export interface ProviderRepo {
  listAll(companyId: string): Promise<Provider[]>
  create(companyId: string, input: ProviderInput): Promise<Provider>
  update(companyId: string, id: string, input: ProviderInput): Promise<Provider | undefined>
  setActive(companyId: string, id: string, active: boolean): Promise<Provider | undefined>
  countOtherOwners(companyId: string, exceptId: string): Promise<number>
  listByCompany(companyId: string): Promise<Provider[]>
  findById(companyId: string, id: string): Promise<Provider | undefined>
  findByPhone(companyId: string, phone: string): Promise<Provider | undefined>
  hoursFor(providerId: string): Promise<WorkHour[]>
}

export function createProviderRepo(db: Db): ProviderRepo {
  return {
    async listByCompany(companyId) {
      return db
        .select()
        .from(providers)
        .where(and(eq(providers.companyId, companyId), eq(providers.active, true)))
        .orderBy(asc(providers.name))
    },

    async findById(companyId, id) {
      return db.query.providers.findFirst({
        where: and(eq(providers.companyId, companyId), eq(providers.id, id)),
      })
    },

    async listAll(companyId) {
      return db
        .select()
        .from(providers)
        .where(eq(providers.companyId, companyId))
        .orderBy(asc(providers.name))
    },

    /** Quem entra na equipe já nasce com jornada: agenda vazia sem explicação é
     * o primeiro lugar onde alguém acha que o app está quebrado. */
    async create(companyId, input) {
      const [row] = await db
        .insert(providers)
        .values({ companyId, ...input })
        .returning()
      if (!row) throw new Error('não foi possível criar a pessoa')

      await db
        .insert(providerHours)
        .values(defaultWorkweek().map((range) => ({ providerId: row.id, ...range })))
      return row
    },

    async update(companyId, id, input) {
      const [row] = await db
        .update(providers)
        .set(input)
        .where(and(eq(providers.companyId, companyId), eq(providers.id, id)))
        .returning()
      return row
    },

    async setActive(companyId, id, active) {
      const [row] = await db
        .update(providers)
        .set({ active })
        .where(and(eq(providers.companyId, companyId), eq(providers.id, id)))
        .returning()
      return row
    },

    /** Usado para não deixar o salão ficar sem dono. */
    async countOtherOwners(companyId, exceptId) {
      const rows = await db
        .select({ id: providers.id })
        .from(providers)
        .where(
          and(
            eq(providers.companyId, companyId),
            eq(providers.role, 'owner'),
            eq(providers.active, true),
            ne(providers.id, exceptId),
          ),
        )
      return rows.length
    },

    async findByPhone(companyId, phone) {
      return db.query.providers.findFirst({
        where: and(eq(providers.companyId, companyId), eq(providers.phone, phone)),
      })
    },

    async hoursFor(providerId) {
      return db
        .select({
          weekday: providerHours.weekday,
          startMinute: providerHours.startMinute,
          endMinute: providerHours.endMinute,
        })
        .from(providerHours)
        .where(eq(providerHours.providerId, providerId))
        .orderBy(asc(providerHours.weekday), asc(providerHours.startMinute))
    },
  }
}
