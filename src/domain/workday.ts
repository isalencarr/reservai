import { DAY_MINUTES } from './time.ts'

export type WorkRange = { weekday: number; startMinute: number; endMinute: number }

const HOUR = 60
const WEEKDAYS = [1, 2, 3, 4, 5, 6]

/** Na ordem de `providerHours.weekday`: domingo é 0. */
export const WEEKDAY_NAMES = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const

/**
 * Jornada que todo mundo recebe ao ser cadastrado: segunda a sábado, 9h às 12h e
 * 13h às 18h. Sem isso a agenda de quem entra na equipe nasce vazia e ninguém
 * entende por quê. O almoço é a lacuna entre as faixas, não um bloqueio.
 */
export function defaultWorkweek(): WorkRange[] {
  return WEEKDAYS.flatMap((weekday) => [
    { weekday, startMinute: 9 * HOUR, endMinute: 12 * HOUR },
    { weekday, startMinute: 13 * HOUR, endMinute: 18 * HOUR },
  ])
}

/** As faixas de um dia, da primeira para a última. */
export function dayRanges(ranges: WorkRange[], weekday: number): WorkRange[] {
  return ranges
    .filter((range) => range.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute)
}

/**
 * Jornada errada tira horário da agenda sem ninguém perceber, então a semana é
 * conferida antes de gravar. Faixa que encosta na outra passa: o cálculo da
 * agenda já junta as duas.
 */
export function workweekError(ranges: WorkRange[]): string | undefined {
  for (const range of ranges) {
    const day = WEEKDAY_NAMES[range.weekday]
    if (!day) return 'Dia da semana inválido.'
    if (range.startMinute < 0 || range.endMinute > DAY_MINUTES) {
      return `Em ${day}, o horário está fora do dia.`
    }
    if (range.endMinute <= range.startMinute) {
      return `Em ${day}, o fim precisa vir depois do início.`
    }
  }

  for (const [weekday, day] of WEEKDAY_NAMES.entries()) {
    const doDia = dayRanges(ranges, weekday)
    for (const [index, range] of doDia.entries()) {
      const previous = index > 0 ? doDia[index - 1] : undefined
      if (previous && range.startMinute < previous.endMinute) {
        return `Em ${day}, uma faixa começa antes de a outra terminar.`
      }
    }
  }

  return undefined
}
