import type { FC } from 'hono/jsx'
import type { Provider } from '../../db/schema.ts'
import { formatMinute } from '../../domain/time.ts'
import { dayRanges, WEEKDAY_NAMES, type WorkRange } from '../../domain/workday.ts'
import { Icon } from './icon.tsx'

export type WorkweekItem = { pessoa: Provider; dias: number }

export type WorkweekProps = {
  items: WorkweekItem[]
  pessoa: Provider
  ranges: WorkRange[]
  error?: string
  saved?: boolean
}

const Faixa: FC<{ campo: string; rotulo: string; minuto?: number }> = ({
  campo,
  rotulo,
  minuto,
}) => (
  <label>
    {rotulo}
    <input
      type="time"
      name={campo}
      step="300"
      value={minuto === undefined ? '' : formatMinute(minuto)}
    />
  </label>
)

const Dia: FC<{ weekday: number; nome: string; ranges: WorkRange[] }> = ({
  weekday,
  nome,
  ranges,
}) => {
  const faixas = dayRanges(ranges, weekday)
  const primeira = faixas[0]
  const segunda = faixas[1]

  return (
    <div class="day">
      <strong>
        {nome}
        {faixas.length === 0 ? <small class="tag"> folga</small> : null}
      </strong>
      <div class="ranges">
        <Faixa campo={`d${weekday}i1`} rotulo="de" minuto={primeira?.startMinute} />
        <Faixa campo={`d${weekday}f1`} rotulo="até" minuto={primeira?.endMinute} />
        <Faixa
          campo={`d${weekday}i2`}
          rotulo="depois do almoço, de"
          minuto={segunda?.startMinute}
        />
        <Faixa campo={`d${weekday}f2`} rotulo="até" minuto={segunda?.endMinute} />
      </div>
    </div>
  )
}

/** Uma pessoa por vez: a jornada é a semana inteira dela, e sete dias de duas
 * pessoas na mesma tela ninguém lê no celular. */
export const Workweek: FC<WorkweekProps> = ({ items, pessoa, ranges, error, saved }) => (
  <section id="jornada" hx-target="#jornada" hx-swap="outerHTML">
    <h2>Jornada</h2>
    <p class="muted">
      O horário de trabalho de cada pessoa, por dia da semana. É daqui que sai o que o cliente vê
      como horário livre: dia sem faixa nenhuma é folga, e as duas faixas do dia deixam o almoço no
      meio de fora.
    </p>

    <div class="catalog-layout">
      <form class="card service-form" hx-post={`/equipe/jornada/${pessoa.id}`}>
        <strong>{pessoa.name}</strong>
        {error ? <p class="error">{error}</p> : null}
        {saved && !error ? <p class="tag">Jornada salva.</p> : null}

        <div class="week">
          {WEEKDAY_NAMES.map((nome, weekday) => (
            <Dia key={nome} weekday={weekday} nome={nome} ranges={ranges} />
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
            hx-post={`/equipe/jornada/${pessoa.id}/padrao`}
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
            <li key={item.pessoa.id}>
              <span>
                {item.pessoa.name}
                <small class="tag">
                  {' '}
                  {item.dias === 0
                    ? 'sem jornada'
                    : `${item.dias} ${item.dias === 1 ? 'dia' : 'dias'} na semana`}
                </small>
              </span>
              {item.pessoa.id === pessoa.id ? (
                <small class="tag">editando</small>
              ) : (
                <button
                  type="button"
                  class="link"
                  hx-get={`/equipe/jornada?pessoa=${item.pessoa.id}`}
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
