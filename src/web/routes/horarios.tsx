import { type Context, Hono } from 'hono'
import { availableStarts } from '../../domain/availability.ts'
import { workingIntervals } from '../../domain/schedule.ts'
import { addDays, type LocalDate, localDate, toUtc } from '../../domain/time.ts'
import { createAppointmentRepo } from '../../repos/appointments.ts'
import { createProviderRepo } from '../../repos/providers.ts'
import { createServiceRepo } from '../../repos/services.ts'
import type { Deps } from '../deps.ts'
import { type StaffEnv, staffMiddleware } from '../staff.ts'
import { requireArea } from '../tenant.ts'
import { Horarios, type HorariosProps } from '../views/horarios.tsx'
import { StaffLayout } from '../views/staff-layout.tsx'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function readDate(raw: string | undefined, timeZone: string): LocalDate {
  return raw && DATE_PATTERN.test(raw) ? raw : localDate(new Date(), timeZone)
}

export function horariosRoutes({ db, auth }: Deps) {
  const serviceRepo = createServiceRepo(db)
  const providerRepo = createProviderRepo(db)
  const appointmentRepo = createAppointmentRepo(db)
  const app = new Hono<StaffEnv>()
  app.use('*', requireArea('staff'))
  app.use('*', staffMiddleware(auth, providerRepo))

  app.get('/', async (c: Context<StaffEnv>) => {
    const company = c.get('company')
    const timeZone = company.timezone
    const date = readDate(c.req.query('data'), timeZone)
    const services = await serviceRepo.listActive(company.id)

    const wanted = c.req.query('servico')
    const service = services.find((s) => s.id === wanted) ?? services[0]
    const providers = service ? await serviceRepo.providersFor(company.id, service.id) : []
    const chosen = c.req.query('prestador')
    const provider = providers.find((p) => p.id === chosen) ?? providers[0]

    let starts: Date[] = []
    if (service && provider) {
      const hours = await providerRepo.hoursFor(provider.id)
      const entries = await appointmentRepo.listDay(
        provider.id,
        toUtc(date, 0, timeZone),
        toUtc(addDays(date, 1), 0, timeZone),
      )
      starts = availableStarts({
        working: workingIntervals(hours, date, timeZone),
        busy: entries.map((e) => ({ start: e.startsAt, end: e.endsAt })),
        durationMinutes: service.durationMinutes,
        slotMinutes: provider.slotMinutes,
        now: new Date(),
        minLeadMinutes: provider.minLeadMinutes,
      })
    }

    const props: HorariosProps = { services, providers, service, provider, date, timeZone, starts }

    return c.req.header('HX-Request')
      ? c.html(<Horarios {...props} />)
      : c.html(
          <StaffLayout title="Horários" company={company} staff={c.get('staff')} active="horarios">
            <Horarios {...props} />
          </StaffLayout>,
        )
  })

  return app
}
