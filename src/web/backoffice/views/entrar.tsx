import type { FC } from 'hono/jsx'
import { Icon } from '../../views/icon.tsx'

export type EntrarProps = {
  next: string
  error?: string
  /** Quando o pedido foi aceito, a tela só confirma o envio. */
  sentTo?: string
}

/** A resposta é igual para e-mail da lista e e-mail de fora: a tela não conta
 * quem administra a plataforma. */
export const EntrarBackoffice: FC<EntrarProps> = ({ next, error, sentTo }) => (
  <section id="entrar-backoffice" hx-target="#entrar-backoffice" hx-swap="outerHTML">
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
        <input type="hidden" name="next" value={next} />
        <label>
          E-mail
          <input type="email" name="email" required autocomplete="email" />
        </label>
        <button type="submit" class="btn filled">
          <Icon name="mail" />
          Receber link
        </button>
      </form>
    )}
  </section>
)
