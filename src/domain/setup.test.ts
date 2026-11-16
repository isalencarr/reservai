import { describe, expect, it } from 'bun:test'
import { type DadosDeSetup, pendenciasDeSetup, prontoParaDivulgar } from './setup.ts'

const completo: DadosDeSetup = {
  servicosAtivos: 3,
  servicosSemProfissional: [],
  profissionaisSemJornada: [],
  convitesPendentes: [],
}

describe('pendências de setup', () => {
  it('salão completo não tem pendência', () => {
    expect(pendenciasDeSetup(completo)).toEqual([])
    expect(prontoParaDivulgar([])).toBe(true)
  })

  it('salão recém-criado precisa de serviço', () => {
    const pendencias = pendenciasDeSetup({ ...completo, servicosAtivos: 0 })
    expect(pendencias.map((p) => p.key)).toEqual(['sem-servico'])
    expect(prontoParaDivulgar(pendencias)).toBe(false)
  })

  it('serviço sem ninguém para executar impede agendamento', () => {
    const pendencias = pendenciasDeSetup({ ...completo, servicosSemProfissional: ['Progressiva'] })
    expect(pendencias[0]).toMatchObject({ key: 'servico-sem-profissional', href: '/servicos' })
    expect(pendencias[0]?.texto).toContain('Progressiva')
    expect(prontoParaDivulgar(pendencias)).toBe(false)
  })

  it('profissional sem jornada manda para a jornada', () => {
    const pendencias = pendenciasDeSetup({ ...completo, profissionaisSemJornada: ['Rafa Lima'] })
    expect(pendencias[0]).toMatchObject({
      key: 'profissional-sem-jornada',
      href: '/equipe/jornada',
    })
  })

  it('convite não aceito avisa, mas não impede divulgar', () => {
    const pendencias = pendenciasDeSetup({ ...completo, convitesPendentes: ['Bia Souza'] })
    expect(pendencias[0]).toMatchObject({ key: 'convite-pendente', bloqueia: false })
    expect(prontoParaDivulgar(pendencias)).toBe(true)
  })

  it('resume a lista quando são muitos', () => {
    const pendencias = pendenciasDeSetup({
      ...completo,
      profissionaisSemJornada: ['Ana', 'Bia', 'Caio', 'Duda'],
    })
    expect(pendencias[0]?.texto).toContain('Ana, Bia e mais 2')
  })

  it('junta as pendências na ordem de quem resolve primeiro', () => {
    const pendencias = pendenciasDeSetup({
      servicosAtivos: 0,
      servicosSemProfissional: ['Corte'],
      profissionaisSemJornada: ['Rafa'],
      convitesPendentes: ['Bia'],
    })
    expect(pendencias.map((p) => p.key)).toEqual([
      'sem-servico',
      'servico-sem-profissional',
      'profissional-sem-jornada',
      'convite-pendente',
    ])
  })
})
