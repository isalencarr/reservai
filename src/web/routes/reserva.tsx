import { type Context, Hono } from 'hono'
import type { Db } from '../../db/client.ts'
import { availableStarts } from '../../domain/availability.ts'
import { canCustomerCancel, canRequest, confirmDeadline } from '../../domain/booking.ts'
import { workingIntervals } from '../../domain/schedule.ts'
import {
  addDays,
  formatDayMonth,
  formatWeekdayShort,
  formatWhen,
  type LocalDate,
  localDate,
  toUtc,
} from '../../domain/time.ts'
import type { Notifier } from '../../notify/notifier.ts'
import { createAppointmentRepo } from '../../repos/appointments.ts'
import { createCustomerRepo } from '../../repos/customers.ts'
import { createProviderRepo } from '../../repos/providers.ts'
import { createServiceRepo } from '../../repos/services.ts'
import { readCustomerId } from '../customer-session.ts'
import { requireArea, type TenantEnv } from '../tenant.ts'
import { Layout } from '../views/layout.tsx'
import { Meus, type MeusProps, Reserva, type ReservaProps } from '../views/reserva.tsx'

const DAYS_AHEAD = 14
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type CustomerEnv = TenantEnv & { Variables: TenantEnv['Variables'] & { customerId: string } }

function dayOptions(from: LocalDate) {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const date = addDays(from, i)
    return { date, label: formatDayMonth(date), weekday: formatWeekdayShort(date) }
  })
}

export function reservaRoutes(db: Db, notifier: Notifier) {
  const serviceRepo = createServiceRepo(db)
  const providerRepo = createProviderRepo(db)
  const customerRepo = createCustomerRepo(db)
  const appointmentRepo = createAppointmentRepo(db)
  const app = new Hono<CustomerEnv>()
  app.use('*', requireArea('customer'))

  /** Sem cliente identificado não existe reserva: o pedido precisa de nome e
   * telefone verificados para o prestador saber quem vai aparecer. */
  app.use('*', async (c, next) => {
    const company = c.get('company')
    const customerId = await readCustomerId(c, company.id)
    if (!customerId) {
      const next = encodeURIComponent(new URL(c.req.url).pathname)
      const target = `/entrar?next=${next}`
      if (c.req.header('HX-Request')) {
        c.header('HX-Redirect', target)
        return c.body(null, 204)
      }
      return c.redirect(target, 303)
    }
    c.set('customerId', customerId)
    await next()
  })

  async function slotsFor(
    companyId: string,
    timeZone: string,
    providerId: string,
    durationMinutes: number,
    date: LocalDate,
  ) {
    const provider = await providerRepo.findById(companyId, providerId)
    if (!provider) return []
    const hours = await providerRepo.hoursFor(providerId)
    const entries = await appointmentRepo.listDay(
      providerId,
      toUtc(date, 0, timeZone),
      toUtc(addDays(date, 1), 0, timeZone),
    )
    return availableStarts({
      working: workingIntervals(hours, date, timeZone),
      busy: entries.map((e) => ({ start: e.startsAt, end: e.endsAt })),
      durationMinutes,
      slotMinutes: provider.slotMinutes,
      now: new Date(),
      minLeadMinutes: provider.minLeadMinutes,
    })
  }

  const render = (c: Context<CustomerEnv>, view: ReservaProps) =>
    c.html(
      c.req.header('HX-Request') ? (
        <Reserva {...view} />
      ) : (
        <Layout title="Agendar" company={c.get('company')}>
          <Reserva {...view} />
        </Layout>
      ),
    )

  app.get('/', async (c) => {
    const company = c.get('company')
    const timeZone = company.timezone
    const customer = await customerRepo.findById(company.id, c.get('customerId'))
    if (!customer) return c.redirect('/entrar', 303)

    const services = await serviceRepo.listActive(company.id)
    const service = services.find((s) => s.id === c.req.query('servico'))
    const providers = service ? await serviceRepo.providersFor(company.id, service.id) : []
    const provider = providers.find((p) => p.id === c.req.query('prestador'))

    const rawDate = c.req.query('data')
    const date = rawDate && DATE_PATTERN.test(rawDate) ? rawDate : undefined
    const starts =
      service && provider && date
        ? await slotsFor(company.id, timeZone, provider.id, service.durationMinutes, date)
        : []

    const rawHour = c.req.query('hora')
    const wanted = rawHour ? new Date(rawHour) : undefined
    const chosen =
      wanted && !Number.isNaN(wanted.getTime())
        ? starts.find((s) => s.getTime() === wanted.getTime())
        : undefined

    return render(c, {
      customerName: customer.name,
      timeZone,
      services,
      service,
      providers,
      provider,
      days: dayOptions(localDate(new Date(), timeZone)),
      date,
      starts,
      chosen,
    })
  })

  async function meus(c: Context<CustomerEnv>, error?: string, status = 200) {
    const company = c.get('company')
    const customer = await customerRepo.findById(company.id, c.get('customerId'))
    if (!customer) return c.redirect('/entrar', 303)

    const view: MeusProps = {
      customerName: customer.name,
      timeZone: company.timezone,
      now: new Date(),
      items: await appointmentRepo.listByCustomer(company.id, customer.id),
      error,
    }
    return c.html(
      c.req.header('HX-Request') ? (
        <Meus {...view} />
      ) : (
        <Layout title="Meus horários" company={company}>
          <Meus {...view} />
        </Layout>
      ),
      status as 200,
    )
  }

  app.get('/meus', (c) => meus(c))

  app.post('/', async (c) => {
    const company = c.get('company')
    const body = await c.req.parseBody()
    const customerId = c.get('customerId')

    const service = await serviceRepo.findById(
      company.id,
      typeof body.servico === 'string' ? body.servico : '',
    )
    const provider = await providerRepo.findById(
      company.id,
      typeof body.prestador === 'string' ? body.prestador : '',
    )
    const startsAt = new Date(typeof body.hora === 'string' ? body.hora : '')

    if (!service?.active || !provider || Number.isNaN(startsAt.getTime())) {
      return meus(c, 'Esse horário não está mais disponível. Escolha outro.', 422)
    }

    const executes = await serviceRepo.providersFor(company.id, service.id)
    if (!executes.some((p) => p.id === provider.id)) {
      return meus(c, 'Esse profissional não faz esse serviço.', 422)
    }

    const now = new Date()
    if (!canRequest(startsAt, now, provider.minLeadMinutes)) {
      return meus(c, 'Esse horário está perto demais. Escolha outro.', 422)
    }

    // Confere contra a disponibilidade real: a tela pode estar velha na mão do cliente.
    const date = localDate(startsAt, company.timezone)
    const livres = await slotsFor(
      company.id,
      company.timezone,
      provider.id,
      service.durationMinutes,
      date,
    )
    if (!livres.some((s) => s.getTime() === startsAt.getTime())) {
      return meus(c, 'Esse horário acabou de ser ocupado. Escolha outro.', 409)
    }

    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)
    await appointmentRepo.create({
      companyId: company.id,
      providerId: provider.id,
      customerId,
      serviceId: service.id,
      startsAt,
      endsAt,
      status: 'pending',
      origin: 'app',
      confirmDeadlineAt: confirmDeadline(startsAt, now, provider.minLeadMinutes),
    })

    const customer = await customerRepo.findById(company.id, customerId)
    await notifier.send({
      kind: 'pending-request',
      to: provider.phone,
      customerName: customer?.name ?? 'Cliente',
      serviceName: service.name,
      when: formatWhen(startsAt, company.timezone),
      deadline: formatWhen(
        confirmDeadline(startsAt, now, provider.minLeadMinutes),
        company.timezone,
      ),
    })

    return meus(c)
  })

  app.post('/:id/cancelar', async (c) => {
    const company = c.get('company')
    const existing = await appointmentRepo.findById(company.id, c.req.param('id'))

    if (!existing || existing.customerId !== c.get('customerId')) {
      return meus(c, 'Esse agendamento não é seu.', 404)
    }
    if (existing.status !== 'pending' && existing.status !== 'confirmed') {
      return meus(c, 'Esse horário já não está mais ativo.', 409)
    }
    if (!canCustomerCancel(existing.startsAt, new Date())) {
      return meus(c, 'Faltam menos de 2 horas: fale com o salão para cancelar.', 409)
    }

    const target = await appointmentRepo.setStatus(company.id, existing.id, 'cancelled')
    if (target) {
      const provider = await providerRepo.findById(company.id, existing.providerId)
      if (provider) {
        await notifier.send({
          kind: 'customer-cancelled',
          to: provider.phone,
          customerName: target.customerName ?? 'Cliente',
          when: formatWhen(target.startsAt, target.timeZone),
        })
      }
    }

    return meus(c)
  })

  return app
}
