import type { FC } from 'hono/jsx'
import type { Provider } from '../../db/schema.ts'

export type EntrarEquipeProps = {
  next: string
  error?: string
  /** Quando o pedido foi aceito, a tela só confirma o envio. */
  sentTo?: string
}

/** A resposta é a mesma para e-mail da equipe e e-mail de fora: a tela não
 * confirma quem trabalha aqui. */
export const EntrarEquipe: FC<EntrarEquipeProps> = ({ next, error, sentTo }) => (
  <section id="entrar-equipe" hx-target="#entrar-equipe" hx-swap="outerHTML">
    <h2>Entrar</h2>
    {error ? <p class="error">{error}</p> : null}

    {sentTo ? (
      <div class="card service-form">
        <p>
          Se <strong>{sentTo}</strong> estiver na equipe deste salão, o link de acesso já foi
          enviado. Ele vale por 15 minutos.
        </p>
        <button type="button" class="btn ghost" hx-get={`/equipe/entrar?next=${next}`}>
          Usar outro e-mail
        </button>
      </div>
    ) : (
      <form class="card service-form" hx-post="/equipe/entrar">
        <p class="muted">Entre com o e-mail cadastrado no salão. Enviamos um link de acesso.</p>
        <input type="hidden" name="next" value={next} />
        <label>
          E-mail
          <input type="email" name="email" required autocomplete="email" />
        </label>
        <button type="submit" class="btn filled">
          Receber link
        </button>
      </form>
    )}
  </section>
)

export type PainelProps = {
  staff: Provider
  providers: Provider[]
}

export const Painel: FC<PainelProps> = ({ staff, providers }) => (
  <section id="painel">
    <h2>Agendas</h2>
    <ul class="people">
      {providers.map((p) => (
        <li key={p.id}>
          <a href={`/agenda/${p.id}`}>
            <span>
              {p.name}
              {p.id === staff.id ? ' · você' : ''}
            </span>
            <small>slots de {p.slotMinutes} min</small>
          </a>
          <a class="queue-link" href={`/pendentes/${p.id}`}>
            Pedidos aguardando
          </a>
        </li>
      ))}
    </ul>
  </section>
)
