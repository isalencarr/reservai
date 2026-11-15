import type { Db } from '../db/client.ts'
import { formatWhen } from '../domain/time.ts'
import type { Notifier } from '../notify/notifier.ts'
import { createAppointmentRepo } from '../repos/appointments.ts'

/**
 * Expira pedidos vencidos e avisa quem ficou sem horário. Roda na web a cada
 * requisição da empresa e também pelo comando, para o slot voltar a ser
 * oferecido mesmo com o salão sem abrir o app.
 */
export async function expirePending(
  db: Db,
  notifier: Notifier,
  now = new Date(),
  companyId?: string,
): Promise<number> {
  const expired = await createAppointmentRepo(db).expireOverdue(now, companyId)

  for (const target of expired) {
    if (!target.customerPhone) continue
    await notifier.send({
      kind: 'request-answer',
      to: target.customerPhone,
      when: formatWhen(target.startsAt, target.timeZone),
      accepted: false,
      providerName: target.providerName,
    })
  }
  return expired.length
}

if (import.meta.main) {
  const { db } = await import('../db/client.ts')
  const { createLogNotifier } = await import('../notify/log-notifier.ts')
  console.log(`${await expirePending(db(), createLogNotifier())} pedido(s) expirado(s)`)
}
