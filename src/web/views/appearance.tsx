import type { FC } from 'hono/jsx'
import type { Company } from '../../db/schema.ts'
import { PALETTES, type ThemeMode } from '../../domain/theme.ts'

export type AppearanceProps = { company: Company }

const MODES: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'auto', label: 'Automático', hint: 'segue o aparelho de quem acessa' },
  { value: 'light', label: 'Claro', hint: 'sempre claro' },
  { value: 'dark', label: 'Escuro', hint: 'sempre escuro' },
]

/** Sem HTMX de propósito: a cor vive no cabeçalho da página, então trocar o tema
 * precisa recarregar para a tela já aparecer com a paleta nova. */
export const Appearance: FC<AppearanceProps> = ({ company }) => (
  <section id="appearance">
    <h2>Aparência</h2>
    <p class="muted">
      A paleta inteira é gerada pelo Material You a partir da cor escolhida, e vale para o que o
      cliente vê e para esta área.
    </p>

    <form method="post" action="/equipe/aparencia">
      <h3>Cor</h3>
      <ul class="palettes">
        {PALETTES.map((palette) => (
          <li key={palette.key}>
            <button
              type="submit"
              name="cor"
              value={palette.seed}
              class={`palette ${palette.seed.toLowerCase() === company.themeSeed.toLowerCase() ? 'on' : ''}`}
            >
              <span class="swatch" style={`background:${palette.seed}`} />
              {palette.name}
            </button>
          </li>
        ))}
      </ul>

      <h3>Tom</h3>
      <ul class="modes">
        {MODES.map((mode) => (
          <li key={mode.value}>
            <button
              type="submit"
              name="tom"
              value={mode.value}
              class={`btn mode ${mode.value === company.themeMode ? 'on' : ''}`}
              title={mode.hint}
            >
              {mode.label}
            </button>
          </li>
        ))}
      </ul>
    </form>

    <h3>Prévia</h3>
    <div class="card preview">
      <span class="who">Maria Silva</span>
      <span class="what">Corte feminino · segunda-feira às 09:00</span>
      <div class="actions">
        <button type="button" class="btn filled">
          Confirmar
        </button>
        <button type="button" class="btn danger">
          Recusar
        </button>
      </div>
    </div>
  </section>
)
