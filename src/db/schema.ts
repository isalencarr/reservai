import { relations } from 'drizzle-orm'
// biome-ignore lint/suspicious/noDeprecatedImports: só a sobrecarga antiga de primaryKey(coluna) está obsoleta; usamos primaryKey({ columns })
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

/**
 * Instantes são gravados como epoch em milissegundos (UTC). SQLite não tem tipo
 * de data com fuso; guardar número evita conversão implícita e migra direto
 * para `timestamptz` quando trocarmos de banco. O fuso de exibição vem da empresa.
 */
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' })

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

export const companies = sqliteTable('companies', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  host: text('host').notNull().unique(),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
})

/**
 * Dono do salão é um prestador com `role = owner`: ele também atende, e um papel
 * separado exigiria duas tabelas de pessoa sem ganho real. `min_lead_minutes` é a
 * antecedência mínima para receber pedidos; sem ela o prazo de confirmação
 * nasceria vencido para quem pede em cima da hora.
 */
export const providers = sqliteTable(
  'providers',
  {
    id: id(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    role: text('role', { enum: ['owner', 'provider'] })
      .notNull()
      .default('provider'),
    slotMinutes: integer('slot_minutes').notNull().default(60),
    minLeadMinutes: integer('min_lead_minutes').notNull().default(60),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [unique('providers_company_phone').on(t.companyId, t.phone)],
)

/** Jornada semanal em minutos desde a meia-noite local. Uma linha por faixa
 * contínua, então almoço fixo é representado por duas linhas no mesmo dia. */
export const providerHours = sqliteTable(
  'provider_hours',
  {
    id: id(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
  },
  (t) => [index('provider_hours_provider_weekday').on(t.providerId, t.weekday)],
)

export const services = sqliteTable('services', {
  id: id(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  priceCents: integer('price_cents'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
})

export const providerServices = sqliteTable(
  'provider_services',
  {
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.serviceId] })],
)

/** Cliente pertence à carteira da empresa, não ao prestador: o mesmo telefone em
 * dois salões são dois cadastros, e o prestador só enxerga nome e horário. */
export const customers = sqliteTable(
  'customers',
  {
    id: id(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [unique('customers_company_phone').on(t.companyId, t.phone)],
)

export const APPOINTMENT_STATUS = [
  'pending',
  'confirmed',
  'declined',
  'cancelled',
  'expired',
] as const
export const APPOINTMENT_ORIGIN = ['app', 'external'] as const

/**
 * Bloqueio manual é um agendamento de origem `external` sem cliente: almoço,
 * imprevisto e horário vendido fora do app ocupam a agenda do mesmo jeito, e uma
 * tabela só mantém a checagem de conflito em um lugar.
 */
export const appointments = sqliteTable(
  'appointments',
  {
    id: id(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    serviceId: text('service_id').references(() => services.id, { onDelete: 'set null' }),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    status: text('status', { enum: APPOINTMENT_STATUS }).notNull().default('pending'),
    origin: text('origin', { enum: APPOINTMENT_ORIGIN }).notNull().default('app'),
    note: text('note'),
    confirmDeadlineAt: timestamp('confirm_deadline_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('appointments_provider_start').on(t.providerId, t.startsAt),
    index('appointments_company_start').on(t.companyId, t.startsAt),
  ],
)

export const companiesRelations = relations(companies, ({ many }) => ({
  providers: many(providers),
  services: many(services),
  customers: many(customers),
}))

export const providersRelations = relations(providers, ({ one, many }) => ({
  company: one(companies, { fields: [providers.companyId], references: [companies.id] }),
  hours: many(providerHours),
  appointments: many(appointments),
}))

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  provider: one(providers, { fields: [appointments.providerId], references: [providers.id] }),
  customer: one(customers, { fields: [appointments.customerId], references: [customers.id] }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] }),
}))

export type Company = typeof companies.$inferSelect
export type Provider = typeof providers.$inferSelect
export type ProviderHour = typeof providerHours.$inferSelect
export type Service = typeof services.$inferSelect
export type Customer = typeof customers.$inferSelect
export type Appointment = typeof appointments.$inferSelect
export type NewAppointment = typeof appointments.$inferInsert

/**
 * Código de acesso válido por poucos minutos. O nome fica aqui e não em
 * `customers` porque o cadastro só nasce depois do código conferir. `audience`
 * separa cliente de equipe: um código pedido numa porta não abre a outra.
 */
export const accessCodes = sqliteTable(
  'access_codes',
  {
    id: id(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    name: text('name').notNull(),
    audience: text('audience', { enum: ['customer', 'staff'] })
      .notNull()
      .default('customer'),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('access_codes_company_phone').on(t.companyId, t.phone)],
)

export type AccessCode = typeof accessCodes.$inferSelect
