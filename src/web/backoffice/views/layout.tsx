import type { FC, PropsWithChildren } from 'hono/jsx'
import type { PlatformAdmin } from '../../../db/schema.ts'
import { themeCss } from '../../../domain/theme.ts'
import { Icon } from '../../views/icon.tsx'

export type BackofficeSection = 'saloes'

type Item = { key: BackofficeSection; label: string; href: string; icon: string }

const ITEMS: Item[] = [{ key: 'saloes', label: 'Salões', href: '/', icon: 'storefront' }]

/** Cor fixa e diferente da que os salões usam por padrão: é o que te diz, de
 * olho, que a tela aberta é a da plataforma e não a de um cliente. */
const SEED = '#4A5B6B'

type Props = PropsWithChildren<{
  title: string
  admin?: PlatformAdmin
  active?: BackofficeSection
}>

export const BackofficeLayout: FC<Props> = ({ title, admin, active, children }) => (
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{`${title} · backoffice`}</title>
      <style dangerouslySetInnerHTML={{ __html: themeCss(SEED, 'auto') }} />
      <link rel="stylesheet" href="/assets/app.css" />
      <script src="/assets/htmx.js" defer />
    </head>
    <body>
      <header class="app">
        <div class="wrap">
          <h1>
            <Icon name="shield_person" />
            backoffice
          </h1>
          <span>{admin ? admin.name : title}</span>
          {admin ? (
            <form class="signout" hx-post="/sair">
              <button type="submit" class="link">
                <Icon name="logout" />
                sair
              </button>
            </form>
          ) : null}
        </div>
        {admin ? (
          <nav class="menu">
            <div class="menu-items">
              {ITEMS.map((item) => (
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
        ) : null}
      </header>
      <main class="wrap">{children}</main>
    </body>
  </html>
)
