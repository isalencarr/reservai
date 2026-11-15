/**
 * O registro de acesso precisa ser útil para investigar e, ao mesmo tempo,
 * guardável: e-mail sai parcialmente escondido e o IP perde a parte que
 * identifica o aparelho, mantendo a rede de origem.
 */
export function maskEmail(email: string | undefined | null): string {
  const value = (email ?? '').trim().toLowerCase()
  const at = value.lastIndexOf('@')
  if (at < 1) return value ? '***' : ''

  const user = value.slice(0, at)
  const domain = value.slice(at + 1)
  const head = user.slice(0, user.length <= 2 ? 1 : 2)
  const dot = domain.indexOf('.')
  const maskedDomain = dot < 1 ? '***' : `${domain.slice(0, 1)}***${domain.slice(dot)}`
  return `${head}***@${maskedDomain}`
}

/** IPv4 perde o último octeto; IPv6, os últimos quatro grupos. */
export function truncateIp(ip: string | undefined | null): string {
  const value = (ip ?? '').trim()
  if (!value) return ''

  if (value.includes('.') && !value.includes(':')) {
    const parts = value.split('.')
    return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.0` : ''
  }

  if (value.includes(':')) {
    const groups = value.split(':').slice(0, 4).filter(Boolean)
    return groups.length === 0 ? '::' : `${groups.join(':')}::`
  }

  return ''
}

/** O cabeçalho de proxy pode trazer vários endereços; o primeiro é o cliente. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return truncateIp(forwarded || headers.get('x-real-ip'))
}
