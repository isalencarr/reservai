import type { FC } from 'hono/jsx'
import { formatPhone } from '../../domain/phone.ts'
import { formatWhen } from '../../domain/time.ts'
import type { CustomerEntry } from '../../repos/appointments.ts'
import type { CustomerRow } from '../../repos/customers.ts'
import { WIRE } from '../wire.ts'
import { Icon } from './icon.tsx'

export type CustomersProps = {
  items: CustomerRow[]
  query: string
  timeZone: string
  viewing?: { customer: CustomerRow; history: CustomerEntry[] }
}

const STATUS_LABEL: Record<CustomerEntry['status'], string> = {
  pending: 'aguardando',
  confirmed: 'confirmado',
  declined: 'recusado',
  cancelled: 'cancelado',
  expired: 'sem resposta',
}

const History: FC<{
  customer: CustomerRow
  history: CustomerEntry[]
  timeZone: string
}> = ({ customer, history, timeZone }) => (
  <div class="overlay">
    <button type="button" class="overlay-bg" hx-get="/clientes" aria-label="Fechar" />
    <div class="modal" role="dialog" aria-modal="true" aria-label={`Histórico de ${customer.name}`}>
      <strong>{customer.name}</strong>
      <p class="muted">
        {formatPhone(customer.phone)} · {customer.visits} agendamento(s)
      </p>

      {history.length === 0 ? (
        <p class="empty">Nenhum atendimento registrado.</p>
      ) : (
        <ul class="history">
          {history.map((item) => (
            <li key={item.id}>
              <span>{formatWhen(item.startsAt, timeZone)}</span>
              <small>
                {item.serviceName ?? 'Serviço'} · {item.providerName} · {STATUS_LABEL[item.status]}
              </small>
            </li>
          ))}
        </ul>
      )}

      <button type="button" class="btn ghost" hx-get="/clientes">
        Fechar
      </button>
    </div>
  </div>
)

export const Customers: FC<CustomersProps> = ({ items, query, timeZone, viewing }) => (
  <section id="customers" hx-target="#customers" hx-swap="outerHTML">
    <div class="hero">
      <Icon name="group" class="hero-icon" />
      <strong>
        {items.length} {items.length === 1 ? 'cliente' : 'clientes'}
      </strong>
      <span class="hero-sub">{query ? `encontrados para "${query}"` : 'na carteira do salão'}</span>
    </div>
    <p class="muted">Os clientes são do salão. O profissional vê apenas nome e horário.</p>

    <form class="card" hx-get="/clientes" hx-trigger="submit, input from:find input delay:400ms">
      <label class="search">
        <span class="search-label">
          <Icon name="search" /> Buscar por nome ou telefone
        </span>
        <input type="search" name={WIRE.query} value={query} placeholder="Maria ou 11988880001" />
      </label>
    </form>

    {items.length === 0 ? (
      <p class="empty">Nenhum cliente encontrado.</p>
    ) : (
      <ul class="wallet">
        {items.map((customer) => (
          <li key={customer.id} class="card">
            <div>
              <span class="who">{customer.name}</span>
              <span class="what">
                <Icon name="call" /> {formatPhone(customer.phone)} · {customer.visits}{' '}
                agendamento(s)
              </span>
            </div>
            <button type="button" class="link" hx-get={`/clientes?ver=${customer.id}`}>
              histórico
            </button>
          </li>
        ))}
      </ul>
    )}

    {viewing ? (
      <History customer={viewing.customer} history={viewing.history} timeZone={timeZone} />
    ) : null}
  </section>
)
