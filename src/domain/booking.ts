import { MINUTE_MS } from './time.ts'

/** Teto do prazo de confirmação, contado a partir do pedido. */
export const CONFIRM_WINDOW_MINUTES = 24 * 60

/** Janela em que o cliente ainda cancela sozinho. Depois disso, só pelo salão. */
export const CUSTOMER_CANCEL_MINUTES = 120

/**
 * Prazo para o prestador responder: o menor entre 24 horas a partir do pedido e
 * a antecedência mínima dele. Sem o segundo limite, um pedido feito na sexta
 * para sábado venceria depois do atendimento já ter passado.
 */
export function confirmDeadline(startsAt: Date, now: Date, leadMinutes: number): Date {
  const byWindow = now.getTime() + CONFIRM_WINDOW_MINUTES * MINUTE_MS
  const byStart = startsAt.getTime() - leadMinutes * MINUTE_MS
  return new Date(Math.min(byWindow, byStart))
}

export function isOverdue(deadline: Date, now: Date): boolean {
  return deadline.getTime() <= now.getTime()
}

/** Minutos que faltam para o prazo, nunca negativo. */
export function remainingMinutes(deadline: Date, now: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / MINUTE_MS))
}

export function canCustomerCancel(startsAt: Date, now: Date): boolean {
  return now.getTime() <= startsAt.getTime() - CUSTOMER_CANCEL_MINUTES * MINUTE_MS
}

/** Pedido só entra se ainda sobra tempo para a resposta do prestador. */
export function canRequest(startsAt: Date, now: Date, leadMinutes: number): boolean {
  return !isOverdue(confirmDeadline(startsAt, now, leadMinutes), now)
}
