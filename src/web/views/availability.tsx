import type { FC } from 'hono/jsx'
import type { Provider, Service } from '../../db/schema.ts'
import { formatLongDate, formatTime, type LocalDate } from '../../domain/time.ts'

export type AvailabilityProps = {
  services: Service[]
  providers: Provider[]
  service?: Service
  provider?: Provider
  date: LocalDate
  timeZone: string
  starts: Date[]
}

const money = (cents: number | null) =>
  cents === null ? '' : ` · R$ ${(cents / 100).toFixed(2).replace('.', ',')}`

/** Fragmento único: trocar serviço muda a lista de profissionais, então o
 * formulário e o resultado vão e voltam juntos. */
export const Availability: FC<AvailabilityProps> = ({
  services,
  providers,
  service,
  provider,
  date,
  timeZone,
  starts,
}) => (
  <section
    id="consulta"
    hx-get="/horarios"
    hx-target="#consulta"
    hx-swap="outerHTML"
    hx-trigger="change from:#filtros"
    hx-include="#filtros"
  >
    <form id="filtros" class="filters">
      <label>
        Serviço
        <select name="servico">
          {services.map((s) => (
            <option key={s.id} value={s.id} selected={s.id === service?.id}>
              {s.name} · {s.durationMinutes} min{money(s.priceCents)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Profissional
        <select name="prestador">
          {providers.map((p) => (
            <option key={p.id} value={p.id} selected={p.id === provider?.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Dia
        <input type="date" name="data" value={date} />
      </label>
    </form>

    <h2>{formatLongDate(date)}</h2>

    {starts.length === 0 ? (
      <p class="empty">
        {providers.length === 0
          ? 'Nenhum profissional executa esse serviço.'
          : 'Nenhum horário disponível neste dia.'}
      </p>
    ) : (
      <ul class="slots">
        {starts.map((start) => (
          <li key={start.toISOString()}>
            <span class="chip">{formatTime(start, timeZone)}</span>
          </li>
        ))}
      </ul>
    )}
  </section>
)
