import { MINUTE_MS } from './time.ts'

export const CODE_TTL_MINUTES = 10
export const CODE_MAX_ATTEMPTS = 5

/** Seis dígitos é o que se digita de cabeça depois de ler a mensagem. */
export function generateCode(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
    .padStart(6, '0')
    .slice(-6)
}

/** O código fica só como hash: ele dá acesso à carteira do salão enquanto vale. */
export function hashCode(code: string): string {
  return new Bun.CryptoHasher('sha256').update(code).digest('hex')
}

export function codeExpiry(now: Date): Date {
  return new Date(now.getTime() + CODE_TTL_MINUTES * MINUTE_MS)
}
