import type { FC } from 'hono/jsx'
import { Icon } from '../../views/icon.tsx'
import { WIRE } from '../../wire.ts'

export type EntrarProps = {
  next: string
  error?: string
  /** Quando o pedido foi aceito, a tela só confirma o envio. */
  sentTo?: string
}

/** A resposta é igual para e-mail da lista e e-mail de fora: a tela não conta
 * quem administra a plataforma. */
export const BackofficeLogin: FC<EntrarProps> = ({ next, error, sentTo }) => (
  <section id="backoffice-login" hx-target="#backoffice-login" hx-swap="outerHTML">
    <h2>Entrar</h2>
    {error ? <p class="error">{error}</p> : null}

    {sentTo ? (
      <div class="card service-form">
        <p>
          Se <strong>{sentTo}</strong> administrar a plataforma, o link de acesso já foi enviado.
          Ele vale por 15 minutos.
        </p>
        <button type="button" class="btn ghost" hx-get={`/entrar?next=${next}`}>
          Usar outro e-mail
        </button>
      </div>
    ) : (
      <form class="card service-form" hx-post="/entrar">
        <p class="muted">Enviamos um link de acesso para o e-mail da plataforma.</p>
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
