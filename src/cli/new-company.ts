import { parseArgs } from 'node:util'
import { db } from '../db/client.ts'
import { formatPhone } from '../domain/phone.ts'
import { createCompany } from '../platform/companies.ts'
import { STAFF_PREFIX } from '../web/tenant.ts'

/** O comando é só a porta de terminal da mesma operação que o backoffice faz:
 * a regra de criação vive em `src/platform/companies.ts`. As opções ficam em
 * português porque é o que quem administra a plataforma digita. */
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

const result = await createCompany(db(), {
  name: values.nome,
  host: values.host,
  ownerName: values.dono,
  email: values.email,
  phone: values.telefone,
  slug: values.slug,
  timezone: values.fuso,
})

// Erro de uso não precisa de pilha: quem roda isso quer saber o que corrigir.
if ('error' in result) {
  console.error(`erro: ${result.error}`)
  process.exit(1)
}

console.log(`salão "${result.company.name}" criado`)
console.log(`  clientes: https://${result.company.host}`)
console.log(`  staff:   https://${STAFF_PREFIX}${result.company.host}`)
console.log(
  `  dono:     ${result.owner.name} <${result.owner.email}> (${formatPhone(result.owner.phone)})`,
)
