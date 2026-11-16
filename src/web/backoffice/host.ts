import { normalizeHost } from '../tenant.ts'

/**
 * O backoffice vive num host próprio, fora de qualquer salão: assim o acesso de
 * quem administra a plataforma não passa pelo mesmo endereço que os clientes e
 * as equipes usam, e um salão nunca pode responder por ele.
 */
export function backofficeHost(): string {
  return normalizeHost(process.env.BACKOFFICE_HOST ?? 'backoffice.localhost')
}

export function isBackofficeHost(rawHost: string): boolean {
  const host = normalizeHost(rawHost)
  return host !== '' && host === backofficeHost()
}
