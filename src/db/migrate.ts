import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { createPlatformAdminRepo } from '../repos/platform-admins.ts'
import { createDb } from './client.ts'

const target = process.env.DATABASE_URL ?? 'data/reservai.sqlite'
const db = createDb(target)
migrate(db, { migrationsFolder: 'src/db/migrations' })
console.log(`migrations aplicadas em ${target}`)

/**
 * O dono da plataforma entra pelo ambiente, não por um arquivo de migração:
 * SQL versionado não lê variável, e o e-mail que abre o backoffice é a chave de
 * tudo — ele não fica no repositório.
 */
const email = process.env.PLATFORM_OWNER_EMAIL
if (!email) {
  console.warn('PLATFORM_OWNER_EMAIL não definido: ninguém entra no backoffice ainda')
} else {
  const admin = await createPlatformAdminRepo(db).ensure(
    email,
    process.env.PLATFORM_OWNER_NAME ?? '',
  )
  if (!admin) {
    console.error(`PLATFORM_OWNER_EMAIL inválido: ${email}`)
    process.exit(1)
  }
  console.log(`dono da plataforma: ${admin.email}`)
}
