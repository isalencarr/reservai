import type { FC } from 'hono/jsx'

/** Ícones do Material Symbols, servidos de um sprite local. São decorativos:
 * o texto ao lado é quem nomeia a ação. */
export const Icon: FC<{ name: string; class?: string }> = ({ name, class: extra }) => (
  <svg class={`icon ${extra ?? ''}`} aria-hidden="true" focusable="false">
    <use href={`/assets/icons.svg#${name}`} />
  </svg>
)
