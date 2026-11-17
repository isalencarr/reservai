import type { FC } from 'hono/jsx'
import { formatPhone } from '../../domain/phone.ts'
import { WIRE } from '../wire.ts'

export type EntrarProps = {
  next: string
  error?: string
  /** Telefone já informado: a tela passa a pedir o código. */
  phone?: string
}

export const Entrar: FC<EntrarProps> = ({ next, error, phone }) => (
  <section id="login" hx-target="#login" hx-swap="outerHTML">
    <h2>{phone ? 'Confirme o código' : 'Seus dados'}</h2>

    {error ? <p class="error">{error}</p> : null}

    {phone ? (
      <form class="card service-form" hx-post="/entrar/codigo">
        <p class="muted">Enviamos um código para {formatPhone(phone)}. Ele vale por 10 minutes.</p>
        <input type="hidden" name={WIRE.phone} value={phone} />
        <input type="hidden" name={WIRE.next} value={next} />
        <label>
          Código
          <input
            type="text"
            name={WIRE.code}
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength={6}
            required
          />
        </label>
        <div class="actions">
          <button type="submit" class="btn filled">
            Entrar
          </button>
          <button type="button" class="btn ghost" hx-get={`/entrar?next=${next}`}>
            Trocar o número
          </button>
        </div>
      </form>
    ) : (
      <form class="card service-form" hx-post="/entrar">
        <p class="muted">Precisamos do seu nome e telefone para guardar o agendamento.</p>
        <input type="hidden" name={WIRE.next} value={next} />
        <label>
          Nome
          <input type="text" name={WIRE.name} required autocomplete="name" />
        </label>
        <label>
          Telefone com DDD
          <input
            type="tel"
            name={WIRE.phone}
            required
            inputmode="numeric"
            autocomplete="tel"
            placeholder="(11) 98888-0001"
          />
        </label>
        <button type="submit" class="btn filled">
          Receber código
        </button>
      </form>
    )}
  </section>
)
