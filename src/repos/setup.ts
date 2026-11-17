import type { Db } from '../db/client.ts'
import type { SetupData } from '../domain/setup.ts'
import { createProviderRepo } from './providers.ts'
import { createServiceRepo } from './services.ts'

/**
 * Consulta de leitura que cruza serviços, equipe e jornada para responder uma
 * pergunta só: o que falta para este salão receber cliente. Não é uma entidade
 * como os outros repositórios; existe para o guia e para o aviso do topo.
 */
export interface SetupRepo {
  dataFor(companyId: string): Promise<SetupData>
}

export function createSetupRepo(db: Db): SetupRepo {
  const serviceRepo = createServiceRepo(db)
  const providerRepo = createProviderRepo(db)

  return {
    async dataFor(companyId) {
      const services = await serviceRepo.listActive(companyId)
      const unassigned = await Promise.all(
        services.map(async (service) => {
          const who = await serviceRepo.providersFor(companyId, service.id)
          return who.length === 0 ? service.name : undefined
        }),
      )

      const team = await providerRepo.listAll(companyId)
      const active = team.filter((provider) => provider.active)
      const withoutHours = await Promise.all(
        active.map(async (provider) => {
          const hours = await providerRepo.hoursFor(provider.id)
          return hours.length === 0 ? provider.name : undefined
        }),
      )

      const named = (name: string | undefined): name is string => name !== undefined

      return {
        activeServices: services.length,
        activeProviders: active.length,
        servicesWithoutProvider: unassigned.filter(named),
        providersWithoutHours: withoutHours.filter(named),
        pendingInvites: active.filter((p) => p.joinedAt === null).map((p) => p.name),
      }
    },
  }
}
