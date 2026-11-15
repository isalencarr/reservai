import { type Context, Hono } from 'hono'
import type { Db } from '../../db/client.ts'
import { isOverdue } from '../../domain/booking.ts'
import { formatWhen } from '../../domain/time.ts'
import type { Notifier } from '../../notify/notifier.ts'
import { createAppointmentRepo } from '../../repos/appointments.ts'
import { createProviderRepo } from '../../repos/providers.ts'
import { canManage, type StaffEnv, staffMiddleware } from '../staff.ts'
import { requireArea } from '../tenant.ts'
import { Layout } from '../views/layout.tsx'
import { Pendentes, type PendentesProps } from '../views/pendentes.tsx'

export function pendentesRoutes(db: Db, notifier: Notifier) {
  const providerRepo = createProviderRepo(db)
  const appointmentRepo = createAppointmentRepo(db)
  const app = new Hono<StaffEnv>()
  app.use('*', requireArea('staff'))
  app.use('*', staffMiddleware(providerRepo))

  async function props(
    companyId: string,
    timeZone: string,
    providerId: string,
  ): Promise<PendentesProps | undefined> {
    const provider = await providerRepo.findById(companyId, providerId)
    if (!provider) return undefined
    return {
      providerId: provider.id,
      providerName: provider.name,
      timeZone,
      now: new Date(),
      items: await appointmentRepo.listPending(companyId, provider.id),
    }
  }

  const render = (c: Context<StaffEnv>, view: PendentesProps, companyName: string) =>
    c.req.header('HX-Request')
      ? c.html(<Pendentes {...view} />)
      : c.html(
          <Layout title="Pedidos" companyName={companyName}>
            <Pendentes {...view} />
          </Layout>,
        )

  app.get('/:providerId', async (c) => {
    const company = c.get('company')
    if (!canManage(c.get('staff'), c.req.param('providerId'))) {
      return c.text('Essa fila não é sua.', 403)
    }
    const view = await props(company.id, company.timezone, c.req.param('providerId'))
    if (!view) return c.notFound()
    return render(c, view, company.name)
  })

  /** Confirmar e recusar seguem o mesmo caminho; só muda o status gravado e o
   * texto que o cliente recebe. Fora do prazo, nenhum dos dois vale. */
  async function answer(c: Context<StaffEnv>, accepted: boolean) {
    const company = c.get('company')
    const providerId = c.req.param('providerId') ?? ''
    if (!canManage(c.get('staff'), providerId)) return c.text('Essa fila não é sua.', 403)
    const existing = await appointmentRepo.findById(company.id, c.req.param('id') ?? '')

    if (!existing || existing.providerId !== providerId || existing.status !== 'pending') {
      return c.text('Esse pedido não está mais na fila.', 409)
    }
    if (existing.confirmDeadlineAt && isOverdue(existing.confirmDeadlineAt, new Date())) {
      return c.text('O prazo para responder esse pedido venceu.', 409)
    }

    const target = await appointmentRepo.setStatus(
      company.id,
      existing.id,
      accepted ? 'confirmed' : 'declined',
    )
    if (target?.customerPhone) {
      await notifier.send({
        kind: 'request-answer',
        to: target.customerPhone,
        when: formatWhen(target.startsAt, target.timeZone),
        accepted,
        providerName: target.providerName,
      })
    }

    const view = await props(company.id, company.timezone, providerId)
    if (!view) return c.notFound()
    return render(c, view, company.name)
  }

  app.post('/:providerId/:id/confirmar', (c) => answer(c, true))
  app.post('/:providerId/:id/recusar', (c) => answer(c, false))

  return app
}
