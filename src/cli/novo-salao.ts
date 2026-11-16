import { parseArgs } from 'node:util'
import { db } from '../db/client.ts'
import { formatPhone } from '../domain/phone.ts'
import { criarSalao } from '../platform/saloes.ts'
import { STAFF_PREFIX } from '../web/tenant.ts'

/** O comando é só a porta de terminal da mesma operação que o backoffice faz:
 * a regra de criação vive em `src/platform/saloes.ts`. */
const { values } = parseArgs({
  options: {
    nome: { type: 'string' },
    host: { type: 'string' },
    dono: { type: 'string' },
    email: { type: 'string' },
    telefone: { type: 'string' },
    slug: { type: 'string' },
    fuso: { type: 'string' },
  },
})

if (!values.nome || !values.host || !values.dono || !values.email || !values.telefone) {
  console.error(
    'uso: bun run salao:novo --nome "Beleza Pura" --host beleza-pura.com.br \\\n' +
      '       --dono "Carla Mendes" --email carla@salao.com.br --telefone 11988880001 \\\n' +
      '       [--slug beleza-pura] [--fuso America/Sao_Paulo]',
  )
  process.exit(1)
}

const feito = await criarSalao(db(), {
  nome: values.nome,
  host: values.host,
  dono: values.dono,
  email: values.email,
  telefone: values.telefone,
  slug: values.slug,
  fuso: values.fuso,
})

// Erro de uso não precisa de pilha: quem roda isso quer saber o que corrigir.
if ('erro' in feito) {
  console.error(`erro: ${feito.erro}`)
  process.exit(1)
}

console.log(`salão "${feito.company.name}" criado`)
console.log(`  clientes: https://${feito.company.host}`)
console.log(`  equipe:   https://${STAFF_PREFIX}${feito.company.host}`)
console.log(
  `  dono:     ${feito.owner.name} <${feito.owner.email}> (${formatPhone(feito.owner.phone)})`,
)
