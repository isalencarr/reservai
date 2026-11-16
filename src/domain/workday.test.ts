import { describe, expect, it } from 'bun:test'
import { dayRanges, defaultWorkweek, type WorkRange, workweekError } from './workday.ts'

const faixa = (weekday: number, start: number, end: number): WorkRange => ({
  weekday,
  startMinute: start,
  endMinute: end,
})

describe('jornada padrão', () => {
  it('é de segunda a sábado, com almoço no meio', () => {
    const semana = defaultWorkweek()
    expect(semana).toHaveLength(12)
    expect(dayRanges(semana, 0)).toEqual([])
    expect(dayRanges(semana, 1)).toEqual([faixa(1, 540, 720), faixa(1, 780, 1080)])
    expect(workweekError(semana)).toBeUndefined()
  })
})

describe('conferência da jornada', () => {
  it('semana vazia passa: ninguém é obrigado a trabalhar', () => {
    expect(workweekError([])).toBeUndefined()
  })

  it('recusa fim antes do início', () => {
    expect(workweekError([faixa(1, 720, 540)])).toContain('segunda-feira')
    expect(workweekError([faixa(3, 600, 600)])).toContain('quarta-feira')
  })

  it('recusa horário fora do dia', () => {
    expect(workweekError([faixa(2, 1380, 1500)])).toContain('fora do dia')
    expect(workweekError([faixa(2, -60, 600)])).toContain('fora do dia')
  })

  it('recusa dia da semana que não existe', () => {
    expect(workweekError([faixa(7, 540, 600)])).toBe('Dia da semana inválido.')
  })

  it('recusa faixas que se cruzam no mesmo dia', () => {
    const cruzadas = [faixa(5, 540, 720), faixa(5, 660, 1080)]
    expect(workweekError(cruzadas)).toContain('sexta-feira')
    expect(workweekError(cruzadas)).toContain('antes de a outra terminar')
  })

  it('aceita faixas que apenas se encostam', () => {
    expect(workweekError([faixa(5, 540, 720), faixa(5, 720, 1080)])).toBeUndefined()
  })

  it('o mesmo horário em dias diferentes não se cruza', () => {
    expect(workweekError([faixa(1, 540, 720), faixa(2, 540, 720)])).toBeUndefined()
  })

  it('acha o cruzamento mesmo com as faixas fora de ordem', () => {
    expect(workweekError([faixa(6, 660, 1080), faixa(6, 540, 720)])).toContain('sábado')
  })
})

describe('faixas de um dia', () => {
  it('vêm em ordem de início', () => {
    const bagunca = [faixa(4, 780, 1080), faixa(4, 540, 720), faixa(1, 540, 600)]
    expect(dayRanges(bagunca, 4)).toEqual([faixa(4, 540, 720), faixa(4, 780, 1080)])
  })
})
