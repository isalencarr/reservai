import { type Context, Hono } from 'hono'
import { createAppointmentRepo } from '../../repos/appointments.ts'
import { createCustomerRepo } from '../../repos/customers.ts'
import type { Deps } from '../deps.ts'
import {
  denyOnSupport,
  layoutProps,
  requireOwner,
  type StaffEnv,
  staffMiddleware,
} from '../staff.ts'
import { requireArea } from '../tenant.ts'
import { Clientes, type ClientesProps } from '../views/clientes.tsx'
import { StaffLayout } from '../views/staff-layout.tsx'

export function clientesRoutes({ db, auth }: Deps) {
  const customerRepo = createCustomerRepo(db)
  const appointmentRepo = createAppointmentRepo(db)
  const app = new Hono<StaffEnv>()

  app.use('*', requireArea('staff'))
  app.use('*', staffMiddleware(auth, db))
  app.use('*', requireOwner())
  app.use('*', denyOnSupport())

  app.get('/', async (c: Context<StaffEnv>) => {
    const company = c.get('company')
    const query = c.req.query('q') ?? ''
    const items = await customerRepo.list(company.id, query)

    const wanted = c.req.query('ver')
    const customer = items.find((item) => item.id === wanted)
    const viewing = customer
      ? { customer, history: await appointmentRepo.listByCustomer(company.id, customer.id) }
      : undefined

    const view: ClientesProps = { items, query, timeZone: company.timezone, viewing }
    return c.html(
      c.req.header('HX-Request') ? (
        <Clientes {...view} />
      ) : (
        <StaffLayout title="Clientes" active="clientes" {...layoutProps(c)}>
          <Clientes {...view} />
        </StaffLayout>
      ),
    )
  })

  return app
}
