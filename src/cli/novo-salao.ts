import { parseArgs } from 'node:util'
import { type createDb, db } from '../db/client.ts'
import { companies } from '../db/schema.ts'
import { normalizeEmail } from '../domain/email.ts'
import { formatPhone, normalizePhone } from '../domain/phone.ts'
import { slugify } from '../domain/slug.ts'
import { createCompanyRepo } from '../repos/companies.ts'
import { createProviderRepo } from '../repos/providers.ts'
import { backofficeHost } from '../web/backoffice/host.ts'
import { normalizeHost, STAFF_PREFIX } from '../web/tenant.ts'

export type NovoSalao = {
  nome: string
  host: string
  dono: string
  email: string
  telefone: string
  slug?: string
  fuso?: string
}

/**
 * Criar salão é operação de quem administra o servidor, não uma tela pública:
 * uma página de cadastro aberta deixaria qualquer pessoa virar dona de um salão
 * novo no mesmo app.
 */
export async function criarSalao(database: ReturnType<typeof createDb>, input: NovoSalao) {
  // O host é gravado como o navegador manda: sem protocolo, sem porta, sem barra.
  // Guardar "salao.com.br:3000" criaria um salão que nenhuma requisição encontra.
  const host = normalizeHost(input.host.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
  const slug = slugify(input.slug ?? input.nome)
  const phone = normalizePhone(input.telefone)
  const email = normalizeEmail(input.email)

  if (!input.nome.trim()) throw new Error('informe --nome')
  if (!host) throw new Error('informe --host, por exemplo: --host salao.com.br')
  if (host.startsWith(STAFF_PREFIX)) {
    throw new Error(
      `informe o endereço do cliente, sem "${STAFF_PREFIX}": a equipe entra em ${host}`,
    )
  }
  if (!slug) throw new Error('o nome não gerou um endereço curto válido; use --slug')
  // Salão no host do backoffice nasceria inalcançável: o backoffice responde
  // primeiro e o salão nunca apareceria para ninguém.
  if (host === backofficeHost()) {
    throw new Error(`${host} é o endereço do backoffice; use outro --host`)
  }
  if (!input.dono.trim()) throw new Error('informe --dono')
  if (!phone) throw new Error('telefone inválido; use DDD e número, como 11988880001')
  if (!email) throw new Error('e-mail inválido; é por ele que o dono entra')

  const companyRepo = createCompanyRepo(database)
  if (await companyRepo.findByHost(host)) {
    throw new Error(`já existe um salão em ${host}; use outro --host`)
  }
  if (await companyRepo.findBySlug(slug)) {
    throw new Error(`o apelido "${slug}" já está em uso; escolha outro com --slug`)
  }

  const [company] = await database
    .insert(companies)
    .values({ name: input.nome.trim(), slug, host, timezone: input.fuso ?? 'America/Sao_Paulo' })
    .returning()
  if (!company) throw new Error('não foi possível criar o salão')

  const owner = await createProviderRepo(database).create(company.id, {
    name: input.dono.trim(),
    email,
    phone,
    role: 'owner',
    slotMinutes: 60,
    minLeadMinutes: 60,
  })

  return { company, owner }
}

if (import.meta.main) {
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

  try {
    const { company, owner } = await criarSalao(db(), {
      nome: values.nome,
      host: values.host,
      dono: values.dono,
      email: values.email,
      telefone: values.telefone,
      slug: values.slug,
      fuso: values.fuso,
    })

    console.log(`salão "${company.name}" criado`)
    console.log(`  clientes: https://${company.host}`)
    console.log(`  equipe:   https://${STAFF_PREFIX}${company.host}`)
    console.log(`  dono:     ${owner.name} <${owner.email}> (${formatPhone(owner.phone)})`)
  } catch (erro) {
    // Erro de uso não precisa de pilha: quem roda isso quer saber o que corrigir.
    console.error(`erro: ${erro instanceof Error ? erro.message : erro}`)
    process.exit(1)
  }
}
