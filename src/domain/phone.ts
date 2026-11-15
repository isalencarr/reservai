/**
 * Telefone é a identidade do cliente dentro do salão, então precisa chegar ao
 * banco sempre na mesma forma: só dígitos, com DDD. Variações de máscara viram
 * cadastros duplicados na carteira da empresa.
 */
export function normalizePhone(raw: string | undefined): string | undefined {
  const digits = (raw ?? '').replace(/\D/g, '')
  const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  return national.length === 10 || national.length === 11 ? national : undefined
}

export function formatPhone(phone: string): string {
  const ddd = phone.slice(0, 2)
  const rest = phone.slice(2)
  const cut = rest.length === 9 ? 5 : 4
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`
}
