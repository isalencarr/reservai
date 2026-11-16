import type { FC } from 'hono/jsx'
import { Icon } from './icon.tsx'

/** Salão suspenso para o cliente: não dá para pedir horário novo, mas o que já
 * estava confirmado continua valendo e visível. */
export const Indisponivel: FC = () => (
  <section id="indisponivel">
    <div class="hero">
      <Icon name="event_busy" class="hero-icon" />
      <strong>Agenda fechada</strong>
      <span class="hero-sub">o salão não está recebendo novos agendamentos</span>
    </div>

    <p class="muted">
      Se você já tem um horário marcado, ele continua valendo. Para marcar um novo, fale direto com
      o salão.
    </p>

    <ul class="people">
      <li>
        <a class="item" href="/reserva/meus">
          <Icon name="calendar_month" class="avatar" />
          <span class="text">
            <span>Meus horários</span>
            <small>ver e cancelar o que já está marcado</small>
          </span>
          <Icon name="chevron_right" />
        </a>
      </li>
    </ul>
  </section>
)
