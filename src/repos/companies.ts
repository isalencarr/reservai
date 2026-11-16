import { asc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type Company, companies } from '../db/schema.ts'

/** O que o backoffice edita. Tema e situação têm caminhos próprios. */
export type CompanyInput = {
  name: string
  host: string
  slug: string
  timezone: string
}

export interface CompanyRepo {
  findByHost(host: string): Promise<Company | undefined>
  findBySlug(slug: string): Promise<Company | undefined>
  findById(id: string): Promise<Company | undefined>
  listAll(): Promise<Company[]>
  update(id: string, input: CompanyInput): Promise<Company | undefined>
  setStatus(id: string, status: Company['status']): Promise<Company | undefined>
  updateTheme(id: string, seed: string, mode: Company['themeMode']): Promise<void>
}

export function createCompanyRepo(db: Db): CompanyRepo {
  return {
    async findByHost(host) {
      return db.query.companies.findFirst({ where: eq(companies.host, host) })
    },
    async findBySlug(slug) {
      return db.query.companies.findFirst({ where: eq(companies.slug, slug) })
    },

    async findById(id) {
      return db.query.companies.findFirst({ where: eq(companies.id, id) })
    },

    /** Usado só pelo backoffice: o app do salão nunca precisa de mais de um. */
    async listAll() {
      return db.select().from(companies).orderBy(asc(companies.name))
    },

    async update(id, input) {
      const [row] = await db.update(companies).set(input).where(eq(companies.id, id)).returning()
      return row
    },

    /** A data de suspensão fica guardada para o backoffice dizer desde quando;
     * reativar limpa, senão a tela mostraria uma suspensão que já acabou. */
    async setStatus(id, status) {
      const [row] = await db
        .update(companies)
        .set({ status, suspendedAt: status === 'suspended' ? new Date() : null })
        .where(eq(companies.id, id))
        .returning()
      return row
    },

    async updateTheme(id, seed, mode) {
      await db
        .update(companies)
        .set({ themeSeed: seed, themeMode: mode })
        .where(eq(companies.id, id))
    },
  }
}
