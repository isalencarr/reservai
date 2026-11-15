import type { FC } from 'hono/jsx'
import type { Provider, Service } from '../../db/schema.ts'
import { canCustomerCancel } from '../../domain/booking.ts'
import { formatPrice } from '../../domain/money.ts'
import { formatLongDate, formatTime, formatWhen, type LocalDate } from '../../domain/time.ts'
import type { CustomerEntry } from '../../repos/appointments.ts'

export type DayOption = { date: LocalDate; label: string; weekday: string }

export type ReservaProps = {
  customerName: string
  timeZone: string
  services: Service[]
  service?: Service
  providers: Provider[]
  provider?: Provider
  days: DayOption[]
  date?: LocalDate
  starts: Date[]
  chosen?: Date
}

const step = (service?: Service, provider?: Provider, date?: LocalDate, chosen?: Date) => {
  if (chosen) return 4
  if (date) return 3
  if (provider) return 2
  if (service) return 1
  return 0
}

const Voltar: FC<{ href: string }> = ({ href }) => (
  <button type="button" class="link" hx-get={href}>
    ‹ voltar
  </button>
)

export const Reserva: FC<ReservaProps> = (props) => {
  const { services, service, providers, provider, days, date, starts, chosen, timeZone } = props
  const atual = step(service, provider, date, chosen)
  const base = `/reserva?servico=${service?.id ?? ''}`
  const comPrestador = `${base}&prestador=${provider?.id ?? ''}`

  return (
    <section id="reserva" hx-target="#reserva" hx-swap="outerHTML" hx-push-url="true">
      <div class="daybar">
        <div class="today">
          <strong>Novo agendamento</strong>
          <span>Olá, {props.customerName}</span>
        </div>
        <a class="btn" href="/reserva/meus">
          Meus horários
        </a>
      </div>

      {atual === 0 ? (
        <>
          <h2>Escolha o serviço</h2>
          <ul class="people">
            {services.map((s) => (
              <li key={s.id}>
                <button type="button" hx-get={`/reserva?servico=${s.id}`}>
                  <span>{s.name}</span>
                  <small>
                    {s.durationMinutes} min
                    {s.priceCents === null ? '' : ` · R$ ${formatPrice(s.priceCents)}`}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {atual === 1 ? (
        <>
          <Voltar href="/reserva" />
          <h2>Com quem?</h2>
          {providers.length === 0 ? (
            <p class="empty">Nenhum profissional executa esse serviço agora.</p>
          ) : (
            <ul class="people">
              {providers.map((p) => (
                <li key={p.id}>
                  <button type="button" hx-get={`${base}&prestador=${p.id}`}>
                    <span>{p.name}</span>
                    <small>{service?.name}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {atual >= 2 && !chosen ? (
        <>
          <Voltar href={atual === 2 ? base : comPrestador} />
          <h2>Qual dia?</h2>
          <ul class="days">
            {days.map((d) => (
              <li key={d.date}>
                <button
                  type="button"
                  class={`btn day ${d.date === date ? 'on' : ''}`}
                  hx-get={`${comPrestador}&data=${d.date}`}
                >
                  <small>{d.weekday}</small>
                  {d.label}
                </button>
              </li>
            ))}
          </ul>

          {date ? (
            starts.length === 0 ? (
              <p class="empty">Nada livre nesse dia. Tente outro.</p>
            ) : (
              <>
                <h2>{formatLongDate(date)}</h2>
                <ul class="slots">
                  {starts.map((start) => (
                    <li key={start.toISOString()}>
                      <button
                        type="button"
                        class="chip"
                        hx-get={`${comPrestador}&data=${date}&hora=${start.toISOString()}`}
                      >
                        {formatTime(start, timeZone)}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : null}
        </>
      ) : null}

      {chosen && service && provider ? (
        <>
          <Voltar href={`${comPrestador}&data=${date ?? ''}`} />
          <h2>Confirmar</h2>
          <form class="card service-form" hx-post="/reserva">
            <p>
              <strong>{service.name}</strong> com {provider.name}
              <br />
              {formatWhen(chosen, timeZone)}
              {service.priceCents === null ? '' : ` · R$ ${formatPrice(service.priceCents)}`}
            </p>
            <p class="muted">
              O profissional tem até 24 horas para confirmar. Você recebe uma mensagem com a
              resposta.
            </p>
            <input type="hidden" name="servico" value={service.id} />
            <input type="hidden" name="prestador" value={provider.id} />
            <input type="hidden" name="hora" value={chosen.toISOString()} />
            <button type="submit" class="btn filled">
              Pedir este horário
            </button>
          </form>
        </>
      ) : null}
    </section>
  )
}

const STATUS_LABEL: Record<CustomerEntry['status'], string> = {
  pending: 'aguardando confirmação',
  confirmed: 'confirmado',
  declined: 'recusado',
  cancelled: 'cancelado',
  expired: 'sem resposta no prazo',
}

export type MeusProps = {
  customerName: string
  timeZone: string
  now: Date
  items: CustomerEntry[]
  error?: string
}

export const Meus: FC<MeusProps> = ({ customerName, timeZone, now, items, error }) => (
  <section id="meus" hx-target="#meus" hx-swap="outerHTML">
    <div class="daybar">
      <div class="today">
        <strong>Meus horários</strong>
        <span>{customerName}</span>
      </div>
      <a class="btn" href="/reserva">
        Agendar
      </a>
    </div>

    {error ? <p class="error">{error}</p> : null}

    {items.length === 0 ? (
      <p class="empty">Você ainda não tem agendamentos.</p>
    ) : (
      <ul class="queue">
        {items.map((item) => (
          <li key={item.id} class="card">
            <span class="who">{item.serviceName ?? 'Serviço'}</span>
            <span class="what">
              {item.providerName} · {formatWhen(item.startsAt, timeZone)}
            </span>
            <span class="deadline">{STATUS_LABEL[item.status]}</span>
            {(item.status === 'pending' || item.status === 'confirmed') &&
            canCustomerCancel(item.startsAt, now) ? (
              <div class="actions">
                <button
                  type="button"
                  class="btn danger"
                  hx-post={`/reserva/${item.id}/cancelar`}
                  hx-confirm="Cancelar este horário?"
                >
                  Cancelar
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    )}
  </section>
)
