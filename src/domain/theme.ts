import {
  argbFromHex,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  SchemeTonalSpot,
} from '@material/material-color-utilities'

export const THEME_MODES = ['auto', 'light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export type Palette = { key: string; name: string; seed: string }

/**
 * As sementes que o Android oferece quando não há papel de parede para extrair
 * cor. O salão escolhe uma delas e o algoritmo do Material You gera a paleta
 * inteira: não há como combinar cores que brigam entre si.
 */
export const PALETTES: Palette[] = [
  { key: 'violeta', name: 'Violeta', seed: '#6750A4' },
  { key: 'azul', name: 'Azul', seed: '#0B57D0' },
  { key: 'verde', name: 'Verde', seed: '#146C2E' },
  { key: 'laranja', name: 'Laranja', seed: '#B34700' },
  { key: 'rosa', name: 'Rosa', seed: '#9C4257' },
  { key: 'grafite', name: 'Grafite', seed: '#4A5B6B' },
]

export const DEFAULT_SEED = PALETTES[0]?.seed ?? '#6750A4'

export function paletteOf(seed: string): Palette | undefined {
  return PALETTES.find((p) => p.seed.toLowerCase() === seed.trim().toLowerCase())
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
}

type TokenSource = { getArgb: (scheme: SchemeTonalSpot) => number }

const TOKENS: [string, TokenSource][] = Object.getOwnPropertyNames(MaterialDynamicColors)
  .map((name) => {
    const value = Object.getOwnPropertyDescriptor(MaterialDynamicColors, name)?.value
    return [name, value] as [string, TokenSource]
  })
  .filter(([name, value]) => Boolean(value?.getArgb) && !name.endsWith('PaletteKeyColor'))

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** Um conjunto de variáveis CSS por tom, no formato `--md-surface-container`. */
export function schemeVariables(seed: string, dark: boolean): string {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), dark, 0)
  return TOKENS.map(
    ([name, token]) => `--md-${kebab(name)}: ${hexFromArgb(token.getArgb(scheme))};`,
  ).join('\n  ')
}

const cache = new Map<string, string>()

/**
 * CSS do tema do salão. Em `auto` os dois tons entram e quem decide é o
 * aparelho de quem acessa; nos demais, só o tom escolhido existe.
 */
export function themeCss(seed: string, mode: ThemeMode): string {
  const key = `${seed}:${mode}`
  const cached = cache.get(key)
  if (cached) return cached

  const light = `:root {\n  color-scheme: light;\n  ${schemeVariables(seed, false)}\n}`
  const dark = `:root {\n  color-scheme: dark;\n  ${schemeVariables(seed, true)}\n}`

  const css =
    mode === 'light'
      ? light
      : mode === 'dark'
        ? dark
        : `${light}\n@media (prefers-color-scheme: dark) {\n${dark}\n}`

  cache.set(key, css)
  return css
}
