import { defaultWorkweek } from '../domain/workday.ts'
import type { Db } from './client.ts'
import {
  appointments,
  companies,
  customers,
  providerHours,
  providerServices,
  providers,
  services,
} from './schema.ts'

export async function seed(db: Db) {
  await db.delete(appointments)
  await db.delete(providerServices)
  await db.delete(providerHours)
  await db.delete(customers)
  await db.delete(services)
  await db.delete(providers)
  await db.delete(companies)

  const [belezaPura, studioNorte] = await db
    .insert(companies)
    .values([
      { name: 'Beleza Pura', slug: 'beleza-pura', host: 'beleza-pura.localhost' },
      { name: 'Studio Norte', slug: 'studio-norte', host: 'studio-norte.localhost' },
    ])
    .returning()

  if (!belezaPura || !studioNorte) throw new Error('falha ao criar empresas')

  const [carla, rafa, ines] = await db
    .insert(providers)
    .values([
      { companyId: belezaPura.id, name: 'Carla Mendes', phone: '11988880001', role: 'owner' },
      { companyId: belezaPura.id, name: 'Rafa Lima', phone: '11988880002', slotMinutes: 30 },
      { companyId: studioNorte.id, name: 'Inês Prado', phone: '11988880003', role: 'owner' },
    ])
    .returning()

  if (!carla || !rafa || !ines) throw new Error('falha ao criar prestadores')

  await db
    .insert(providerHours)
    .values(
      [carla, rafa, ines].flatMap((p) =>
        defaultWorkweek().map((range) => ({ providerId: p.id, ...range })),
      ),
    )

  const [corte, escova, progressiva, barba, manicure] = await db
    .insert(services)
    .values([
      { companyId: belezaPura.id, name: 'Corte feminino', durationMinutes: 60, priceCents: 9000 },
      { companyId: belezaPura.id, name: 'Escova', durationMinutes: 40, priceCents: 7000 },
      { companyId: belezaPura.id, name: 'Progressiva', durationMinutes: 180, priceCents: 35000 },
      { companyId: belezaPura.id, name: 'Barba', durationMinutes: 30, priceCents: 4500 },
      { companyId: studioNorte.id, name: 'Manicure', durationMinutes: 60, priceCents: 6000 },
    ])
    .returning()

  if (!corte || !escova || !progressiva || !barba || !manicure) {
    throw new Error('falha ao criar serviços')
  }

  // Só a Carla faz progressiva: é o caso de serviço exclusivo de um profissional.
  await db.insert(providerServices).values([
    { providerId: carla.id, serviceId: corte.id },
    { providerId: carla.id, serviceId: escova.id },
    { providerId: carla.id, serviceId: progressiva.id },
    { providerId: rafa.id, serviceId: corte.id },
    { providerId: rafa.id, serviceId: barba.id },
    { providerId: ines.id, serviceId: manicure.id },
  ])

  await db.insert(customers).values([
    { companyId: belezaPura.id, name: 'Maria Silva', phone: '11977770001' },
    { companyId: belezaPura.id, name: 'João Prado', phone: '11977770002' },
    { companyId: studioNorte.id, name: 'Maria Silva', phone: '11977770001' },
  ])

  return { belezaPura, studioNorte, carla, rafa, ines, corte, escova, progressiva, barba }
}

if (import.meta.main) {
  const { db } = await import('./client.ts')
  await seed(db())
  console.log('seed aplicado')
}
