import type { FC } from 'hono/jsx'
import { remainingMinutes } from '../../domain/booking.ts'
import { formatWhen } from '../../domain/time.ts'
import type { PendingEntry } from '../../repos/appointments.ts'

export type PendentesProps = {
  providerId: string
  providerName: string
  timeZone: string
  now: Date
  items: PendingEntry[]
}

function restante(deadline: Date | null, now: Date): string {
  if (!deadline) return 'sem prazo'
  const minutes = remainingMinutes(deadline, now)
  if (minutes === 0) return 'vence agora'
  if (minutes < 60) return `responda em ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `responda em ${hours}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`
}

export const Pendentes: FC<PendentesProps> = ({
  providerId,
  providerName,
  timeZone,
  now,
  items,
}) => (
  <section id="fila" hx-target="#fila" hx-swap="outerHTML">
    <div class="daybar">
      <div class="today">
        <strong>Pedidos aguardando você</strong>
        <span>{providerName}</span>
      </div>
      <a class="btn" href={`/agenda/${providerId}`}>
        Agenda
      </a>
    </div>

    {items.length === 0 ? (
      <p class="empty">Nenhum pedido na fila.</p>
    ) : (
      <ul class="queue">
        {items.map((item) => (
          <li key={item.id} class="card">
            <span class="who">{item.customerName ?? 'Sem nome'}</span>
            <span class="what">
              {item.serviceName ?? 'Serviço'} · {formatWhen(item.startsAt, timeZone)}
            </span>
            <span class="deadline">{restante(item.deadline, now)}</span>
            <div class="actions">
              <button
                type="button"
                class="btn filled"
                hx-post={`/pendentes/${providerId}/${item.id}/confirmar`}
              >
                Confirmar
              </button>
              <button
                type="button"
                class="btn danger"
                hx-post={`/pendentes/${providerId}/${item.id}/recusar`}
              >
                Recusar
              </button>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
)
