import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type Provider, providerServices, providers, type Service, services } from '../db/schema.ts'

export type ServiceInput = {
  name: string
  durationMinutes: number
  priceCents: number | null
}

export interface ServiceRepo {
  listActive(companyId: string): Promise<Service[]>
  listAll(companyId: string): Promise<Service[]>
  findById(companyId: string, id: string): Promise<Service | undefined>
  providersFor(companyId: string, serviceId: string): Promise<Provider[]>
  providerIdsFor(serviceId: string): Promise<string[]>
  create(companyId: string, input: ServiceInput): Promise<Service>
  update(companyId: string, id: string, input: ServiceInput): Promise<Service | undefined>
  setActive(companyId: string, id: string, active: boolean): Promise<Service | undefined>
  setProviders(companyId: string, serviceId: string, providerIds: string[]): Promise<void>
}

export function createServiceRepo(db: Db): ServiceRepo {
  const byCompany = (companyId: string, id: string) =>
    and(eq(services.companyId, companyId), eq(services.id, id))

  return {
    async listActive(companyId) {
      return db
        .select()
        .from(services)
        .where(and(eq(services.companyId, companyId), eq(services.active, true)))
        .orderBy(asc(services.name))
    },

    async listAll(companyId) {
      return db
        .select()
        .from(services)
        .where(eq(services.companyId, companyId))
        .orderBy(asc(services.name))
    },

    async findById(companyId, id) {
      return db.query.services.findFirst({ where: byCompany(companyId, id) })
    },

    /** Um serviço pode ser executado por um só profissional; a tela de horários
     * precisa saber disso antes de oferecer qualquer coisa. */
    async providersFor(companyId, serviceId) {
      const rows = await db
        .select({ provider: providers })
        .from(providerServices)
        .innerJoin(providers, eq(providerServices.providerId, providers.id))
        .where(
          and(
            eq(providerServices.serviceId, serviceId),
            eq(providers.companyId, companyId),
            eq(providers.active, true),
          ),
        )
        .orderBy(asc(providers.name))
      return rows.map((r) => r.provider)
    },

    async providerIdsFor(serviceId) {
      const rows = await db
        .select({ id: providerServices.providerId })
        .from(providerServices)
        .where(eq(providerServices.serviceId, serviceId))
      return rows.map((r) => r.id)
    },

    async create(companyId, input) {
      const [row] = await db
        .insert(services)
        .values({ companyId, ...input })
        .returning()
      if (!row) throw new Error('não foi possível criar o serviço')
      return row
    },

    async update(companyId, id, input) {
      const [row] = await db.update(services).set(input).where(byCompany(companyId, id)).returning()
      return row
    },

    /** Desativar só tira o serviço do catálogo: agendamento já marcado continua
     * de pé, porque apagar histórico resolveria menos do que confundiria. */
    async setActive(companyId, id, active) {
      const [row] = await db
        .update(services)
        .set({ active })
        .where(byCompany(companyId, id))
        .returning()
      return row
    },

    async setProviders(companyId, serviceId, providerIds) {
      await db.delete(providerServices).where(eq(providerServices.serviceId, serviceId))
      if (providerIds.length === 0) return

      const allowed = await db
        .select({ id: providers.id })
        .from(providers)
        .where(and(eq(providers.companyId, companyId), inArray(providers.id, providerIds)))
      if (allowed.length === 0) return

      await db
        .insert(providerServices)
        .values(allowed.map((p) => ({ providerId: p.id, serviceId })))
    },
  }
}
