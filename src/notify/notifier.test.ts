import { describe, expect, it } from 'bun:test'
import { createLogNotifier } from './log-notifier.ts'
import { renderMessage } from './notifier.ts'

describe('renderMessage', () => {
  it('escreve o pedido pendente com prazo', () => {
    const text = renderMessage({
      kind: 'pending-request',
      to: '11988880001',
      customerName: 'Maria Silva',
      serviceName: 'Progressiva',
      when: 'segunda-feira às 09:00',
      deadline: 'domingo às 18:00',
    })
    expect(text).toContain('Maria Silva')
    expect(text).toContain('Responda até domingo às 18:00')
  })

  it('muda o texto conforme a resposta do prestador', () => {
    const base = {
      kind: 'request-answer',
      to: '1',
      when: 'terça às 10:00',
      providerName: 'Carla',
    } as const
    expect(renderMessage({ ...base, accepted: true })).toContain('confirmou')
    expect(renderMessage({ ...base, accepted: false })).toContain('Escolha outro horário')
  })
})

describe('createLogNotifier', () => {
  it('guarda o que foi enviado', async () => {
    const notifier = createLogNotifier(false)
    await notifier.send({ kind: 'access-code', to: '11977770001', code: '123456' })
    expect(notifier.sent).toHaveLength(1)
    expect(notifier.sent[0]).toMatchObject({ kind: 'access-code', code: '123456' })
  })
})
