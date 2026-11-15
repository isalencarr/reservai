import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type Company, companies } from '../db/schema.ts'

export interface CompanyRepo {
  findByHost(host: string): Promise<Company | undefined>
  findBySlug(slug: string): Promise<Company | undefined>
}

export function createCompanyRepo(db: Db): CompanyRepo {
  return {
    async findByHost(host) {
      return db.query.companies.findFirst({ where: eq(companies.host, host) })
    },
    async findBySlug(slug) {
      return db.query.companies.findFirst({ where: eq(companies.slug, slug) })
    },
  }
}
