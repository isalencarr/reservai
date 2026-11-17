import { and, asc, eq, gt, lt, lte, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import {
  type Appointment,
  appointments,
  companies,
  customers,
  type NewAppointment,
  providers,
  services,
} from '../db/schema.ts'

/** O que o prestador pode ver de um compromisso: nome e horário, nunca o
 * contato do cliente, que é da carteira da empresa. */
export type DayEntry = {
  id: string
  startsAt: Date
  endsAt: Date
  status: Appointment['status']
  origin: Appointment['origin']
  note: string | null
  customerName: string | null
  serviceName: string | null
}

/** Estados que seguram o horário. Recusado, cancelado e expirado liberam a agenda. */
export const BLOCKING_STATUS = ['pending', 'confirmed'] as const

/** Agendamento como o cliente vê: ele enxerga o profissional e o serviço. */
export type CustomerEntry = {
  id: string
  startsAt: Date
  endsAt: Date
  status: Appointment['status']
  serviceName: string | null
  providerName: string
}

/** Pedido esperando resposta, como o prestador vê na fila. */
export type PendingEntry = DayEntry & { deadline: Date | null }

/**
 * Dados para montar a mensagem de quem precisa ser avisado. Inclui o telefone,
 * que nunca vai para a tela do prestador: quem envia é o servidor.
 */
export type NotifyTarget = {
  id: string
  customerName: string | null
  customerPhone: string | null
  providerName: string
  serviceName: string | null
  startsAt: Date
  timeZone: string
}

export interface AppointmentRepo {
  listDay(providerId: string, start: Date, end: Date): Promise<DayEntry[]>
  listPending(companyId: string, providerId: string): Promise<PendingEntry[]>
  listByCustomer(companyId: string, customerId: string): Promise<CustomerEntry[]>
  countPendingByProvider(companyId: string): Promise<Record<string, number>>
  expireOverdue(now: Date, companyId?: string): Promise<NotifyTarget[]>
  setStatus(
    companyId: string,
    id: string,
    status: Appointment['status'],
  ): Promise<NotifyTarget | undefined>
  cancelRange(
    companyId: string,
    providerId: string,
    start: Date,
    end: Date,
  ): Promise<NotifyTarget[]>
  findById(companyId: string, id: string): Promise<Appointment | undefined>
  hasConflict(providerId: string, start: Date, end: Date, exceptId?: string): Promise<boolean>
  create(values: NewAppointment): Promise<Appointment>
  remove(companyId: string, id: string): Promise<boolean>
}

const blocking = sql`${appointments.status} in ('pending', 'confirmed')`

const notifyColumns = {
  id: appointments.id,
  customerName: customers.name,
  customerPhone: customers.phone,
  providerName: providers.name,
  serviceName: services.name,
  startsAt: appointments.startsAt,
  timeZone: companies.timezone,
}

export function createAppointmentRepo(db: Db): AppointmentRepo {
  return {
    async listDay(providerId, start, end) {
      return db
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
          origin: appointments.origin,
          note: appointments.note,
          customerName: customers.name,
          serviceName: services.name,
        })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(
          and(
            eq(appointments.providerId, providerId),
            lt(appointments.startsAt, end),
            gt(appointments.endsAt, start),
            blocking,
          ),
        )
        .orderBy(asc(appointments.startsAt))
    },

    async listPending(companyId, providerId) {
      return db
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
          origin: appointments.origin,
          note: appointments.note,
          customerName: customers.name,
          serviceName: services.name,
          deadline: appointments.confirmDeadlineAt,
        })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(
          and(
            eq(appointments.companyId, companyId),
            eq(appointments.providerId, providerId),
            eq(appointments.status, 'pending'),
          ),
        )
        .orderBy(asc(appointments.startsAt))
    },

    /** Varredura preguiçosa: roda ao abrir a fila e também pelo comando, para
     * o horário voltar a ser oferecido mesmo sem ninguém com a tela aberta. */
    async listByCustomer(companyId, customerId) {
      return db
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
          serviceName: services.name,
          providerName: providers.name,
        })
        .from(appointments)
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .innerJoin(providers, eq(appointments.providerId, providers.id))
        .where(and(eq(appointments.companyId, companyId), eq(appointments.customerId, customerId)))
        .orderBy(asc(appointments.startsAt))
    },

    /** Quantos pedidos esperam resposta em cada agenda, para o painel avisar
     * sem precisar abrir uma por uma. */
    async countPendingByProvider(companyId) {
      const rows = await db
        .select({ providerId: appointments.providerId, totalMinutes: sql<number>`count(*)` })
        .from(appointments)
        .where(and(eq(appointments.companyId, companyId), eq(appointments.status, 'pending')))
        .groupBy(appointments.providerId)

      return Object.fromEntries(rows.map((r) => [r.providerId, Number(r.totalMinutes)]))
    },

    async expireOverdue(now, companyId) {
      const overdue = await db
        .select(notifyColumns)
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .innerJoin(providers, eq(appointments.providerId, providers.id))
        .innerJoin(companies, eq(appointments.companyId, companies.id))
        .where(
          and(
            eq(appointments.status, 'pending'),
            lte(appointments.confirmDeadlineAt, now),
            companyId ? eq(appointments.companyId, companyId) : undefined,
          ),
        )

      if (overdue.length === 0) return []
      await db
        .update(appointments)
        .set({ status: 'expired' })
        .where(
          and(
            eq(appointments.status, 'pending'),
            lte(appointments.confirmDeadlineAt, now),
            companyId ? eq(appointments.companyId, companyId) : undefined,
          ),
        )
      return overdue
    },

    async setStatus(companyId, id, status) {
      const updated = await db
        .update(appointments)
        .set({ status })
        .where(and(eq(appointments.companyId, companyId), eq(appointments.id, id)))
        .returning({ id: appointments.id })
      if (updated.length === 0) return undefined

      const [target] = await db
        .select(notifyColumns)
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .innerJoin(providers, eq(appointments.providerId, providers.id))
        .innerJoin(companies, eq(appointments.companyId, companies.id))
        .where(eq(appointments.id, id))
      return target
    },

    async cancelRange(companyId, providerId, start, end) {
      const affected = await db
        .select(notifyColumns)
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .innerJoin(providers, eq(appointments.providerId, providers.id))
        .innerJoin(companies, eq(appointments.companyId, companies.id))
        .where(
          and(
            eq(appointments.companyId, companyId),
            eq(appointments.providerId, providerId),
            lt(appointments.startsAt, end),
            gt(appointments.endsAt, start),
            blocking,
          ),
        )

      await db
        .update(appointments)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(appointments.companyId, companyId),
            eq(appointments.providerId, providerId),
            lt(appointments.startsAt, end),
            gt(appointments.endsAt, start),
            blocking,
          ),
        )
      return affected
    },

    async findById(companyId, id) {
      return db.query.appointments.findFirst({
        where: and(eq(appointments.companyId, companyId), eq(appointments.id, id)),
      })
    },

    async hasConflict(providerId, start, end, exceptId) {
      const rows = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.providerId, providerId),
            lt(appointments.startsAt, end),
            gt(appointments.endsAt, start),
            blocking,
            exceptId ? ne(appointments.id, exceptId) : undefined,
          ),
        )
        .limit(1)
      return rows.length > 0
    },

    async create(values) {
      const [row] = await db.insert(appointments).values(values).returning()
      if (!row) throw new Error('não foi possível criar o agendamento')
      return row
    },

    async remove(companyId, id) {
      const removed = await db
        .delete(appointments)
        .where(and(eq(appointments.companyId, companyId), eq(appointments.id, id)))
        .returning({ id: appointments.id })
      return removed.length > 0
    },
  }
}
