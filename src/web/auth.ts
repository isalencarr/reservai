import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'

const CUSTOMER_COOKIE = 'cliente'
const STAFF_COOKIE = 'equipe'
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** Em produção o segredo vem do ambiente; o valor local existe para o app subir
 * sem configuração e nunca deve viajar junto com o deploy. */
export function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? 'reservai-dev-secret'
}

/** A sessão carrega a empresa junto: um cookie emitido por um salão não vale no
 * outro, mesmo que alguém aponte os dois domínios para o mesmo servidor. */
async function setSession(c: Context, name: string, companyId: string, subjectId: string) {
  await setSignedCookie(c, name, `${companyId}:${subjectId}`, sessionSecret(), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  })
}

async function readSession(c: Context, name: string, companyId: string) {
  const raw = await getSignedCookie(c, sessionSecret(), name)
  if (typeof raw !== 'string') return undefined
  const [company, subject] = raw.split(':')
  return company === companyId && subject ? subject : undefined
}

export const setCustomerSession = (c: Context, companyId: string, customerId: string) =>
  setSession(c, CUSTOMER_COOKIE, companyId, customerId)

export const readCustomerId = (c: Context, companyId: string) =>
  readSession(c, CUSTOMER_COOKIE, companyId)

export const clearCustomerSession = (c: Context) => deleteCookie(c, CUSTOMER_COOKIE, { path: '/' })

export const setStaffSession = (c: Context, companyId: string, providerId: string) =>
  setSession(c, STAFF_COOKIE, companyId, providerId)

export const readStaffId = (c: Context, companyId: string) =>
  readSession(c, STAFF_COOKIE, companyId)

export const clearStaffSession = (c: Context) => deleteCookie(c, STAFF_COOKIE, { path: '/' })
