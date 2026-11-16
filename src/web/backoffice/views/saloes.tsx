import type { FC } from 'hono/jsx'
import type { Company, Subscription, SupportSession } from '../../../db/schema.ts'
import { formatPrice } from '../../../domain/money.ts'
import { paidUntilDate, paymentState } from '../../../domain/subscription.ts'
import { formatDayMonth, formatWhen } from '../../../domain/time.ts'
import { FUSO_PADRAO } from '../../../platform/saloes.ts'
import { STAFF_PREFIX } from '../../tenant.ts'
import { Icon } from '../../views/icon.tsx'

export type SalaoRow = {
  company: Company
  subscription?: Subscription
  /** Janela de suporte aberta agora, se houver. */
  support?: SupportSession
}

export type SaloesProps = {
  items: SalaoRow[]
  editing?: SalaoRow
  error?: string
  now: Date
}

/** Os fusos do Brasil. Digitar à mão é como nasce um salão com horário trocado
 * em toda tela de data. */
const FUSOS = [
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Fortaleza',
  'America/Recife',
  'America/Belem',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Manaus',
  'America/Boa_Vista',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Noronha',
]

const PLANOS: Subscription['plan'][] = ['mensal', 'anual']

/** O que a lista precisa dizer de cada salão em uma linha: se está no ar e se
 * está pago. */
function situacao({ company, subscription, support }: SalaoRow, now: Date): string {
  const pago = paymentState(subscription?.paidUntil, now)
  const prazo = subscription?.paidUntil
    ? formatDayMonth(paidUntilDate(subscription.paidUntil, company.timezone))
    : undefined

  const cobranca =
    pago === 'em-dia'
      ? `pago até ${prazo}`
      : pago === 'vencido'
        ? `vencido em ${prazo}`
        : 'sem pagamento'

  const partes = [
    company.status === 'suspended' ? 'suspenso' : undefined,
    cobranca,
    support ? 'suporte aberto' : undefined,
  ]
  return partes.filter(Boolean).join(' · ')
}

/** O suporte entra na área do salão, então o backoffice mostra a janela aberta
 * em vez de deixar o acesso invisível de onde foi concedido. */
const BlocoSuporte: FC<{ row: SalaoRow }> = ({ row: { company, support } }) =>
  support ? (
    <form class="service-form" hx-post={`/suporte/${support.id}/encerrar`}>
      <p class="muted">
        Suporte aberto até {formatWhen(support.expiresAt, company.timezone)}. Entre em{' '}
        {STAFF_PREFIX}
        {company.host} com o seu e-mail da plataforma: você vê a agenda, nunca a carteira de
        clientes, e não altera nada.
      </p>
      <div class="actions">
        <button type="submit" class="btn danger">
          Encerrar suporte
        </button>
      </div>
    </form>
  ) : (
    <form class="service-form" hx-post={`/saloes/${company.id}/suporte`}>
      <p class="muted">
        Abre uma janela de 2 horas para você olhar este salão. Fica registrado no log de acessos do
        dono.
      </p>
      <div class="actions">
        <button type="submit" class="btn tonal">
          Abrir suporte
        </button>
      </div>
    </form>
  )

const Campos: FC<{ company?: Company }> = ({ company }) => (
  <div class="fields">
    <label>
      Nome
      <input
        type="text"
        name="nome"
        required
        placeholder="Beleza Pura"
        value={company?.name ?? ''}
      />
    </label>
    <label>
      Endereço do cliente
      <input
        type="text"
        name="host"
        required
        placeholder="beleza-pura.com.br"
        value={company?.host ?? ''}
      />
    </label>
    <label>
      Apelido
      <input
        type="text"
        name="slug"
        placeholder="sai do nome, se vazio"
        value={company?.slug ?? ''}
      />
    </label>
    <label>
      Fuso
      <select name="fuso">
        {FUSOS.map((fuso) => (
          <option key={fuso} value={fuso} selected={(company?.timezone ?? FUSO_PADRAO) === fuso}>
            {fuso.replace('America/', '')}
          </option>
        ))}
      </select>
    </label>
  </div>
)

/** Assinatura e situação são formulários separados do de identidade: salvar o
 * pagamento não deve depender de o endereço estar preenchido certo. */
const BlocoAssinatura: FC<{ row: SalaoRow }> = ({ row }) => {
  const { company, subscription } = row
  const prazo = subscription?.paidUntil
    ? paidUntilDate(subscription.paidUntil, company.timezone)
    : undefined

  return (
    <form class="service-form" hx-post={`/saloes/${company.id}/assinatura`}>
      <fieldset class="team">
        <legend>Assinatura</legend>
        <label>
          Plano
          <select name="plano">
            {PLANOS.map((plano) => (
              <option
                key={plano}
                value={plano}
                selected={(subscription?.plan ?? 'mensal') === plano}
              >
                {plano}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor
          <input
            type="text"
            name="valor"
            placeholder="149,00"
            inputmode="decimal"
            value={formatPrice(subscription?.priceCents ?? null)}
          />
        </label>
        <label>
          Pago até
          <input type="date" name="pago_ate" value={prazo ?? ''} />
        </label>
      </fieldset>
      <div class="actions">
        <button type="submit" class="btn tonal">
          Salvar assinatura
        </button>
      </div>
    </form>
  )
}

const BlocoSituacao: FC<{ row: SalaoRow }> = ({ row: { company } }) => {
  const suspenso = company.status === 'suspended'
  return (
    <form class="service-form" hx-post={`/saloes/${company.id}/situacao`}>
      <input type="hidden" name="situacao" value={suspenso ? 'ativo' : 'suspenso'} />
      <p class="muted">
        {suspenso
          ? 'Suspenso: o cliente não marca horário novo, o que já está confirmado segue valendo e a equipe continua entrando.'
          : 'Suspender bloqueia pedido novo do cliente. Agenda confirmada e acesso da equipe continuam.'}
      </p>
      <div class="actions">
        <button type="submit" class={suspenso ? 'btn filled' : 'btn danger'}>
          {suspenso ? 'Reativar' : 'Suspender'}
        </button>
      </div>
    </form>
  )
}

/** O modal é só marcação: abrir e fechar são navegações do HTMX sobre o mesmo
 * fragmento, então não existe estado de tela para sincronizar. */
const Editar: FC<{ row: SalaoRow; error?: string }> = ({ row, error }) => (
  <div class="overlay">
    <button type="button" class="overlay-bg" hx-get="/" aria-label="Fechar" />
    <div class="modal" role="dialog" aria-modal="true" aria-label={`Editar ${row.company.name}`}>
      <form class="service-form" hx-post={`/saloes/${row.company.id}`}>
        <strong>{row.company.name}</strong>
        {error ? <p class="error">{error}</p> : null}
        <Campos company={row.company} />
        <p class="muted">
          Cliente em {row.company.host}, equipe em {STAFF_PREFIX}
          {row.company.host}. Mudar o endereço muda onde o salão atende: quem tiver o link antigo
          não acha mais.
        </p>
        <div class="actions">
          <button type="submit" class="btn filled">
            Salvar
          </button>
          <button type="button" class="btn ghost" hx-get="/">
            Fechar
          </button>
        </div>
      </form>

      <BlocoAssinatura row={row} />
      <BlocoSituacao row={row} />
      <BlocoSuporte row={row} />
    </div>
  </div>
)

export const Saloes: FC<SaloesProps> = ({ items, editing, error, now }) => (
  <section id="saloes" hx-target="#saloes" hx-swap="outerHTML">
    <h2>Salões</h2>

    <div class="catalog-layout">
      <form class="card service-form" hx-post="/saloes">
        <strong>Novo salão</strong>
        {error && !editing ? <p class="error">{error}</p> : null}
        <Campos />
        <fieldset class="team">
          <legend>Primeiro dono</legend>
          <label>
            Nome
            <input type="text" name="dono" required placeholder="Carla Mendes" />
          </label>
          <label>
            E-mail
            <input type="email" name="email" required placeholder="carla@salao.com.br" />
          </label>
          <label>
            Telefone
            <input type="tel" name="telefone" required placeholder="11988880001" />
          </label>
        </fieldset>
        <button type="submit" class="btn filled">
          <Icon name="add" />
          Criar salão
        </button>
      </form>

      <aside class="card catalog">
        <strong>{items.length} em operação</strong>
        {items.length === 0 ? (
          <p class="muted">Nenhum salão ainda.</p>
        ) : (
          <ul>
            {items.map((row) => (
              <li key={row.company.id} class={row.company.status === 'suspended' ? 'off' : ''}>
                <span>
                  {row.company.name}
                  <small class="muted">
                    {' · '}
                    {row.company.host} · {situacao(row, now)}
                  </small>
                </span>
                <button
                  type="button"
                  class="link"
                  hx-get={`/?editar=${row.company.id}`}
                  aria-label={`Editar ${row.company.name}`}
                >
                  editar
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>

    {editing ? <Editar row={editing} error={error} /> : null}
  </section>
)
