import type { FC, PropsWithChildren } from 'hono/jsx'
import type { Company } from '../../db/schema.ts'
import { themeCss } from '../../domain/theme.ts'

type Props = PropsWithChildren<{ title: string; company: Company }>

/** O tema do salão entra como estilo na própria página: são poucas dezenas de
 * variáveis e evita uma requisição a mais antes da primeira pintura. */
export const Layout: FC<Props> = ({ title, company, children }) => (
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
          <h1>{company.name}</h1>
          <span>{title}</span>
        </div>
      </header>
      <main class="wrap">{children}</main>
    </body>
  </html>
)
