import type { FC } from 'hono/jsx'
import type { Provider } from '../../db/schema.ts'
import { WIRE } from '../wire.ts'
import { Icon } from './icon.tsx'

export type StaffLoginProps = {
  next: string
  error?: string
  /** Quando o pedido foi aceito, a tela só confirma o envio. */
  sentTo?: string
}

/** A resposta é a mesma para e-mail da equipe e e-mail de fora: a tela não
 * confirma quem trabalha aqui. */
export const StaffLogin: FC<StaffLoginProps> = ({ next, error, sentTo }) => (
  <section id="staff-login" hx-target="#staff-login" hx-swap="outerHTML">
    <h2>Entrar</h2>
    {error ? <p class="error">{error}</p> : null}

    {sentTo ? (
      <div class="card service-form">
        <p>
          Se <strong>{sentTo}</strong> estiver na equipe deste negócio, o link de acesso já foi
          enviado. Ele vale por 15 minutos.
        </p>
        <button type="button" class="btn ghost" hx-get={`/equipe/entrar?next=${next}`}>
          Usar outro e-mail
        </button>
      </div>
    ) : (
      <form class="card service-form" hx-post="/equipe/entrar">
        <p class="muted">Entre com o e-mail cadastrado no negócio. Enviamos um link de acesso.</p>
        <input type="hidden" name={WIRE.next} value={next} />
        <label>
          E-mail
          <input type="email" name={WIRE.email} required autocomplete="email" />
        </label>
        <button type="submit" class="btn filled">
          <Icon name="mail" />
          Receber link
        </button>
      </form>
    )}
  </section>
)

export type TeamPanelProps = {
  staff: Provider
  providers: Provider[]
  /** Pedidos esperando resposta em cada agenda. */
  pending: Record<string, number>
}

export const TeamPanel: FC<TeamPanelProps> = ({ staff, providers, pending }) => (
  <section id="panel">
    <div class="hero">
      <Icon name="calendar_month" class="hero-icon" />
      <strong>
        {providers.length} {providers.length === 1 ? 'agenda' : 'agendas'}
      </strong>
      <span class="hero-sub">escolha de quem você quer ver o dia</span>
    </div>
    <ul class="people">
      {providers.map((p) => (
        <li key={p.id}>
          <a class="item" href={`/agenda/${p.id}`}>
            <Icon name="person" class="avatar" />
            <span class="text">
              <span>
                {p.name}
                {p.id === staff.id ? ' · você' : ''}
              </span>
              <small>slots de {p.slotMinutes} min</small>
            </span>
            <Icon name="chevron_right" />
          </a>
          <a
            class={`side ${pending[p.id] ? 'alert' : ''}`}
            href={`/pendentes/${p.id}`}
            title={`Pedidos de ${p.name}`}
          >
            <Icon name="pending_actions" class="big" />
            <span>{pending[p.id] ?? 0}</span>
          </a>
        </li>
      ))}
    </ul>
  </section>
)
