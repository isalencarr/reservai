import { describe, expect, it } from 'bun:test'
import { createLogNotifier } from './log-notifier.ts'
import { type NotifyMessage, renderMessage } from './notifier.ts'

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

/** Uma amostra por `kind`: o `Record` é o que faz o compilador cobrar amostra
 * nova quando aparecer um tipo de mensagem novo. */
const SAMPLES: Record<NotifyMessage['kind'], NotifyMessage[]> = {
  'access-code': [{ kind: 'access-code', to: '11988880001', code: '123456' }],
  'magic-link': [
    { kind: 'magic-link', to: 'dono@exemplo.com.br', url: 'https://exemplo.com.br/entrar?t=1' },
  ],
  'pending-request': [
    {
      kind: 'pending-request',
      to: '11988880001',
      customerName: 'Maria Silva',
      serviceName: 'Corte',
      when: 'segunda-feira às 09:00',
      deadline: 'domingo às 18:00',
    },
  ],
  'request-answer': [
    {
      kind: 'request-answer',
      to: '1',
      when: 'terça às 10:00',
      providerName: 'Carla',
      accepted: true,
    },
    {
      kind: 'request-answer',
      to: '1',
      when: 'terça às 10:00',
      providerName: 'Carla',
      accepted: false,
    },
  ],
  'reschedule-needed': [
    { kind: 'reschedule-needed', to: '1', when: 'terça às 10:00', providerName: 'Carla' },
  ],
  'customer-cancelled': [
    { kind: 'customer-cancelled', to: '1', customerName: 'Maria Silva', when: 'terça às 10:00' },
  ],
}

/** "salao" sem acento entra na lista porque é como a palavra aparece em host,
 * apelido e nome de script. */
const FORBIDDEN = ['salão', 'salao', 'beleza']

describe('renderMessage não cita segmento de negócio', () => {
  for (const [kind, samples] of Object.entries(SAMPLES)) {
    it(`${kind} não fala em salão nem em beleza`, () => {
      for (const sample of samples) {
        const text = renderMessage(sample).toLowerCase()
        for (const word of FORBIDDEN) {
          expect(text).not.toContain(word)
        }
      }
    })
  }
})

describe('createLogNotifier', () => {
  it('guarda o que foi enviado', async () => {
    const notifier = createLogNotifier(false)
    await notifier.send({ kind: 'access-code', to: '11977770001', code: '123456' })
    expect(notifier.sent).toHaveLength(1)
    expect(notifier.sent[0]).toMatchObject({ kind: 'access-code', code: '123456' })
  })
})
