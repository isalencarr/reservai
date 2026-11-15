import type { FC, PropsWithChildren } from 'hono/jsx'

type Props = PropsWithChildren<{ title: string; companyName: string }>

export const Layout: FC<Props> = ({ title, companyName, children }) => (
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{`${title} · ${companyName}`}</title>
      <link rel="stylesheet" href="/assets/app.css" />
      <script src="/assets/htmx.js" defer />
    </head>
    <body>
      <header class="app">
        <div class="wrap">
          <h1>{companyName}</h1>
          <span>{title}</span>
        </div>
      </header>
      <main class="wrap">{children}</main>
    </body>
  </html>
)
