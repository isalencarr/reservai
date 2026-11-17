import type { FC } from 'hono/jsx'
import type { Provider } from '../../db/schema.ts'
import { formatPhone } from '../../domain/phone.ts'
import { NO, WIRE, YES } from '../wire.ts'
import { Icon } from './icon.tsx'

export type PeopleProps = {
  items: Provider[]
  me: Provider
  editing?: Provider
  error?: string
}

const Fields: FC<{ person?: Provider }> = ({ person }) => (
  <>
    <div class="fields">
      <label>
        Nome
        <input type="text" name={WIRE.name} required value={person?.name ?? ''} />
      </label>
      <label>
        E-mail
        <input
          type="email"
          name={WIRE.email}
          required
          autocomplete="email"
          placeholder="nome@salao.com.br"
          value={person?.email ?? ''}
        />
      </label>
      <label>
        Telefone com DDD
        <input
          type="tel"
          name={WIRE.phone}
          required
          inputmode="numeric"
          placeholder="(11) 98888-0001"
          value={person ? formatPhone(person.phone) : ''}
        />
      </label>
      <label>
        Papel
        <select name={WIRE.role}>
          <option value="provider" selected={person?.role !== 'owner'}>
            Prestador
          </option>
          <option value="owner" selected={person?.role === 'owner'}>
            Dono
          </option>
        </select>
      </label>
    </div>
    <div class="fields">
      <label>
        Slot (min)
        <input
          type="number"
          name={WIRE.slot}
          min="5"
          max="240"
          step="5"
          value={String(person?.slotMinutes ?? 60)}
        />
      </label>
      <label>
        Antecedência mínima (min)
        <input
          type="number"
          name={WIRE.leadMinutes}
          min="0"
          max="1440"
          step="15"
          value={String(person?.minLeadMinutes ?? 60)}
        />
      </label>
    </div>
  </>
)

const EditRow: FC<{ person: Provider; me: Provider; error?: string }> = ({ person, me, error }) => (
  <div class="overlay">
    <button type="button" class="overlay-bg" hx-get="/equipe/pessoas" aria-label="Fechar" />
    <div class="modal" role="dialog" aria-modal="true" aria-label={`Editar ${person.name}`}>
      <form class="service-form" hx-post={`/equipe/pessoas/${person.id}`}>
        <strong>{person.name}</strong>
        {error ? <p class="error">{error}</p> : null}
        <Fields person={person} />
        <div class="actions">
          <button type="submit" class="btn filled">
            Salvar
          </button>
          {person.active ? (
            <button
              type="button"
              class="btn ghost"
              hx-post={`/equipe/pessoas/${person.id}/convite`}
            >
              {person.joinedAt ? 'Enviar link de acesso' : 'Reenviar convite'}
            </button>
          ) : null}
          {person.id === me.id ? null : (
            <button
              type="button"
              class="btn danger"
              hx-post={`/equipe/pessoas/${person.id}/ativo`}
              hx-vals={JSON.stringify({ [WIRE.active]: person.active ? NO : YES })}
            >
              {person.active ? 'Tirar da equipe' : 'Trazer de volta'}
            </button>
          )}
          <button type="button" class="btn ghost" hx-get="/equipe/pessoas">
            Fechar
          </button>
        </div>
      </form>
    </div>
  </div>
)

export const People: FC<PeopleProps> = ({ items, me, editing, error }) => (
  <section id="people" hx-target="#people" hx-swap="outerHTML">
    <h2>Equipe</h2>
    <p class="muted">
      A pessoa entra pelo e-mail: ela recebe um link de acesso. A jornada já nasce de segunda a
      sábado, das 9h às 12h e das 13h às 18h.
    </p>

    <div class="catalog-layout">
      <form class="card service-form" hx-post="/equipe/pessoas">
        <strong>Nova pessoa</strong>
        {error && !editing ? <p class="error">{error}</p> : null}
        <Fields />
        <button type="submit" class="btn filled">
          <Icon name="add" />
          Adicionar
        </button>
      </form>

      <aside class="card catalog">
        <strong>Pessoas</strong>
        <ul>
          {items.map((person) => (
            <li key={person.id} class={person.active ? '' : 'off'}>
              <span>
                {person.name}
                {person.role === 'owner' ? ' · dono' : ''}
                {person.active && !person.joinedAt ? (
                  <small class="tag"> convite pendente</small>
                ) : null}
              </span>
              <button type="button" class="link" hx-get={`/equipe/pessoas?editar=${person.id}`}>
                editar
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>

    {editing ? <EditRow person={editing} me={me} error={error} /> : null}
  </section>
)
