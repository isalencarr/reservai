import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type Company, companies } from '../db/schema.ts'

export interface CompanyRepo {
  findByHost(host: string): Promise<Company | undefined>
  findBySlug(slug: string): Promise<Company | undefined>
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

    async updateTheme(id, seed, mode) {
      await db
        .update(companies)
        .set({ themeSeed: seed, themeMode: mode })
        .where(eq(companies.id, id))
    },
  }
}
