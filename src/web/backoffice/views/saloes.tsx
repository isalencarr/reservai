import type { FC } from 'hono/jsx'
import type { Company } from '../../../db/schema.ts'
import { FUSO_PADRAO } from '../../../platform/saloes.ts'
import { STAFF_PREFIX } from '../../tenant.ts'
import { Icon } from '../../views/icon.tsx'

export type SaloesProps = {
  items: Company[]
  editing?: Company
  error?: string
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

/** O modal é só marcação: abrir e fechar são navegações do HTMX sobre o mesmo
 * fragmento, então não existe estado de tela para sincronizar. */
const Editar: FC<{ company: Company; error?: string }> = ({ company, error }) => (
  <div class="overlay">
    <button type="button" class="overlay-bg" hx-get="/" aria-label="Fechar" />
    <div class="modal" role="dialog" aria-modal="true" aria-label={`Editar ${company.name}`}>
      <form class="service-form" hx-post={`/saloes/${company.id}`}>
        <strong>{company.name}</strong>
        {error ? <p class="error">{error}</p> : null}
        <Campos company={company} />
        <p class="muted">
          Cliente em {company.host}, equipe em {STAFF_PREFIX}
          {company.host}. Mudar o endereço muda onde o salão atende: quem tiver o link antigo não
          acha mais.
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
    </div>
  </div>
)

export const Saloes: FC<SaloesProps> = ({ items, editing, error }) => (
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
            {items.map((company) => (
              <li key={company.id}>
                <span>
                  {company.name}
                  <small class="muted"> · {company.host}</small>
                </span>
                <button
                  type="button"
                  class="link"
                  hx-get={`/?editar=${company.id}`}
                  aria-label={`Editar ${company.name}`}
                >
                  editar
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>

    {editing ? <Editar company={editing} error={error} /> : null}
  </section>
)
