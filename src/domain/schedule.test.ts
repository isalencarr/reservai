import { describe, expect, it } from 'bun:test'
import { type Busy, buildDayGrid, mergeIntervals, overlaps, workingIntervals } from './schedule.ts'
import { toUtc } from './time.ts'

const SP = 'America/Sao_Paulo'
const DATE = '2026-11-16' // segunda-feira
const at = (minute: number) => toUtc(DATE, minute, SP)
const hours = [
  { weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
  { weekday: 1, startMinute: 13 * 60, endMinute: 18 * 60 },
  { weekday: 2, startMinute: 9 * 60, endMinute: 18 * 60 },
]

describe('workingIntervals', () => {
  it('devolve só as faixas do dia da semana', () => {
    const bands = workingIntervals(hours, DATE, SP)
    expect(bands).toHaveLength(2)
    expect(bands[0]?.start.toISOString()).toBe('2026-11-16T12:00:00.000Z')
    expect(bands[1]?.end.toISOString()).toBe('2026-11-16T21:00:00.000Z')
  })

  it('devolve vazio em dia sem jornada', () => {
    expect(workingIntervals(hours, '2026-11-15', SP)).toEqual([])
  })

  it('junta faixas coladas', () => {
    const colado = [
      { weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
      { weekday: 1, startMinute: 12 * 60, endMinute: 15 * 60 },
    ]
    expect(workingIntervals(colado, DATE, SP)).toHaveLength(1)
  })
})

describe('mergeIntervals e overlaps', () => {
  it('não considera encostar como sobrepor', () => {
    const a = { start: at(540), end: at(600) }
    const b = { start: at(600), end: at(660) }
    expect(overlaps(a, b)).toBe(false)
    expect(mergeIntervals([a, b])).toHaveLength(1)
  })
})

describe('buildDayGrid', () => {
  const grid = (busy: Busy<string>[], slot = 60) =>
    buildDayGrid(workingIntervals(hours, DATE, SP), busy, slot)

  it('divide a jornada em slots livres, com o almoço separando as faixas', () => {
    const bands = grid([])
    expect(bands).toHaveLength(2)
    expect(bands[0]?.rows).toHaveLength(3)
    expect(bands[1]?.rows).toHaveLength(5)
    expect(bands[0]?.rows.every((r) => r.kind === 'free')).toBe(true)
  })

  it('um serviço de três horas ocupa três slots numa linha só', () => {
    const bands = grid([{ start: at(540), end: at(720), data: 'progressiva' }])
    expect(bands[0]?.rows).toHaveLength(1)
    expect(bands[0]?.rows[0]).toMatchObject({ kind: 'busy', span: 3, data: 'progressiva' })
  })

  it('serviço menor que o slot ainda ocupa o slot inteiro', () => {
    const bands = grid([{ start: at(600), end: at(640), data: 'escova' }])
    const rows = bands[0]?.rows ?? []
    expect(rows).toHaveLength(3)
    expect(rows[1]).toMatchObject({ kind: 'busy', span: 1 })
    expect(rows[2]).toMatchObject({ kind: 'free' })
  })

  it('não estoura a faixa quando o compromisso passa do fim do expediente', () => {
    const bands = grid([{ start: at(660), end: at(900), data: 'atraso' }])
    const rows = bands[0]?.rows ?? []
    expect(rows.at(-1)).toMatchObject({ kind: 'busy', span: 1 })
    expect(bands[1]?.rows.every((r) => r.kind === 'free')).toBe(true)
  })

  it('respeita o slot de 30 minutos do prestador', () => {
    const bands = grid([], 30)
    expect(bands[0]?.rows).toHaveLength(6)
  })
})
