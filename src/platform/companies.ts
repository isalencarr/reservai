import type { Db } from '../db/client.ts'
import { type Company, companies } from '../db/schema.ts'
import { normalizeEmail } from '../domain/email.ts'
import { normalizePhone } from '../domain/phone.ts'
import { slugify } from '../domain/slug.ts'
import { isTimeZone } from '../domain/time.ts'
import { createCompanyRepo } from '../repos/companies.ts'
import { createProviderRepo } from '../repos/providers.ts'
import { createSubscriptionRepo } from '../repos/subscriptions.ts'
import { backofficeHost } from '../web/backoffice/host.ts'
import { normalizeHost, STAFF_PREFIX } from '../web/tenant.ts'

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

/** Erro de cadastro é resposta esperada, não exceção: a mesma mensagem serve
 * para o terminal e para o formulário do backoffice. */
export type PlatformError = { error: string }

export type CompanyIdentity = { name: string; host: string; slug?: string; timezone?: string }

export type NewCompany = CompanyIdentity & { ownerName: string; email: string; phone: string }

type CompanyFields = { name: string; host: string; slug: string; timezone: string }

/**
 * Nome, endereço, apelido e fuso conferidos e na forma que vai ao banco. O host
 * é gravado como o navegador manda — sem protocolo, sem porta, sem barra —,
 * senão nasce um salão que nenhuma requisição encontra.
 */
function companyFields(input: CompanyIdentity): CompanyFields | PlatformError {
  const name = input.name.trim()
  const host = normalizeHost(input.host.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
  const slug = slugify(input.slug?.trim() || input.name)
  const timezone = input.timezone?.trim() || DEFAULT_TIMEZONE

  if (!name) return { error: 'Informe o nome do salão.' }
  if (!host) return { error: 'Informe o endereço, por exemplo: beleza-pura.com.br.' }
  if (host.startsWith(STAFF_PREFIX)) {
    return {
      error: `Informe o endereço do cliente, sem "${STAFF_PREFIX}": a equipe entra em ${host}.`,
    }
  }
  // Salão no host do backoffice nasceria inalcançável: o backoffice responde
  // primeiro e o salão nunca apareceria para ninguém.
  if (host === backofficeHost()) {
    return { error: `${host} é o endereço do backoffice; use outro.` }
  }
  if (!slug) return { error: 'O nome não gerou um apelido válido; escreva um apelido.' }
  if (!isTimeZone(timezone)) return { error: `Fuso horário desconhecido: ${timezone}.` }

  return { name, host, slug, timezone }
}

/** O endereço e o apelido são a identidade do salão na rede: dois salões no
 * mesmo endereço fariam um esconder o outro. */
async function alreadyTaken(
  db: Db,
  fields: CompanyFields,
  except?: string,
): Promise<PlatformError | undefined> {
  const repo = createCompanyRepo(db)

  const byHost = await repo.findByHost(fields.host)
  if (byHost && byHost.id !== except) return { error: `Já existe um salão em ${fields.host}.` }

  const bySlug = await repo.findBySlug(fields.slug)
  if (bySlug && bySlug.id !== except) {
    return { error: `O apelido "${fields.slug}" já está em uso.` }
  }
  return undefined
}

/**
 * Criar salão é operação de quem administra a plataforma, pelo backoffice ou
 * pelo terminal: uma página pública de cadastro deixaria qualquer pessoa virar
 * dona de um salão novo no mesmo app.
 */
export async function createCompany(
  db: Db,
  input: NewCompany,
): Promise<{ company: Company; owner: Awaited<ReturnType<typeof createOwner>> } | PlatformError> {
  const fields = companyFields(input)
  if ('error' in fields) return fields

  const ownerName = input.ownerName.trim()
  const phone = normalizePhone(input.phone)
  const email = normalizeEmail(input.email)
  if (!ownerName) return { error: 'Informe o nome do dono.' }
  if (!phone) return { error: 'Telefone inválido; use DDD e número, como 11988880001.' }
  if (!email) return { error: 'E-mail inválido; é por ele que o dono entra.' }

  const conflict = await alreadyTaken(db, fields)
  if (conflict) return conflict

  const [company] = await db.insert(companies).values(fields).returning()
  if (!company) return { error: 'Não foi possível criar o salão.' }

  // A assinatura nasce junto e sem pagamento registrado: salão novo entra na
  // lista como pendente de cobrança, que não é o mesmo que vencido.
  await createSubscriptionRepo(db).save(company.id, {
    plan: 'mensal',
    priceCents: null,
    paidUntil: null,
  })

  return { company, owner: await createOwner(db, company.id, { name: ownerName, email, phone }) }
}

function createOwner(
  db: Db,
  companyId: string,
  owner: { name: string; email: string; phone: string },
) {
  return createProviderRepo(db).create(companyId, {
    ...owner,
    role: 'owner',
    slotMinutes: 60,
    minLeadMinutes: 60,
  })
}

/** Mudar o endereço muda o lugar onde o salão atende: quem tinha o link antigo
 * cai no 404 de salão não encontrado. */
export async function updateCompany(
  db: Db,
  id: string,
  input: CompanyIdentity,
): Promise<Company | PlatformError> {
  const fields = companyFields(input)
  if ('error' in fields) return fields

  const conflict = await alreadyTaken(db, fields, id)
  if (conflict) return conflict

  const updated = await createCompanyRepo(db).update(id, fields)
  return updated ?? { error: 'Salão não encontrado.' }
}
