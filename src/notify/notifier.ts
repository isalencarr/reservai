/** Mensagens que o app precisa entregar fora da tela. O canal real (WhatsApp ou
 * SMS) entra quando houver salão piloto; até lá só existe a versão em log. */
export type NotifyMessage =
  | { kind: 'access-code'; to: string; code: string }
  | {
      kind: 'pending-request'
      to: string
      customerName: string
      serviceName: string
      when: string
      deadline: string
    }
  | { kind: 'request-answer'; to: string; when: string; accepted: boolean; providerName: string }
  | { kind: 'reschedule-needed'; to: string; when: string; providerName: string }
  | { kind: 'customer-cancelled'; to: string; customerName: string; when: string }

export interface Notifier {
  send(message: NotifyMessage): Promise<void>
}

export function renderMessage(message: NotifyMessage): string {
  switch (message.kind) {
    case 'access-code':
      return `Seu código de acesso é ${message.code}. Ele vale por 10 minutos.`
    case 'pending-request':
      return `${message.customerName} pediu ${message.serviceName} em ${message.when}. Responda até ${message.deadline}.`
    case 'request-answer':
      return message.accepted
        ? `${message.providerName} confirmou seu horário de ${message.when}.`
        : `${message.providerName} não pôde atender em ${message.when}. Escolha outro horário.`
    case 'reschedule-needed':
      return `${message.providerName} não vai atender em ${message.when}. Precisamos remarcar.`
    case 'customer-cancelled':
      return `${message.customerName} cancelou o horário de ${message.when}.`
  }
}
