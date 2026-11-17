/**
 * O que falta para o salão receber cliente. Um salão nasce com o endereço no
 * ar e vazio, e sem esta lista o dono só descobre o problema quando o primeiro
 * cliente não acha horário nenhum.
 */

export type SetupIssueKey =
  | 'no-service'
  | 'service-without-provider'
  | 'provider-without-hours'
  | 'pending-invite'

export type SetupIssue = {
  key: SetupIssueKey
  text: string
  href: string
  /** Verdadeiro quando o cliente não consegue agendar enquanto isso durar. */
  blocking: boolean
}

export type SetupData = {
  activeServices: number
  /** Inclui o dono, que também atende: mais de um quer dizer equipe convidada. */
  activeProviders: number
  /** Nomes, para a pendência dizer qual é o item e não só quantos. */
  servicesWithoutProvider: string[]
  providersWithoutHours: string[]
  pendingInvites: string[]
}

const nameList = (names: string[]) =>
  names.length <= 2
    ? names.join(' e ')
    : `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`

export function listSetupIssues(data: SetupData): SetupIssue[] {
  const issues: SetupIssue[] = []

  if (data.activeServices === 0) {
    issues.push({
      key: 'no-service',
      text: 'Cadastre o primeiro serviço: é o que o cliente escolhe para começar.',
      href: '/servicos',
      blocking: true,
    })
  }

  if (data.servicesWithoutProvider.length > 0) {
    issues.push({
      key: 'service-without-provider',
      text: `Sem ninguém marcado para executar: ${nameList(data.servicesWithoutProvider)}.`,
      href: '/servicos',
      blocking: true,
    })
  }

  if (data.providersWithoutHours.length > 0) {
    issues.push({
      key: 'provider-without-hours',
      text: `Sem horário de trabalho: ${nameList(data.providersWithoutHours)}.`,
      href: '/equipe/jornada',
      blocking: true,
    })
  }

  if (data.pendingInvites.length > 0) {
    issues.push({
      key: 'pending-invite',
      text: `Ainda não entrou no app: ${nameList(data.pendingInvites)}.`,
      href: '/equipe/pessoas',
      blocking: false,
    })
  }

  return issues
}

export type SetupStepKey = 'services' | 'team' | 'assignments' | 'hours' | 'publish'

/**
 * 'now' é o único passo que pede ação; 'later' ainda depende do que está acima,
 * e 'optional' pode ser feito a qualquer hora — ou nunca.
 */
export type SetupStepState = 'done' | 'now' | 'later' | 'optional'

export type SetupStep = {
  key: SetupStepKey
  title: string
  text: string
  state: SetupStepState
  /** Ausente quando o passo não é uma tela, como divulgar o endereço. */
  action?: { href: string; label: string }
  /** O detalhe do momento: quantos são, quem ficou de fora. */
  note?: string
}

type Candidate = Omit<SetupStep, 'state'> & { done: boolean; optional?: boolean }

function stateOf(step: Candidate, index: number, current: number): SetupStepState {
  if (step.done) return 'done'
  if (step.optional) return 'optional'
  return index === current ? 'now' : 'later'
}

/**
 * O caminho inteiro de montagem, com o que já passou. A lista de pendências diz
 * o que falta, mas não a ordem: o dono de um salão novo descobria que serviço
 * vem antes de jornada dando uma volta pelo app.
 */
export function listSetupSteps(data: SetupData): SetupStep[] {
  const hasService = data.activeServices > 0
  const { servicesWithoutProvider, providersWithoutHours } = data

  const candidates: Candidate[] = [
    {
      key: 'services',
      title: 'Cadastre os serviços',
      text: 'É o que o cliente escolhe para começar. A duração em minutos define quantos horários o serviço ocupa.',
      action: { href: '/servicos', label: 'Abrir serviços' },
      done: hasService,
      note: hasService
        ? `${data.activeServices} ${data.activeServices === 1 ? 'serviço ativo' : 'serviços ativos'}.`
        : undefined,
    },
    {
      key: 'team',
      title: 'Convide quem atende com você',
      text: 'Ninguém se cadastra sozinho: você convida pelo e-mail e a pessoa recebe o link na hora. Se você atende sozinho, pule este passo.',
      action: { href: '/equipe/pessoas', label: 'Abrir equipe' },
      optional: true,
      done: data.activeProviders > 1,
      note:
        data.pendingInvites.length > 0
          ? `Ainda não entrou no app: ${nameList(data.pendingInvites)}.`
          : undefined,
    },
    {
      key: 'assignments',
      title: 'Marque quem executa cada serviço',
      text: 'Dentro do serviço você escolhe quem pode atender. Serviço sem ninguém marcado não aparece para o cliente.',
      action: { href: '/servicos', label: 'Abrir serviços' },
      done: hasService && servicesWithoutProvider.length === 0,
      note:
        servicesWithoutProvider.length > 0
          ? `Sem ninguém marcado para executar: ${nameList(servicesWithoutProvider)}.`
          : undefined,
    },
    {
      key: 'hours',
      title: 'Confira a jornada de cada um',
      text: 'Quem entra na equipe nasce com segunda a sábado, 9h–12h e 13h–18h. Sem jornada, a agenda não oferece nada ao cliente.',
      action: { href: '/equipe/jornada', label: 'Abrir jornada' },
      done: providersWithoutHours.length === 0,
      note:
        providersWithoutHours.length > 0
          ? `Sem horário de trabalho: ${nameList(providersWithoutHours)}.`
          : undefined,
    },
    {
      key: 'publish',
      title: 'Divulgue o endereço',
      text: 'Com os passos acima prontos, o cliente já consegue marcar. Só então vale mandar o endereço para fora.',
      done: false,
    },
  ]

  const current = candidates.findIndex((step) => !step.done && !step.optional)

  return candidates.map((candidate, index) => {
    const { done: _done, optional: _optional, ...step } = candidate
    return { ...step, state: stateOf(candidate, index, current) }
  })
}
