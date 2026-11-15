/** Preço entra como texto digitado ("90", "90,00", "R$ 90,00") e é guardado em
 * centavos: float para dinheiro acumula erro de arredondamento. */
export function parsePrice(raw: string | undefined): number | null | undefined {
  const text = (raw ?? '').trim()
  if (text === '') return null

  const cleaned = text
    .replace(/^R\$\s*/i, '')
    .replace(/\./g, '')
    .replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined

  return Math.round(Number(cleaned) * 100)
}

export function formatPrice(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',')
}
