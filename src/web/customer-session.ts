import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'

const CUSTOMER_COOKIE = 'cliente'
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** Em produção o segredo vem do ambiente; o valor local existe para o app subir
 * sem configuração e nunca deve viajar junto com o deploy. */
export function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? 'reservai-dev-secret'
}

/** Sessão do cliente, que entra por telefone e código. A equipe tem a sua, na
 * biblioteca de autenticação. O cookie carrega a empresa junto: um emitido por
 * um salão não vale no outro. */
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
