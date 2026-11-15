import { type Notifier, type NotifyMessage, renderMessage } from './notifier.ts'

export type LogNotifier = Notifier & { sent: NotifyMessage[] }

/** Guarda o que seria enviado e imprime no console: em desenvolvimento o código
 * de acesso aparece no terminal, e os testes conferem a fila sem rede. */
export function createLogNotifier(log = true): LogNotifier {
  const sent: NotifyMessage[] = []
  return {
    sent,
    async send(message) {
      sent.push(message)
      if (log) console.log(`[notify:${message.kind}] ${message.to} — ${renderMessage(message)}`)
    },
  }
}
