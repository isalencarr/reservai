import type { FC } from 'hono/jsx'
import type { Provider } from '../../db/schema.ts'
import { formatPhone } from '../../domain/phone.ts'

export type EntrarEquipeProps = {
  next: string
  error?: string
  phone?: string
}

export const EntrarEquipe: FC<EntrarEquipeProps> = ({ next, error, phone }) => (
  <section id="entrar-equipe" hx-target="#entrar-equipe" hx-swap="outerHTML">
    <h2>Área da equipe</h2>
    {error ? <p class="error">{error}</p> : null}

    {phone ? (
      <form class="card service-form" hx-post="/equipe/entrar/codigo">
        <p class="muted">
          Se {formatPhone(phone)} for de alguém da equipe, o código chegou por mensagem.
        </p>
        <input type="hidden" name="telefone" value={phone} />
        <input type="hidden" name="next" value={next} />
        <label>
          Código
          <input
            type="text"
            name="codigo"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength={6}
            required
          />
        </label>
        <div class="actions">
          <button type="submit" class="btn">
            Entrar
          </button>
          <button type="button" class="btn ghost" hx-get={`/equipe/entrar?next=${next}`}>
            Trocar o número
          </button>
        </div>
      </form>
    ) : (
      <form class="card service-form" hx-post="/equipe/entrar">
        <p class="muted">Entre com o telefone cadastrado no salão.</p>
        <input type="hidden" name="next" value={next} />
        <label>
          Telefone com DDD
          <input type="tel" name="telefone" required inputmode="numeric" autocomplete="tel" />
        </label>
        <button type="submit" class="btn">
          Receber código
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
    <div class="daybar">
      <div class="today">
        <strong>Equipe</strong>
        <span>
          {staff.name}
          {staff.role === 'owner' ? ' · dono' : ''}
        </span>
      </div>
      <form hx-post="/equipe/sair">
        <button type="submit" class="btn ghost">
          Sair
        </button>
      </form>
    </div>

    {staff.role === 'owner' ? (
      <p class="muted">
        <a href="/equipe/pessoas">Equipe</a>
        {' · '}
        <a href="/servicos">Catálogo de serviços</a>
        {' · '}
        <a href="/clientes">Carteira de clientes</a>
        {' · '}
        <a href="/horarios">Conferir horários</a>
      </p>
    ) : null}

    <h2>Agendas</h2>
    <ul class="people">
      {providers.map((p) => (
        <li key={p.id}>
          <a href={`/agenda/${p.id}`}>
            <span>{p.name}</span>
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
