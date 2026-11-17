import type { FC } from 'hono/jsx'
import type { Provider } from '../../db/schema.ts'
import { formatMinute } from '../../domain/time.ts'
import { dayRanges, WEEKDAY_NAMES, type WorkRange } from '../../domain/workday.ts'
import { Icon } from './icon.tsx'

export type WorkweekItem = { provider: Provider; days: number }

export type WorkweekProps = {
  items: WorkweekItem[]
  provider: Provider
  ranges: WorkRange[]
  error?: string
  saved?: boolean
}

const RangeField: FC<{ field: string; label: string; minute?: number }> = ({
  field,
  label,
  minute,
}) => (
  <label>
    {label}
    <input
      type="time"
      name={field}
      step="300"
      value={minute === undefined ? '' : formatMinute(minute)}
    />
  </label>
)

const DayRow: FC<{ weekday: number; name: string; ranges: WorkRange[] }> = ({
  weekday,
  name,
  ranges,
}) => {
  const rangesOfDay = dayRanges(ranges, weekday)
  const first = rangesOfDay[0]
  const second = rangesOfDay[1]

  return (
    <div class="day">
      <strong>
        {name}
        {rangesOfDay.length === 0 ? <small class="tag"> folga</small> : null}
      </strong>
      <div class="ranges">
        <RangeField field={`d${weekday}i1`} label="de" minute={first?.startMinute} />
        <RangeField field={`d${weekday}f1`} label="até" minute={first?.endMinute} />
        <RangeField
          field={`d${weekday}i2`}
          label="depois do almoço, de"
          minute={second?.startMinute}
        />
        <RangeField field={`d${weekday}f2`} label="até" minute={second?.endMinute} />
      </div>
    </div>
  )
}

/** Uma pessoa por vez: a jornada é a semana inteira dela, e sete dias de duas
 * pessoas na mesma tela ninguém lê no celular. */
export const Workweek: FC<WorkweekProps> = ({ items, provider, ranges, error, saved }) => (
  <section id="workweek" hx-target="#workweek" hx-swap="outerHTML">
    <h2>Jornada</h2>
    <p class="muted">
      O horário de trabalho de cada pessoa, por dia da semana. É daqui que sai o que o cliente vê
      como horário livre: dia sem faixa nenhuma é folga, e as duas faixas do dia deixam o almoço no
      meio de fora.
    </p>

    <div class="catalog-layout">
      <form class="card service-form" hx-post={`/equipe/jornada/${provider.id}`}>
        <strong>{provider.name}</strong>
        {error ? <p class="error">{error}</p> : null}
        {saved && !error ? <p class="tag">Jornada salva.</p> : null}

        <div class="week">
          {WEEKDAY_NAMES.map((name, weekday) => (
            <DayRow key={name} weekday={weekday} name={name} ranges={ranges} />
          ))}
        </div>

        <div class="actions">
          <button type="submit" class="btn filled">
            <Icon name="save" />
            Salvar jornada
          </button>
          <button
            type="button"
            class="btn ghost"
            hx-post={`/equipe/jornada/${provider.id}/padrao`}
            title="Segunda a sábado, 9h às 12h e 13h às 18h"
          >
            Usar a jornada padrão
          </button>
        </div>
      </form>

      <aside class="card catalog">
        <strong>Equipe</strong>
        <ul>
          {items.map((item) => (
            <li key={item.provider.id}>
              <span>
                {item.provider.name}
                <small class="tag">
                  {' '}
                  {item.days === 0
                    ? 'sem jornada'
                    : `${item.days} ${item.days === 1 ? 'dia' : 'dias'} na semana`}
                </small>
              </span>
              {item.provider.id === provider.id ? (
                <small class="tag">editando</small>
              ) : (
                <button
                  type="button"
                  class="link"
                  hx-get={`/equipe/jornada?pessoa=${item.provider.id}`}
                >
                  abrir
                </button>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  </section>
)
