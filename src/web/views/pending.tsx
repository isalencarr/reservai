import type { FC } from 'hono/jsx'
import { remainingMinutes } from '../../domain/booking.ts'
import { formatWhen } from '../../domain/time.ts'
import type { PendingEntry } from '../../repos/appointments.ts'
import { Icon } from './icon.tsx'

export type PendingProps = {
  providerId: string
  providerName: string
  timeZone: string
  now: Date
  items: PendingEntry[]
}

function timeLeft(deadline: Date | null, now: Date): string {
  if (!deadline) return 'sem prazo'
  const minutes = remainingMinutes(deadline, now)
  if (minutes === 0) return 'vence agora'
  if (minutes < 60) return `responda em ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `responda em ${hours}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`
}

export const Pending: FC<PendingProps> = ({ providerId, providerName, timeZone, now, items }) => (
  <section id="queue" hx-target="#queue" hx-swap="outerHTML">
    <div class="hero">
      <Icon name="pending_actions" class="hero-icon" />
      <strong>
        {items.length} {items.length === 1 ? 'pedido' : 'pedidos'}
      </strong>
      <span class="hero-sub">aguardando resposta de {providerName}</span>
    </div>

    <p class="muted">
      Sem resposta dentro do prazo, o horário volta a ser oferecido.{' '}
      <a href={`/agenda/${providerId}`}>Ver a agenda</a>
    </p>

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
            <span class="deadline">{timeLeft(item.deadline, now)}</span>
            <div class="actions">
              <button
                type="button"
                class="btn filled"
                hx-post={`/pendentes/${providerId}/${item.id}/confirmar`}
              >
                <Icon name="check" />
                Confirmar
              </button>
              <button
                type="button"
                class="btn danger"
                hx-post={`/pendentes/${providerId}/${item.id}/recusar`}
              >
                <Icon name="close" />
                Recusar
              </button>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
)
