import { describe, expect, it } from 'bun:test'
import { listSetupIssues, listSetupSteps, type SetupData } from './setup.ts'

const ready: SetupData = {
  activeServices: 3,
  activeProviders: 2,
  servicesWithoutProvider: [],
  providersWithoutHours: [],
  pendingInvites: [],
}

const stateOf = (data: SetupData, key: string) =>
  listSetupSteps(data).find((step) => step.key === key)?.state

describe('pendências de setup', () => {
  it('salão completo não tem pendência', () => {
    expect(listSetupIssues(ready)).toEqual([])
  })

  it('salão recém-criado precisa de serviço', () => {
    const issues = listSetupIssues({ ...ready, activeServices: 0 })
    expect(issues.map((issue) => issue.key)).toEqual(['no-service'])
    expect(issues.every((issue) => !issue.blocking)).toBe(false)
  })

  it('serviço sem ninguém para executar impede agendamento', () => {
    const issues = listSetupIssues({ ...ready, servicesWithoutProvider: ['Progressiva'] })
    expect(issues[0]).toMatchObject({ key: 'service-without-provider', href: '/servicos' })
    expect(issues[0]?.text).toContain('Progressiva')
  })

  it('profissional sem jornada manda para a jornada', () => {
    const issues = listSetupIssues({ ...ready, providersWithoutHours: ['Rafa Lima'] })
    expect(issues[0]).toMatchObject({
      key: 'provider-without-hours',
      href: '/equipe/jornada',
    })
  })

  it('convite não aceito avisa, mas não impede de marcar', () => {
    const issues = listSetupIssues({ ...ready, pendingInvites: ['Bia Souza'] })
    expect(issues[0]).toMatchObject({ key: 'pending-invite', blocking: false })
  })

  it('resume a lista quando são muitos', () => {
    const issues = listSetupIssues({
      ...ready,
      providersWithoutHours: ['Ana', 'Bia', 'Caio', 'Duda'],
    })
    expect(issues[0]?.text).toContain('Ana, Bia e mais 2')
  })

  it('junta as pendências na ordem de quem resolve primeiro', () => {
    const issues = listSetupIssues({
      activeServices: 0,
      activeProviders: 1,
      servicesWithoutProvider: ['Corte'],
      providersWithoutHours: ['Rafa'],
      pendingInvites: ['Bia'],
    })
    expect(issues.map((issue) => issue.key)).toEqual([
      'no-service',
      'service-without-provider',
      'provider-without-hours',
      'pending-invite',
    ])
  })
})

describe('passo a passo de setup', () => {
  it('mostra o caminho inteiro, sempre na mesma ordem', () => {
    expect(listSetupSteps(ready).map((step) => step.key)).toEqual([
      'services',
      'team',
      'assignments',
      'hours',
      'publish',
    ])
  })

  it('salão novo começa pelo serviço, e o resto espera', () => {
    const fresh: SetupData = {
      activeServices: 0,
      activeProviders: 1,
      servicesWithoutProvider: [],
      providersWithoutHours: [],
      pendingInvites: [],
    }
    expect(stateOf(fresh, 'services')).toBe('now')
    expect(stateOf(fresh, 'assignments')).toBe('later')
    expect(stateOf(fresh, 'publish')).toBe('later')
  })

  it('o passo cumprido fica à vista, com o que já existe', () => {
    const steps = listSetupSteps(ready)
    const services = steps.find((step) => step.key === 'services')
    expect(services?.state).toBe('done')
    expect(services?.note).toBe('3 serviços ativos.')
  })

  it('convidar equipe não bloqueia: quem atende sozinho segue em frente', () => {
    const alone = { ...ready, activeProviders: 1 }
    expect(stateOf(alone, 'team')).toBe('optional')
    expect(stateOf(alone, 'publish')).toBe('now')
  })

  it('convite não aceito aparece como nota do passo da equipe', () => {
    const steps = listSetupSteps({ ...ready, pendingInvites: ['Bia Souza'] })
    expect(steps.find((step) => step.key === 'team')?.note).toContain('Bia Souza')
  })

  it('serviço sem ninguém para executar é o passo da vez', () => {
    const data = { ...ready, servicesWithoutProvider: ['Progressiva'] }
    expect(stateOf(data, 'services')).toBe('done')
    expect(stateOf(data, 'assignments')).toBe('now')
    expect(listSetupSteps(data).find((s) => s.key === 'assignments')?.note).toContain('Progressiva')
  })

  it('quem executa só é cobrado depois de existir serviço', () => {
    const empty = { ...ready, activeServices: 0, servicesWithoutProvider: [] }
    expect(stateOf(empty, 'assignments')).toBe('later')
  })

  it('divulgar é o último passo, e só chega a vez quando o resto está pronto', () => {
    expect(stateOf(ready, 'publish')).toBe('now')
    expect(stateOf({ ...ready, providersWithoutHours: ['Rafa'] }, 'publish')).toBe('later')
  })

  it('nenhum passo fica sem tela, tirando o de divulgar', () => {
    const withoutAction = listSetupSteps(ready).filter((step) => !step.action)
    expect(withoutAction.map((step) => step.key)).toEqual(['publish'])
  })
})
