import { readFile, writeFile } from 'node:fs/promises'

/**
 * Monta um sprite com os ícones que as telas usam, a partir do pacote oficial
 * do Material Symbols. Sprite local em vez de fonte vinda da internet: menos
 * uma requisição a terceiros e nada sai da máquina de quem acessa.
 */
const ICONS = [
  'calendar_month',
  'pending_actions',
  'schedule',
  'content_cut',
  'group',
  'badge',
  'palette',
  'shield_person',
  'logout',
  'chevron_left',
  'chevron_right',
  'add',
  'edit',
  'close',
  'check',
  'event_busy',
  'lock_open',
  'mail',
  'call',
  'person',
  'search',
  'arrow_back',
  'event_available',
  'block',
  'storefront',
  'help',
] as const

const SOURCE = 'node_modules/@material-symbols/svg-400/rounded'
const OUTPUT = 'public/icons.svg'

const symbols = await Promise.all(
  ICONS.map(async (name) => {
    const raw = await readFile(`${SOURCE}/${name}.svg`, 'utf8')
    const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1] ?? '0 -960 960 960'
    const body = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    return `<symbol id="${name}" viewBox="${viewBox}">${body.trim()}</symbol>`
  }),
)

await writeFile(
  OUTPUT,
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>\n`,
)

console.log(`${ICONS.length} ícones em ${OUTPUT}`)
