export type WorkRange = { weekday: number; startMinute: number; endMinute: number }

const HOUR = 60
const WEEKDAYS = [1, 2, 3, 4, 5, 6]

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
