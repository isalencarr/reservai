import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { createDb, type Db } from '../src/db/client.ts'
import { seed } from '../src/db/seed.ts'
import { addDays, type LocalDate, localDate, weekdayOf } from '../src/domain/time.ts'
import type { LogNotifier } from '../src/notify/log-notifier.ts'

/** Cada teste recebe um banco em memória recém-migrado: sem arquivo para limpar
 * e sem ordem de execução importando. */
export function createTestDb(): Db {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: 'src/db/migrations' })
  return db
}

export async function createSeededDb() {
  const db = createTestDb()
  const data = await seed(db)
  return { db, ...data }
}

/** Data futura que cai no dia da semana pedido. Os testes de disponibilidade
 * dependem do relógio real, então ancoram numa data sempre à frente de hoje. */
export function upcomingWeekday(weekday: number, timeZone: string, minDaysAhead = 14): LocalDate {
  let date = addDays(localDate(new Date(), timeZone), minDaysAhead)
  while (weekdayOf(date) !== weekday) date = addDays(date, 1)
  return date
}

/** Faz o login de equipe pelo caminho real: pede o link, lê o endereço que
 * chegou ao notificador e visita, como a pessoa faria no e-mail. */
export async function staffLogin(
  app: { request: (path: string, init?: RequestInit) => Promise<Response> | Response },
  notifier: LogNotifier,
  host: string,
  email: string,
): Promise<string> {
  await app.request('/equipe/entrar', {
    method: 'POST',
    headers: { host, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email }),
  })

  const sent = notifier.sent.at(-1)
  if (sent?.kind !== 'magic-link') throw new Error(`link da equipe não foi enviado para ${email}`)

  const res = await app.request(sent.url, { headers: { host } })
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  if (!cookie) throw new Error('sessão da equipe não foi criada')
  return cookie
}
