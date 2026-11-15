import type { FC, PropsWithChildren } from 'hono/jsx'
import type { Company, Provider } from '../../db/schema.ts'

export type StaffSection =
  | 'agendas'
  | 'pedidos'
  | 'horarios'
  | 'servicos'
  | 'clientes'
  | 'pessoas'
  | 'acessos'

type Item = { key: StaffSection; label: string; href: string; ownerOnly?: boolean }

function items(staff: Provider): Item[] {
  return [
    {
      key: 'agendas',
      label: staff.role === 'owner' ? 'Agendas' : 'Minha agenda',
      href: staff.role === 'owner' ? '/equipe' : `/agenda/${staff.id}`,
    },
    { key: 'pedidos', label: 'Pedidos', href: `/pendentes/${staff.id}` },
    { key: 'horarios', label: 'Horários', href: '/horarios' },
    { key: 'servicos', label: 'Serviços', href: '/servicos', ownerOnly: true },
    { key: 'clientes', label: 'Clientes', href: '/clientes', ownerOnly: true },
    { key: 'pessoas', label: 'Equipe', href: '/equipe/pessoas', ownerOnly: true },
    { key: 'acessos', label: 'Acessos', href: '/equipe/acessos', ownerOnly: true },
  ].filter((item) => !item.ownerOnly || staff.role === 'owner') as Item[]
}

type Props = PropsWithChildren<{
  title: string
  company: Company
  staff: Provider
  active: StaffSection
}>

/** Toda tela interna usa este layout: sem o menu, cada página vira um beco sem
 * saída e só se chega nela pela barra de endereço. */
export const StaffLayout: FC<Props> = ({ title, company, staff, active, children }) => (
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{`${title} · ${company.name}`}</title>
      <link rel="stylesheet" href="/assets/app.css" />
      <script src="/assets/htmx.js" defer />
    </head>
    <body>
      <header class="app">
        <div class="wrap">
          <h1>{company.name}</h1>
          <span>
            {staff.name}
            {staff.role === 'owner' ? ' · dono' : ''}
          </span>
          <form class="signout" hx-post="/equipe/sair">
            <button type="submit" class="link">
              sair
            </button>
          </form>
        </div>
        <nav class="menu">
          <div class="menu-items">
            {items(staff).map((item) => (
              <a
                key={item.key}
                href={item.href}
                class={item.key === active ? 'on' : ''}
                aria-current={item.key === active ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>
      </header>
      <main class="wrap">{children}</main>
    </body>
  </html>
)
