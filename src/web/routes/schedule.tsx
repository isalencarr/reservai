import { type Context, Hono } from 'hono'
import { type Busy, buildDayGrid, workingIntervals } from '../../domain/schedule.ts'
import { addDays, formatWhen, type LocalDate, localDate, toUtc } from '../../domain/time.ts'
import { createAppointmentRepo, type DayEntry } from '../../repos/appointments.ts'
import { createProviderRepo } from '../../repos/providers.ts'
import type { Deps } from '../deps.ts'
import { canManage, layoutProps, type StaffEnv, staffMiddleware } from '../staff.ts'
import { requireArea } from '../tenant.ts'
import { DayView, type DayViewProps } from '../views/day-view.tsx'
import { StaffLayout } from '../views/staff-layout.tsx'
import { text, WIRE } from '../wire.ts'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function readDate(raw: string | undefined, timeZone: string): LocalDate {
  return raw && DATE_PATTERN.test(raw) ? raw : localDate(new Date(), timeZone)
}

function readInstant(raw: string): Date | undefined {
  const value = new Date(raw)
  return raw === '' || Number.isNaN(value.getTime()) ? undefined : value
}

export function scheduleRoutes({ db, notifier, auth }: Deps) {
  const providerRepo = createProviderRepo(db)
  const appointmentRepo = createAppointmentRepo(db)
  const app = new Hono<StaffEnv>()
  app.use('*', requireArea('staff'))
  app.use('*', staffMiddleware(auth, db))

  async function dayView(
    companyId: string,
    timeZone: string,
    providerId: string,
    date: LocalDate,
  ): Promise<DayViewProps | undefined> {
    const provider = await providerRepo.findById(companyId, providerId)
    if (!provider) return undefined

    const hours = await providerRepo.hoursFor(provider.id)
    const dayStart = toUtc(date, 0, timeZone)
    const dayEnd = toUtc(addDays(date, 1), 0, timeZone)
    const entries = await appointmentRepo.listDay(provider.id, dayStart, dayEnd)
    const busy: Busy<DayEntry>[] = entries.map((e) => ({
      start: e.startsAt,
      end: e.endsAt,
      data: e,
    }))

    return {
      providerId: provider.id,
      providerName: provider.name,
      date,
      timeZone,
      bands: buildDayGrid(workingIntervals(hours, date, timeZone), busy, provider.slotMinutes),
    }
  }

  /** Toda ação devolve o mesmo fragmento; só a navegação direta ganha o layout. */
  const render = (c: Context<StaffEnv>, props: DayViewProps) =>
    c.req.header('HX-Request')
      ? c.html(<DayView {...props} />)
      : c.html(
          <StaffLayout
            title={`Agenda de ${props.providerName}`}
            active="schedules"
            {...layoutProps(c)}
          >
            <DayView {...props} />
          </StaffLayout>,
        )

  app.get('/:providerId', async (c) => {
    const company = c.get('company')
    if (!canManage(c.get('staff'), c.req.param('providerId'))) {
      return c.text('Essa agenda não é sua.', 403)
    }
    const date = readDate(c.req.query(WIRE.date), company.timezone)
    const props = await dayView(company.id, company.timezone, c.req.param('providerId'), date)
    if (!props) return c.notFound()
    return render(c, props)
  })

  app.post('/:providerId/bloqueios', async (c) => {
    const company = c.get('company')
    const providerId = c.req.param('providerId')
    if (!canManage(c.get('staff'), providerId)) return c.text('Essa agenda não é sua.', 403)
    const body = await c.req.parseBody()
    const startsAt = readInstant(text(body, WIRE.startsAt))
    const endsAt = readInstant(text(body, WIRE.endsAt))
    if (!startsAt || !endsAt || endsAt <= startsAt) return c.text('Horário inválido.', 400)

    const provider = await providerRepo.findById(company.id, providerId)
    if (!provider) return c.notFound()
    if (await appointmentRepo.hasConflict(provider.id, startsAt, endsAt)) {
      return c.text('Esse horário já está ocupado.', 409)
    }

    await appointmentRepo.create({
      companyId: company.id,
      providerId: provider.id,
      startsAt,
      endsAt,
      status: 'confirmed',
      origin: 'external',
      note: text(body, WIRE.note) || 'Bloqueado',
    })

    const date = readDate(c.req.query(WIRE.date), company.timezone)
    const props = await dayView(company.id, company.timezone, provider.id, date)
    if (!props) return c.notFound()
    return render(c, props)
  })

  app.delete('/:providerId/bloqueios/:id', async (c) => {
    const company = c.get('company')
    const providerId = c.req.param('providerId')
    if (!canManage(c.get('staff'), providerId)) return c.text('Essa agenda não é sua.', 403)
    const existing = await appointmentRepo.findById(company.id, c.req.param('id'))

    // Só bloqueio manual some da agenda; desmarcar cliente é outro fluxo.
    if (existing?.origin !== 'external' || existing.providerId !== providerId) {
      return c.text('Esse horário não pode ser liberado por aqui.', 400)
    }
    await appointmentRepo.remove(company.id, existing.id)

    const date = readDate(c.req.query(WIRE.date), company.timezone)
    const props = await dayView(company.id, company.timezone, providerId, date)
    if (!props) return c.notFound()
    return render(c, props)
  })

  /** Folga do dia: cancela o que estava marcado, avisa quem precisa remarcar e
   * fecha cada faixa de expediente com um bloqueio. */
  app.post('/:providerId/folga', async (c) => {
    const company = c.get('company')
    const providerId = c.req.param('providerId')
    if (!canManage(c.get('staff'), providerId)) return c.text('Essa agenda não é sua.', 403)
    const provider = await providerRepo.findById(company.id, providerId)
    if (!provider) return c.notFound()

    const date = readDate(c.req.query(WIRE.date), company.timezone)
    const hours = await providerRepo.hoursFor(provider.id)
    const bands = workingIntervals(hours, date, company.timezone)
    if (bands.length === 0) return c.text('Não há expediente nesse dia.', 400)

    const affected = await appointmentRepo.cancelRange(
      company.id,
      provider.id,
      toUtc(date, 0, company.timezone),
      toUtc(addDays(date, 1), 0, company.timezone),
    )

    for (const target of affected) {
      if (!target.customerPhone) continue
      await notifier.send({
        kind: 'reschedule-needed',
        to: target.customerPhone,
        when: formatWhen(target.startsAt, target.timeZone),
        providerName: target.providerName,
      })
    }

    for (const band of bands) {
      await appointmentRepo.create({
        companyId: company.id,
        providerId: provider.id,
        startsAt: band.start,
        endsAt: band.end,
        status: 'confirmed',
        origin: 'external',
        note: 'Folga',
      })
    }

    const props = await dayView(company.id, company.timezone, provider.id, date)
    if (!props) return c.notFound()
    return render(c, props)
  })

  return app
}
