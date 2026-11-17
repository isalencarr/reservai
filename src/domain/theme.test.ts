import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_SEED,
  isThemeMode,
  PALETTES,
  paletteOf,
  schemeVariables,
  themeCss,
} from './theme.ts'

describe('paletas', () => {
  it('todas têm semente em hexadecimal', () => {
    for (const palette of PALETTES) expect(palette.seed).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(PALETTES.length).toBeGreaterThan(3)
  })

  it('encontra a paleta pela semente, ignorando caixa', () => {
    expect(paletteOf(DEFAULT_SEED)?.key).toBe('violeta')
    expect(paletteOf('#6750a4')?.name).toBe('Violeta')
    expect(paletteOf('#123456')).toBeUndefined()
  })
})

describe('schemeVariables', () => {
  it('gera as variáveis que a folha de estilo usa', () => {
    const css = schemeVariables(DEFAULT_SEED, false)
    for (const token of ['--md-primary:', '--md-on-surface:', '--md-surface-container-high:']) {
      expect(css).toContain(token)
    }
  })

  it('o tom escuro muda a superfície', () => {
    const light = schemeVariables(DEFAULT_SEED, false)
    const dark = schemeVariables(DEFAULT_SEED, true)
    expect(light).not.toBe(dark)
  })

  it('sementes diferentes dão cores diferentes', () => {
    expect(schemeVariables('#0B57D0', false)).not.toBe(schemeVariables('#146C2E', false))
  })
})

describe('themeCss', () => {
  it('no modo automático entrega os dois tons', () => {
    const css = themeCss(DEFAULT_SEED, 'auto')
    expect(css).toContain('color-scheme: light')
    expect(css).toContain('@media (prefers-color-scheme: dark)')
  })

  it('no modo fixo entrega só um tom', () => {
    expect(themeCss(DEFAULT_SEED, 'dark')).not.toContain('@media')
    expect(themeCss(DEFAULT_SEED, 'dark')).toContain('color-scheme: dark')
    expect(themeCss(DEFAULT_SEED, 'light')).toContain('color-scheme: light')
  })
})

describe('isThemeMode', () => {
  it('aceita só os três modos', () => {
    expect(isThemeMode('auto')).toBe(true)
    expect(isThemeMode('dark')).toBe(true)
    expect(isThemeMode('sepia')).toBe(false)
    expect(isThemeMode(undefined)).toBe(false)
  })
})
