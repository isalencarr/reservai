import type { FC } from 'hono/jsx'
import type { AuthEvent } from '../../db/schema.ts'
import { formatWhen } from '../../domain/time.ts'

export type AccessLogProps = {
  items: AuthEvent[]
  timeZone: string
}

const LABEL: Record<AuthEvent['type'], string> = {
  login: 'entrou',
  logout: 'saiu',
  login_failed: 'tentativa recusada',
  support: 'suporte da plataforma',
}

export const AccessLog: FC<AccessLogProps> = ({ items, timeZone }) => (
  <section id="access-log">
    <h2>Acessos</h2>
    <p class="muted">
      E-mail e IP ficam parcialmente escondidos: dá para investigar um acesso estranho sem guardar o
      dado inteiro. Acesso aberto por quem cuida da plataforma aparece como suporte.
    </p>

    {items.length === 0 ? (
      <p class="empty">Nenhum acesso registrado ainda.</p>
    ) : (
      <ul class="history">
        {items.map((item) => (
          <li
            key={item.id}
            class={item.type === 'login_failed' || item.type === 'support' ? 'bad' : ''}
          >
            <span>
              {LABEL[item.type]} · {item.emailMasked || 'sem e-mail'}
            </span>
            <span class="detail">
              {formatWhen(item.createdAt, timeZone)} · {item.ip || 'IP desconhecido'}
              {item.reason ? ` · ${item.reason}` : ''}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
)
