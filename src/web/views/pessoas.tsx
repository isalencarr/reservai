import type { FC } from 'hono/jsx'
import type { Provider } from '../../db/schema.ts'
import { formatPhone } from '../../domain/phone.ts'

export type PessoasProps = {
  items: Provider[]
  me: Provider
  editing?: Provider
  error?: string
}

const Campos: FC<{ pessoa?: Provider }> = ({ pessoa }) => (
  <>
    <div class="fields">
      <label>
        Nome
        <input type="text" name="nome" required value={pessoa?.name ?? ''} />
      </label>
      <label>
        E-mail
        <input
          type="email"
          name="email"
          required
          autocomplete="email"
          placeholder="nome@salao.com.br"
          value={pessoa?.email ?? ''}
        />
      </label>
      <label>
        Telefone com DDD
        <input
          type="tel"
          name="telefone"
          required
          inputmode="numeric"
          placeholder="(11) 98888-0001"
          value={pessoa ? formatPhone(pessoa.phone) : ''}
        />
      </label>
      <label>
        Papel
        <select name="papel">
          <option value="provider" selected={pessoa?.role !== 'owner'}>
            Prestador
          </option>
          <option value="owner" selected={pessoa?.role === 'owner'}>
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
          name="slot"
          min="5"
          max="240"
          step="5"
          value={String(pessoa?.slotMinutes ?? 60)}
        />
      </label>
      <label>
        Antecedência mínima (min)
        <input
          type="number"
          name="antecedencia"
          min="0"
          max="1440"
          step="15"
          value={String(pessoa?.minLeadMinutes ?? 60)}
        />
      </label>
    </div>
  </>
)

const Editar: FC<{ pessoa: Provider; me: Provider; error?: string }> = ({ pessoa, me, error }) => (
  <div class="overlay">
    <button type="button" class="overlay-bg" hx-get="/equipe/pessoas" aria-label="Fechar" />
    <div class="modal" role="dialog" aria-modal="true" aria-label={`Editar ${pessoa.name}`}>
      <form class="service-form" hx-post={`/equipe/pessoas/${pessoa.id}`}>
        <strong>{pessoa.name}</strong>
        {error ? <p class="error">{error}</p> : null}
        <Campos pessoa={pessoa} />
        <div class="actions">
          <button type="submit" class="btn">
            Salvar
          </button>
          {pessoa.active ? (
            <button
              type="button"
              class="btn ghost"
              hx-post={`/equipe/pessoas/${pessoa.id}/convite`}
            >
              {pessoa.joinedAt ? 'Enviar link de acesso' : 'Reenviar convite'}
            </button>
          ) : null}
          {pessoa.id === me.id ? null : (
            <button
              type="button"
              class="btn danger"
              hx-post={`/equipe/pessoas/${pessoa.id}/ativo`}
              hx-vals={JSON.stringify({ ativo: pessoa.active ? 'nao' : 'sim' })}
            >
              {pessoa.active ? 'Tirar da equipe' : 'Trazer de volta'}
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

export const Pessoas: FC<PessoasProps> = ({ items, me, editing, error }) => (
  <section id="pessoas" hx-target="#pessoas" hx-swap="outerHTML">
    <h2>Equipe</h2>
    <p class="muted">
      A pessoa entra pelo e-mail: ela recebe um link de acesso. A jornada já nasce de segunda a
      sábado, das 9h às 12h e das 13h às 18h.
    </p>

    <div class="catalog-layout">
      <form class="card service-form" hx-post="/equipe/pessoas">
        <strong>Nova pessoa</strong>
        {error && !editing ? <p class="error">{error}</p> : null}
        <Campos />
        <button type="submit" class="btn">
          Adicionar
        </button>
      </form>

      <aside class="card catalog">
        <strong>Pessoas</strong>
        <ul>
          {items.map((pessoa) => (
            <li key={pessoa.id} class={pessoa.active ? '' : 'off'}>
              <span>
                {pessoa.name}
                {pessoa.role === 'owner' ? ' · dono' : ''}
                {pessoa.active && !pessoa.joinedAt ? (
                  <small class="tag"> convite pendente</small>
                ) : null}
              </span>
              <button type="button" class="link" hx-get={`/equipe/pessoas?editar=${pessoa.id}`}>
                editar
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>

    {editing ? <Editar pessoa={editing} me={me} error={error} /> : null}
  </section>
)
