import type { FC, PropsWithChildren } from 'hono/jsx'
import type { Company, Provider, SupportSession } from '../../db/schema.ts'
import { themeCss } from '../../domain/theme.ts'
import { formatTime } from '../../domain/time.ts'
import { Icon } from './icon.tsx'

export type StaffSection =
  | 'agendas'
  | 'pedidos'
  | 'horarios'
  | 'servicos'
  | 'clientes'
  | 'pessoas'
  | 'acessos'
  | 'aparencia'

type Item = {
  key: StaffSection
  label: string
  href: string
  icon: string
  ownerOnly?: boolean
}

/** No suporte o menu encurta: carteira, equipe, acessos e aparência ficam
 * fora, porque são dados pessoais do salão ou escrita que seria recusada. */
function items(staff: Provider, support: boolean): Item[] {
  return todosOsItens(staff).filter(
    (item) => !support || ['agendas', 'pedidos', 'horarios', 'servicos'].includes(item.key),
  )
}

function todosOsItens(staff: Provider): Item[] {
  return [
    {
      key: 'agendas',
      label: staff.role === 'owner' ? 'Agendas' : 'Minha agenda',
      href: staff.role === 'owner' ? '/equipe' : `/agenda/${staff.id}`,
      icon: 'calendar_month',
    },
    { key: 'pedidos', label: 'Pedidos', href: `/pendentes/${staff.id}`, icon: 'pending_actions' },
    { key: 'horarios', label: 'Horários', href: '/horarios', icon: 'schedule' },
    {
      key: 'servicos',
      label: 'Serviços',
      href: '/servicos',
      icon: 'content_cut',
      ownerOnly: true,
    },
    { key: 'clientes', label: 'Clientes', href: '/clientes', icon: 'group', ownerOnly: true },
    {
      key: 'pessoas',
      label: 'Equipe',
      href: '/equipe/pessoas',
      icon: 'badge',
      ownerOnly: true,
    },
    {
      key: 'acessos',
      label: 'Acessos',
      href: '/equipe/acessos',
      icon: 'shield_person',
      ownerOnly: true,
    },
    {
      key: 'aparencia',
      label: 'Aparência',
      href: '/equipe/aparencia',
      icon: 'palette',
      ownerOnly: true,
    },
  ].filter((item) => !item.ownerOnly || staff.role === 'owner') as Item[]
}

type Props = PropsWithChildren<{
  title: string
  company: Company
  staff: Provider
  active: StaffSection
  /** Presente quando quem está vendo é o suporte da plataforma, não a equipe. */
  support?: SupportSession | undefined
}>

/** Toda tela interna usa este layout: sem o menu, cada página vira um beco sem
 * saída e só se chega nela pela barra de endereço. */
export const StaffLayout: FC<Props> = ({ title, company, staff, active, support, children }) => (
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{`${title} · ${company.name}`}</title>
      {/* O CSS é gerado pelo servidor a partir de uma cor da nossa lista. */}
      <style dangerouslySetInnerHTML={{ __html: themeCss(company.themeSeed, company.themeMode) }} />
      <link rel="stylesheet" href="/assets/app.css" />
      <script src="/assets/htmx.js" defer />
    </head>
    <body>
      <header class="app">
        <div class="wrap">
          <h1>
            <Icon name="storefront" />
            {company.name}
          </h1>
          <span>
            {support ? `suporte · como ${staff.name}` : staff.name}
            {!support && staff.role === 'owner' ? ' · dono' : ''}
          </span>
          <form class="signout" hx-post="/equipe/sair">
            <button type="submit" class="link">
              <Icon name="logout" />
              sair
            </button>
          </form>
        </div>
        <nav class="menu">
          <div class="menu-items">
            {items(staff, support !== undefined).map((item) => (
              <a
                key={item.key}
                href={item.href}
                class={`menu-link ${item.key === active ? 'on' : ''}`}
                aria-current={item.key === active ? 'page' : undefined}
              >
                <Icon name={item.icon} />
                {item.label}
              </a>
            ))}
          </div>
        </nav>
      </header>
      <main class="wrap">
        {/* O aviso sai do próprio salão, então toda tela interna o mostra sem
            cada rota precisar lembrar de passar. */}
        {support ? (
          <p class="error">
            Acesso de suporte a {company.name}: você vê o salão como o dono vê, sem a carteira de
            clientes nem os dados da equipe, e sem poder alterar nada. Vence às{' '}
            {formatTime(support.expiresAt, company.timezone)}.
          </p>
        ) : null}
        {company.status === 'suspended' ? (
          <p class="error">
            Salão suspenso: o cliente não consegue marcar horário novo. O que já está confirmado
            segue na agenda.
          </p>
        ) : null}
        {children}
      </main>
    </body>
  </html>
)
