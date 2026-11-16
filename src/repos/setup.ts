import type { Db } from '../db/client.ts'
import type { DadosDeSetup } from '../domain/setup.ts'
import { createProviderRepo } from './providers.ts'
import { createServiceRepo } from './services.ts'

/**
 * Consulta de leitura que cruza serviços, equipe e jornada para responder uma
 * pergunta só: o que falta para este salão receber cliente. Não é uma entidade
 * como os outros repositórios; existe para o guia e para o aviso do topo.
 */
export interface SetupRepo {
  dataFor(companyId: string): Promise<DadosDeSetup>
}

export function createSetupRepo(db: Db): SetupRepo {
  const serviceRepo = createServiceRepo(db)
  const providerRepo = createProviderRepo(db)

  return {
    async dataFor(companyId) {
      const servicos = await serviceRepo.listActive(companyId)
      const semProfissional = await Promise.all(
        servicos.map(async (servico) => {
          const quem = await serviceRepo.providersFor(companyId, servico.id)
          return quem.length === 0 ? servico.name : undefined
        }),
      )

      const equipe = await providerRepo.listAll(companyId)
      const ativos = equipe.filter((p) => p.active)
      const semJornada = await Promise.all(
        ativos.map(async (pessoa) => {
          const jornada = await providerRepo.hoursFor(pessoa.id)
          return jornada.length === 0 ? pessoa.name : undefined
        }),
      )

      const presente = (nome: string | undefined): nome is string => nome !== undefined

      return {
        servicosAtivos: servicos.length,
        servicosSemProfissional: semProfissional.filter(presente),
        profissionaisSemJornada: semJornada.filter(presente),
        convitesPendentes: ativos.filter((p) => p.joinedAt === null).map((p) => p.name),
      }
    },
  }
}
