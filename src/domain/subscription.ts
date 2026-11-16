import type { LocalDate } from './time.ts'
import { localDate, toUtc } from './time.ts'

export const DAY_END_MINUTE = 24 * 60

/**
 * Situação do pagamento. "sem registro" não é o mesmo que "vencido": salão novo
 * ainda não pagou nada, e tratar os dois igual faria a lista de cobrança
 * começar errada.
 */
export type PaymentState = 'sem-registro' | 'em-dia' | 'vencido'

export function paymentState(paidUntil: Date | null | undefined, now: Date): PaymentState {
  if (!paidUntil) return 'sem-registro'
  return paidUntil.getTime() > now.getTime() ? 'em-dia' : 'vencido'
}

/** O dia pago vale inteiro: quem pagou até dia 10 tem o dia 10 todo, então o
 * prazo termina na virada para o 11, no fuso do salão. */
export function paidUntilInstant(date: LocalDate, timeZone: string): Date {
  return toUtc(date, DAY_END_MINUTE, timeZone)
}

/** O último dia pago. O prazo é guardado como a virada do dia, então mostrar o
 * instante direto daria sempre um dia a mais. */
export function paidUntilDate(paidUntil: Date, timeZone: string): LocalDate {
  return localDate(new Date(paidUntil.getTime() - 1), timeZone)
}
