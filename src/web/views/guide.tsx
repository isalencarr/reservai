import type { FC } from 'hono/jsx'
import type { Company, Provider } from '../../db/schema.ts'
import type { SetupStep, SetupStepState } from '../../domain/setup.ts'
import { STAFF_PREFIX } from '../tenant.ts'
import { Icon } from './icon.tsx'

export type GuideProps = {
  company: Company
  staff: Provider
  steps: SetupStep[]
}

type Section = {
  title: string
  icon: string
  href?: string
  lines: string[]
  ownerOnly?: boolean
}

/** O guia é a explicação do app em ordem de uso, não a lista de telas: primeiro
 * o que o cliente vê, porque é dali que vem todo o resto. */
const sectionsFor = (staff: Provider): Section[] => [
  {
    title: 'Como o cliente marca',
    icon: 'event_available',
    lines: [
      'O cliente entra com nome e telefone e confirma um código de 6 dígitos. Não existe senha.',
      'Ele escolhe o serviço, depois o profissional, o dia e a hora. Só aparecem horários em que o serviço inteiro cabe na jornada e nada está ocupado.',
      'O pedido fica esperando resposta e já segura o horário. O prazo para responder é o menor entre 24 horas e uma hora antes do atendimento; passado o prazo, o pedido expira e o horário volta a ser oferecido.',
      'O cliente cancela sozinho até 2 horas antes. Depois disso, só pelo salão.',
    ],
  },
  {
    title: 'Pedidos',
    icon: 'pending_actions',
    href: `/pendentes/${staff.id}`,
    lines: [
      'É aqui que o pedido do cliente é confirmado ou recusado. Recusar não exige motivo.',
      'Enquanto o pedido está esperando, o horário já está ocupado para os outros clientes.',
    ],
  },
  {
    title: staff.role === 'owner' ? 'Agendas' : 'Minha agenda',
    icon: 'calendar_month',
    href: staff.role === 'owner' ? '/equipe' : `/agenda/${staff.id}`,
    lines: [
      'O dia de cada profissional, hora por hora. O dono abre a agenda de qualquer um; quem atende abre a sua.',
      'Horário vendido fora do app, almoço e imprevisto entram como bloqueio manual e ocupam a agenda do mesmo jeito.',
    ],
  },
  {
    title: 'Horários',
    icon: 'schedule',
    href: '/horarios',
    lines: [
      'Mostra os horários livres de um serviço num dia, do mesmo jeito que o cliente vê. Serve para responder quem liga.',
      'Nada é marcado aqui: é consulta. Quem muda a jornada é a tela de Jornada.',
    ],
  },
  {
    title: 'Jornada',
    icon: 'event_repeat',
    href: '/equipe/jornada',
    ownerOnly: true,
    lines: [
      'O horário de trabalho de cada pessoa, por dia da semana. Duas faixas no mesmo dia deixam o almoço de fora.',
      'Dia sem faixa nenhuma é folga. Sem jornada, a agenda não oferece nada ao cliente — é o primeiro lugar onde alguém acha que o app está quebrado.',
    ],
  },
  {
    title: 'Serviços',
    icon: 'content_cut',
    href: '/servicos',
    ownerOnly: true,
    lines: [
      'Nome, duração em minutos e preço. A duração é o que define quantos horários o serviço consome.',
      'Em cada serviço você marca quem executa. Serviço sem ninguém marcado não aparece para o cliente.',
    ],
  },
  {
    title: 'Clientes',
    icon: 'group',
    href: '/clientes',
    ownerOnly: true,
    lines: [
      'A carteira é do salão, não de quem atende: quem atende vê o nome e o horário, nunca o contato.',
      'O cadastro nasce sozinho quando o cliente se identifica pela primeira vez.',
    ],
  },
  {
    title: 'Equipe',
    icon: 'badge',
    href: '/equipe/pessoas',
    ownerOnly: true,
    lines: [
      'Ninguém se cadastra sozinho: você convida pelo e-mail e a pessoa recebe o link de acesso na hora.',
      'Quem entra já nasce com jornada de segunda a sábado, 9h–12h e 13h–18h, e você ajusta depois.',
      'Dono mexe em tudo; quem atende mexe na própria agenda e na própria fila de pedidos.',
    ],
  },
  {
    title: 'Acessos',
    icon: 'shield_person',
    href: '/equipe/acessos',
    ownerOnly: true,
    lines: [
      'Toda entrada, saída e tentativa recusada fica registrada, com e-mail e IP parcialmente escondidos.',
      'Acesso aberto por quem cuida da plataforma aparece aqui marcado como suporte.',
    ],
  },
  {
    title: 'Aparência',
    icon: 'palette',
    href: '/equipe/aparencia',
    ownerOnly: true,
    lines: [
      'Escolha uma cor e o tom (claro, escuro ou automático). A paleta inteira é gerada a partir dela.',
      'A mudança vale para as suas telas e para as do cliente.',
    ],
  },
]

const STATE_LABEL: Record<SetupStepState, string> = {
  done: 'feito',
  now: 'agora',
  later: 'depois',
  optional: 'quando quiser',
}

/** O passo a passo é um caminho, não uma lista de tarefas soltas: o passo feito
 * continua à vista para o dono saber onde está. */
const Steps: FC<{ steps: SetupStep[]; company: Company }> = ({ steps, company }) => (
  <ol class="steps">
    {steps.map((step, index) => (
      <li class={`step ${step.state}`} key={step.key}>
        <span class="mark" aria-hidden="true">
          {step.state === 'done' ? <Icon name="check" /> : index + 1}
        </span>
        <div class="body">
          <strong>
            {step.title}
            <span class="tag">{STATE_LABEL[step.state]}</span>
          </strong>
          <p class="muted">{step.text}</p>
          {step.note ? <p class="note">{step.note}</p> : null}
          {step.key === 'publish' && step.state === 'now' ? (
            <p class="note">
              Mande este endereço para os seus clientes: <strong>{company.host}</strong>. Sua equipe
              entra por {STAFF_PREFIX}
              {company.host} — esse não vai para o cliente.
            </p>
          ) : null}
          {step.action && step.state !== 'later' ? (
            <a class="link" href={step.action.href}>
              {step.action.label}
              <Icon name="chevron_right" />
            </a>
          ) : null}
        </div>
      </li>
    ))}
  </ol>
)

export const Guide: FC<GuideProps> = ({ company, staff, steps }) => {
  const isOwner = staff.role === 'owner'
  const sections = sectionsFor(staff).filter((section) => isOwner || !section.ownerOnly)

  return (
    <section id="guide">
      <h2>Guia</h2>

      {isOwner ? (
        <>
          <h3>Montar o salão</h3>
          <p class="muted intro">
            Nesta ordem: cada passo depende do de cima. Enquanto faltar um deles, o cliente que
            abrir {company.host} não vai achar horário para marcar.
          </p>
          <Steps steps={steps} company={company} />
        </>
      ) : null}

      <h3>Como funciona cada parte</h3>
      {sections.map((section) => (
        <div class="card" key={section.title}>
          <strong>
            <Icon name={section.icon} /> {section.title}
          </strong>
          {section.lines.map((line) => (
            <p class="muted" key={line}>
              {line}
            </p>
          ))}
          {section.href ? (
            <a class="link" href={section.href}>
              Abrir {section.title.toLowerCase()}
              <Icon name="chevron_right" />
            </a>
          ) : null}
        </div>
      ))}
    </section>
  )
}
