import { type Context, Hono } from 'hono'
import { parsePrice } from '../../domain/money.ts'
import { createProviderRepo } from '../../repos/providers.ts'
import { createServiceRepo, type ServiceInput } from '../../repos/services.ts'
import type { Deps } from '../deps.ts'
import { requireOwner, type StaffEnv, staffMiddleware } from '../staff.ts'
import { requireArea } from '../tenant.ts'
import { Servicos, type ServicosProps } from '../views/servicos.tsx'
import { StaffLayout } from '../views/staff-layout.tsx'

const MIN_DURATION = 5
const MAX_DURATION = 600

type ParsedForm = { input: ServiceInput; providerIds: string[] } | { error: string }

/** Validação em um lugar só: as telas de criar e editar mandam o mesmo formulário. */
function readForm(body: Record<string, unknown>): ParsedForm {
  const name = typeof body.nome === 'string' ? body.nome.trim() : ''
  if (name === '') return { error: 'O serviço precisa de um nome.' }

  const durationMinutes = Number(body.duracao)
  if (!Number.isInteger(durationMinutes)) return { error: 'Duração precisa ser um número.' }
  if (durationMinutes < MIN_DURATION || durationMinutes > MAX_DURATION) {
    return { error: `Duração precisa estar entre ${MIN_DURATION} e ${MAX_DURATION} minutos.` }
  }

  const priceCents = parsePrice(typeof body.preco === 'string' ? body.preco : undefined)
  if (priceCents === undefined) return { error: 'Preço inválido. Use algo como 90,00.' }

  const raw = body.prestador
  const providerIds = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter(
    (id): id is string => typeof id === 'string',
  )

  return { input: { name, durationMinutes, priceCents }, providerIds }
}

export function servicosRoutes({ db, auth }: Deps) {
  const serviceRepo = createServiceRepo(db)
  const providerRepo = createProviderRepo(db)
  const app = new Hono<StaffEnv>()
  app.use('*', requireArea('staff'))
  app.use('*', staffMiddleware(auth, providerRepo))
  app.use('*', requireOwner())

  async function props(
    companyId: string,
    options: { error?: string; editingId?: string } = {},
  ): Promise<ServicosProps> {
    const all = await serviceRepo.listAll(companyId)
    const items = await Promise.all(
      all.map(async (service) => ({
        service,
        providerIds: await serviceRepo.providerIdsFor(service.id),
      })),
    )
    return {
      items,
      providers: await providerRepo.listByCompany(companyId),
      editing: items.find((row) => row.service.id === options.editingId),
      error: options.error,
    }
  }

  const render = (c: Context<StaffEnv>, view: ServicosProps, status = 200) => {
    const html = c.req.header('HX-Request') ? (
      <Servicos {...view} />
    ) : (
      <StaffLayout
        title="Serviços"
        company={c.get('company')}
        staff={c.get('staff')}
        active="servicos"
      >
        <Servicos {...view} />
      </StaffLayout>
    )
    return c.html(html, status as 200)
  }

  app.get('/', async (c) => {
    const company = c.get('company')
    const editingId = c.req.query('editar')
    return render(c, await props(company.id, { editingId }))
  })

  app.post('/', async (c) => {
    const company = c.get('company')
    const parsed = readForm(await c.req.parseBody({ all: true }))
    if ('error' in parsed) {
      return render(c, await props(company.id, { error: parsed.error }), 422)
    }

    const service = await serviceRepo.create(company.id, parsed.input)
    await serviceRepo.setProviders(company.id, service.id, parsed.providerIds)
    return render(c, await props(company.id))
  })

  app.post('/:id', async (c) => {
    const company = c.get('company')
    const id = c.req.param('id')
    if (!(await serviceRepo.findById(company.id, id))) return c.notFound()

    const parsed = readForm(await c.req.parseBody({ all: true }))
    if ('error' in parsed) {
      // O modal continua aberto com o aviso em vez de sumir com o que foi digitado.
      const view = await props(company.id, { error: parsed.error, editingId: id })
      return render(c, view, 422)
    }

    await serviceRepo.update(company.id, id, parsed.input)
    await serviceRepo.setProviders(company.id, id, parsed.providerIds)
    return render(c, await props(company.id))
  })

  app.post('/:id/ativo', async (c) => {
    const company = c.get('company')
    const body = await c.req.parseBody()
    const updated = await serviceRepo.setActive(company.id, c.req.param('id'), body.ativo === 'sim')
    if (!updated) return c.notFound()
    return render(c, await props(company.id))
  })

  return app
}
