import type { FC } from 'hono/jsx'
import type { GridBand } from '../../domain/schedule.ts'
import { addDays, formatLongDate, formatTime, type LocalDate } from '../../domain/time.ts'
import type { DayEntry } from '../../repos/appointments.ts'
import { Icon } from './icon.tsx'

export type DayViewProps = {
  providerId: string
  providerName: string
  date: LocalDate
  timeZone: string
  bands: GridBand<DayEntry>[]
}

type RowProps = { providerId: string; date: LocalDate; timeZone: string }

const label = (entry: DayEntry) =>
  entry.origin === 'external' ? (entry.note ?? 'Bloqueado') : (entry.customerName ?? 'Sem nome')

const Busy: FC<RowProps & { entry: DayEntry; span: number }> = ({
  entry,
  span,
  timeZone,
  date,
  providerId,
}) => (
  <div class="row" style={`--span:${span}`}>
    <div class="at">{formatTime(entry.startsAt, timeZone)}</div>
    <div class="slot">
      <div class={`appt ${entry.origin === 'external' ? 'external' : ''} ${entry.status}`}>
        <span class="who">{label(entry)}</span>
        <span class="what">
          {entry.serviceName ?? 'Horário bloqueado'} · {formatTime(entry.startsAt, timeZone)}–
          {formatTime(entry.endsAt, timeZone)}
          {entry.status === 'pending' ? ' · aguardando confirmação' : ''}
        </span>
        {entry.origin === 'external' ? (
          <div class="actions">
            <button
              type="button"
              class="btn danger"
              hx-delete={`/agenda/${providerId}/bloqueios/${entry.id}?date=${date}`}
            >
              <Icon name="lock_open" />
              Liberar
            </button>
          </div>
        ) : null}
      </div>
    </div>
  </div>
)

const Free: FC<RowProps & { start: Date; end: Date }> = ({
  start,
  end,
  timeZone,
  date,
  providerId,
}) => (
  <div class="row">
    <div class="at">{formatTime(start, timeZone)}</div>
    <div class="slot">
      <button
        type="button"
        class="btn ghost"
        hx-post={`/agenda/${providerId}/bloqueios?date=${date}`}
        hx-vals={JSON.stringify({ startsAt: start.toISOString(), endsAt: end.toISOString() })}
      >
        <Icon name="block" />
        Bloquear {formatTime(start, timeZone)}
      </button>
    </div>
  </div>
)

/** Fragmento trocado pelo HTMX: tudo que muda ao navegar entre dias ou mexer em
 * um bloqueio está aqui dentro, então toda ação devolve esta mesma seção. */
export const DayView: FC<DayViewProps> = ({ date, timeZone, bands, providerId, providerName }) => {
  const row: RowProps = { providerId, date, timeZone }
  const link = (d: LocalDate) => `/agenda/${providerId}?date=${d}`

  return (
    <section id="day" hx-target="#day" hx-swap="outerHTML">
      <div class="daybar">
        <button
          type="button"
          class="btn"
          hx-get={link(addDays(date, -1))}
          hx-push-url="true"
          aria-label="Dia anterior"
        >
          <Icon name="chevron_left" class="big" />
        </button>
        <div class="today">
          <strong>{formatLongDate(date)}</strong>
          <span>{providerName}</span>
        </div>
        <button
          type="button"
          class="btn"
          hx-get={link(addDays(date, 1))}
          hx-push-url="true"
          aria-label="Próximo dia"
        >
          <Icon name="chevron_right" class="big" />
        </button>
      </div>

      <div class="dayactions">
        <button
          type="button"
          class="btn danger"
          hx-post={`/agenda/${providerId}/folga?date=${date}`}
          hx-confirm="Bloquear o dia inteiro e avisar quem já está marcado?"
        >
          <Icon name="event_busy" />
          Folga do dia
        </button>
      </div>

      {bands.length === 0 ? (
        <p class="empty">Sem expediente neste dia.</p>
      ) : (
        bands.map((band) => (
          <div class="band" key={band.start.toISOString()}>
            {band.rows.map((r) =>
              r.kind === 'busy' ? (
                <Busy key={r.data.id} entry={r.data} span={r.span} {...row} />
              ) : (
                <Free key={r.start.toISOString()} start={r.start} end={r.end} {...row} />
              ),
            )}
          </div>
        ))
      )}
    </section>
  )
}
