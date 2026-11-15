import { Database } from 'bun:sqlite'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema.ts'

export type Db = BunSQLiteDatabase<typeof schema>

/**
 * Ponto único de criação da conexão. Trocar de banco depois significa mudar o
 * driver aqui e gerar o schema do novo dialeto; o resto do app fala com
 * `src/repos`, que só conhece as interfaces.
 */
export function createDb(url = process.env.DATABASE_URL ?? 'data/reservai.sqlite'): Db {
  const sqlite = new Database(url, { create: true })
  sqlite.run('PRAGMA journal_mode = WAL;')
  sqlite.run('PRAGMA foreign_keys = ON;')
  return drizzle(sqlite, { schema })
}

let cached: Db | undefined

export function db(): Db {
  cached ??= createDb()
  return cached
}
