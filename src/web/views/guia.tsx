import type { FC } from 'hono/jsx'
import type { Company, Provider } from '../../db/schema.ts'
import { type Pendencia, prontoParaDivulgar } from '../../domain/setup.ts'
import { STAFF_PREFIX } from '../tenant.ts'
import { Icon } from './icon.tsx'

export type GuiaProps = {
  company: Company
  staff: Provider
  pendencias: Pendencia[]
}

type Secao = {
  titulo: string
  icone: string
  href?: string
  linhas: string[]
  ownerOnly?: boolean
}

/** O guia é a explicação do app em ordem de uso, não a lista de telas: primeiro
 * o que o cliente vê, porque é dali que vem todo o resto. */
const secoesPara = (staff: Provider): Secao[] => [
  {
    titulo: 'Como o cliente marca',
    icone: 'event_available',
    linhas: [
      'O cliente entra com nome e telefone e confirma um código de 6 dígitos. Não existe senha.',
      'Ele escolhe o serviço, depois o profissional, o dia e a hora. Só aparecem horários em que o serviço inteiro cabe na jornada e nada está ocupado.',
      'O pedido fica esperando resposta e já segura o horário. O prazo para responder é o menor entre 24 horas e uma hora antes do atendimento; passado o prazo, o pedido expira e o horário volta a ser oferecido.',
      'O cliente cancela sozinho até 2 horas antes. Depois disso, só pelo salão.',
    ],
  },
  {
    titulo: 'Pedidos',
    icone: 'pending_actions',
    href: `/pendentes/${staff.id}`,
    linhas: [
      'É aqui que o pedido do cliente é confirmado ou recusado. Recusar não exige motivo.',
      'Enquanto o pedido está esperando, o horário já está ocupado para os outros clientes.',
    ],
  },
  {
    titulo: staff.role === 'owner' ? 'Agendas' : 'Minha agenda',
    icone: 'calendar_month',
    href: staff.role === 'owner' ? '/equipe' : `/agenda/${staff.id}`,
    linhas: [
      'O dia de cada profissional, hora por hora. O dono abre a agenda de qualquer um; quem atende abre a sua.',
      'Horário vendido fora do app, almoço e imprevisto entram como bloqueio manual e ocupam a agenda do mesmo jeito.',
    ],
  },
  {
    titulo: 'Horários',
    icone: 'schedule',
    href: '/horarios',
    linhas: [
      'Mostra os horários livres de um serviço num dia, do mesmo jeito que o cliente vê. Serve para responder quem liga.',
      'Nada é marcado aqui: é consulta. Quem muda a jornada é a tela de Jornada.',
    ],
  },
  {
    titulo: 'Jornada',
    icone: 'event_repeat',
    href: '/equipe/jornada',
    ownerOnly: true,
    linhas: [
      'O horário de trabalho de cada pessoa, por dia da semana. Duas faixas no mesmo dia deixam o almoço de fora.',
      'Dia sem faixa nenhuma é folga. Sem jornada, a agenda não oferece nada ao cliente — é o primeiro lugar onde alguém acha que o app está quebrado.',
    ],
  },
  {
    titulo: 'Serviços',
    icone: 'content_cut',
    href: '/servicos',
    ownerOnly: true,
    linhas: [
      'Nome, duração em minutos e preço. A duração é o que define quantos horários o serviço consome.',
      'Em cada serviço você marca quem executa. Serviço sem ninguém marcado não aparece para o cliente.',
    ],
  },
  {
    titulo: 'Clientes',
    icone: 'group',
    href: '/clientes',
    ownerOnly: true,
    linhas: [
      'A carteira é do salão, não de quem atende: quem atende vê o nome e o horário, nunca o contato.',
      'O cadastro nasce sozinho quando o cliente se identifica pela primeira vez.',
    ],
  },
  {
    titulo: 'Equipe',
    icone: 'badge',
    href: '/equipe/pessoas',
    ownerOnly: true,
    linhas: [
      'Ninguém se cadastra sozinho: você convida pelo e-mail e a pessoa recebe o link de acesso na hora.',
      'Quem entra já nasce com jornada de segunda a sábado, 9h–12h e 13h–18h, e você ajusta depois.',
      'Dono mexe em tudo; quem atende mexe na própria agenda e na própria fila de pedidos.',
    ],
  },
  {
    titulo: 'Acessos',
    icone: 'shield_person',
    href: '/equipe/acessos',
    ownerOnly: true,
    linhas: [
      'Toda entrada, saída e tentativa recusada fica registrada, com e-mail e IP parcialmente escondidos.',
      'Acesso aberto por quem cuida da plataforma aparece aqui marcado como suporte.',
    ],
  },
  {
    titulo: 'Aparência',
    icone: 'palette',
    href: '/equipe/aparencia',
    ownerOnly: true,
    linhas: [
      'Escolha uma cor e o tom (claro, escuro ou automático). A paleta inteira é gerada a partir dela.',
      'A mudança vale para as suas telas e para as do cliente.',
    ],
  },
]

const Checklist: FC<{ pendencias: Pendencia[] }> = ({ pendencias }) => (
  <ul class="people">
    {pendencias.map((p) => (
      <li key={p.key}>
        <a class="item" href={p.href}>
          <Icon name={p.bloqueia ? 'event_busy' : 'mail'} class="avatar" />
          <span class="text">
            <span>{p.texto}</span>
            <small>{p.bloqueia ? 'o cliente não consegue marcar' : 'não impede de marcar'}</small>
          </span>
          <Icon name="chevron_right" />
        </a>
      </li>
    ))}
  </ul>
)

export const Guia: FC<GuiaProps> = ({ company, staff, pendencias }) => {
  const dono = staff.role === 'owner'
  const pronto = prontoParaDivulgar(pendencias)
  const secoes = secoesPara(staff).filter((s) => dono || !s.ownerOnly)

  return (
    <section id="guia">
      <h2>Guia</h2>

      {dono ? (
        <>
          <h3>O que falta configurar</h3>
          {pendencias.length === 0 ? (
            <p class="empty">Está tudo configurado.</p>
          ) : (
            <Checklist pendencias={pendencias} />
          )}

          {pronto ? (
            <div class="card">
              <strong>Pronto para divulgar</strong>
              <p class="muted">
                Mande este endereço para os seus clientes: <strong>{company.host}</strong>. Sua
                equipe entra por {STAFF_PREFIX}
                {company.host} — esse não vai para o cliente.
              </p>
            </div>
          ) : (
            <p class="muted">
              Enquanto houver item acima, o cliente que abrir {company.host} não vai achar horário
              para marcar.
            </p>
          )}
        </>
      ) : null}

      <h3>Como funciona cada parte</h3>
      {secoes.map((secao) => (
        <div class="card" key={secao.titulo}>
          <strong>
            <Icon name={secao.icone} /> {secao.titulo}
          </strong>
          {secao.linhas.map((linha) => (
            <p class="muted" key={linha}>
              {linha}
            </p>
          ))}
          {secao.href ? (
            <a class="link" href={secao.href}>
              Abrir {secao.titulo.toLowerCase()}
              <Icon name="chevron_right" />
            </a>
          ) : null}
        </div>
      ))}
    </section>
  )
}
