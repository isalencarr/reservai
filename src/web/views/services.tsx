import type { FC } from 'hono/jsx'
import type { Provider, Service } from '../../db/schema.ts'
import { formatPrice } from '../../domain/money.ts'
import { Icon } from './icon.tsx'

export type ServiceRow = { service: Service; providerIds: string[] }

export type ServicesProps = {
  items: ServiceRow[]
  providers: Provider[]
  editing?: ServiceRow
  error?: string
}

const Equipe: FC<{ providers: Provider[]; marked: string[] }> = ({ providers, marked }) => (
  <fieldset class="team">
    <legend>Quem executa</legend>
    {providers.map((p) => (
      <label key={p.id}>
        <input type="checkbox" name="prestador" value={p.id} checked={marked.includes(p.id)} />
        {p.name}
      </label>
    ))}
  </fieldset>
)

const Fields: FC<{ service?: Service }> = ({ service }) => (
  <div class="fields">
    <label>
      Nome
      <input
        type="text"
        name="nome"
        required
        placeholder="Corte feminino"
        value={service?.name ?? ''}
      />
    </label>
    <label>
      Duração (min)
      <input
        type="number"
        name="duracao"
        required
        min="5"
        max="600"
        step="5"
        value={String(service?.durationMinutes ?? 60)}
      />
    </label>
    <label>
      Preço
      <input
        type="text"
        name="preco"
        placeholder="90,00"
        inputmode="decimal"
        value={service ? formatPrice(service.priceCents) : ''}
      />
    </label>
  </div>
)

/** O modal é só marcação: abrir e fechar são navegações do HTMX sobre o mesmo
 * fragmento, então não existe estado de tela para sincronizar. */
const EditRow: FC<{ row: ServiceRow; providers: Provider[]; error?: string }> = ({
  row,
  providers,
  error,
}) => (
  <div class="overlay">
    <button type="button" class="overlay-bg" hx-get="/servicos" aria-label="Fechar" />
    <div class="modal" role="dialog" aria-modal="true" aria-label={`Editar ${row.service.name}`}>
      <form class="service-form" hx-post={`/servicos/${row.service.id}`}>
        <strong>{row.service.name}</strong>
        {error ? <p class="error">{error}</p> : null}
        <Fields service={row.service} />
        <Equipe providers={providers} marked={row.providerIds} />
        <div class="actions">
          <button type="submit" class="btn filled">
            Salvar
          </button>
          <button
            type="button"
            class="btn danger"
            hx-post={`/servicos/${row.service.id}/ativo`}
            hx-vals={JSON.stringify({ active: row.service.active ? 'nao' : 'sim' })}
          >
            {row.service.active ? 'Desativar' : 'Reativar'}
          </button>
          <button type="button" class="btn ghost" hx-get="/servicos">
            Fechar
          </button>
        </div>
      </form>
    </div>
  </div>
)

export const Services: FC<ServicesProps> = ({ items, providers, editing, error }) => (
  <section id="catalog" hx-target="#catalog" hx-swap="outerHTML">
    <h2>Catálogo</h2>

    <div class="catalog-layout">
      <form class="card service-form" hx-post="/servicos">
        <strong>Novo serviço</strong>
        {error && !editing ? <p class="error">{error}</p> : null}
        <Fields />
        <Equipe providers={providers} marked={[]} />
        <button type="submit" class="btn filled">
          <Icon name="add" />
          Adicionar
        </button>
      </form>

      <aside class="card catalog">
        <strong>Serviços</strong>
        {items.length === 0 ? (
          <p class="muted">Nenhum serviço ainda.</p>
        ) : (
          <ul>
            {items.map(({ service }) => (
              <li key={service.id} class={service.active ? '' : 'off'}>
                <span>{service.name}</span>
                <button
                  type="button"
                  class="link"
                  hx-get={`/servicos?editar=${service.id}`}
                  aria-label={`Editar ${service.name}`}
                >
                  editar
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>

    {editing ? <EditRow row={editing} providers={providers} error={error} /> : null}
  </section>
)
