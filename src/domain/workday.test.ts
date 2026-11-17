import { describe, expect, it } from 'bun:test'
import { dayRanges, defaultWorkweek, type WorkRange, workweekError } from './workday.ts'

const range = (weekday: number, start: number, end: number): WorkRange => ({
  weekday,
  startMinute: start,
  endMinute: end,
})

describe('jornada padrão', () => {
  it('é de segunda a sábado, com almoço no meio', () => {
    const week = defaultWorkweek()
    expect(week).toHaveLength(12)
    expect(dayRanges(week, 0)).toEqual([])
    expect(dayRanges(week, 1)).toEqual([range(1, 540, 720), range(1, 780, 1080)])
    expect(workweekError(week)).toBeUndefined()
  })
})

describe('conferência da jornada', () => {
  it('semana vazia passa: ninguém é obrigado a trabalhar', () => {
    expect(workweekError([])).toBeUndefined()
  })

  it('recusa fim antes do início', () => {
    expect(workweekError([range(1, 720, 540)])).toContain('segunda-feira')
    expect(workweekError([range(3, 600, 600)])).toContain('quarta-feira')
  })

  it('recusa horário fora do dia', () => {
    expect(workweekError([range(2, 1380, 1500)])).toContain('fora do dia')
    expect(workweekError([range(2, -60, 600)])).toContain('fora do dia')
  })

  it('recusa dia da semana que não existe', () => {
    expect(workweekError([range(7, 540, 600)])).toBe('Dia da semana inválido.')
  })

  it('recusa faixas que se cruzam no mesmo dia', () => {
    const overlapping = [range(5, 540, 720), range(5, 660, 1080)]
    expect(workweekError(overlapping)).toContain('sexta-feira')
    expect(workweekError(overlapping)).toContain('antes de a outra terminar')
  })

  it('aceita faixas que apenas se encostam', () => {
    expect(workweekError([range(5, 540, 720), range(5, 720, 1080)])).toBeUndefined()
  })

  it('o mesmo horário em dias diferentes não se cruza', () => {
    expect(workweekError([range(1, 540, 720), range(2, 540, 720)])).toBeUndefined()
  })

  it('acha o cruzamento mesmo com as faixas fora de ordem', () => {
    expect(workweekError([range(6, 660, 1080), range(6, 540, 720)])).toContain('sábado')
  })
})

describe('faixas de um dia', () => {
  it('vêm em ordem de início', () => {
    const messy = [range(4, 780, 1080), range(4, 540, 720), range(1, 540, 600)]
    expect(dayRanges(messy, 4)).toEqual([range(4, 540, 720), range(4, 780, 1080)])
  })
})
