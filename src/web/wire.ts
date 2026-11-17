/**
 * Os nomes que atravessam a rede, num lugar só. Formulário e URL ficam em
 * português porque a pessoa lê e digita isso; daqui para dentro o código só vê
 * nome em inglês, e a mistura não se espalha por rota nenhuma.
 */

export const WIRE = {
  // identidade de quem usa
  name: 'nome',
  phone: 'telefone',
  email: 'email',
  code: 'codigo',
  role: 'papel',

  // catálogo e agenda
  service: 'servico',
  provider: 'prestador',
  duration: 'duracao',
  price: 'preco',
  date: 'data',
  time: 'hora',
  slot: 'slot',
  leadMinutes: 'antecedencia',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  note: 'note',
  active: 'ativo',

  // aparência
  color: 'cor',
  mode: 'tom',

  // salão, no backoffice
  ownerName: 'dono',
  host: 'host',
  slug: 'slug',
  timezone: 'fuso',
  plan: 'plano',
  amount: 'valor',
  paidUntil: 'pago_ate',
  status: 'situacao',

  // só na URL
  next: 'next',
  query: 'q',
  editing: 'editar',
  person: 'pessoa',
  view: 'ver',
} as const

/** Valores que também viajam, então também moram aqui. */
export const YES = 'sim'
export const NO = 'nao'
export const STATUS = { active: 'ativo', suspended: 'suspenso' } as const

/** Jornada manda uma faixa por dia e ponta: `d2i1` é a primeira faixa de
 * terça, `d2f1` o fim dela. São 28 campos, então o nome é montado. */
export function rangeField(weekday: number, band: 1 | 2, edge: 'start' | 'end'): string {
  return `d${weekday}${edge === 'start' ? 'i' : 'f'}${band}`
}

export type WireBody = Record<string, unknown>

/** Campo ausente, campo vazio e arquivo enviado dão a mesma string vazia. */
export function text(body: WireBody, field: string): string {
  const value = body[field]
  return typeof value === 'string' ? value.trim() : ''
}

/** Caixa de seleção repetida: um valor sozinho e uma lista chegam diferentes. */
export function values(body: WireBody, field: string): string[] {
  const value = body[field]
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return list.filter((item): item is string => typeof item === 'string')
}
