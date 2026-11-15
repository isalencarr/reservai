import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { createDb } from './client.ts'

const target = process.env.DATABASE_URL ?? 'data/reservai.sqlite'
migrate(createDb(target), { migrationsFolder: 'src/db/migrations' })
console.log(`migrations aplicadas em ${target}`)
