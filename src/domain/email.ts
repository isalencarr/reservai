/** Aceita o que uma pessoa digita e devolve a forma única que vai ao banco:
 * sem espaço e em minúsculas. Validação é de forma, não de existência. */
export function normalizeEmail(raw: string | undefined): string | undefined {
  const email = (raw ?? '').trim().toLowerCase()
  if (email.length < 6 || email.length > 254) return undefined
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) ? email : undefined
}
