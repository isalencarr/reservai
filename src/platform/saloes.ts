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

export const FUSO_PADRAO = 'America/Sao_Paulo'

/** Erro de cadastro é resposta esperada, não exceção: a mesma mensagem serve
 * para o terminal e para o formulário do backoffice. */
export type Erro = { erro: string }

export type Identidade = { nome: string; host: string; slug?: string; fuso?: string }

export type NovoSalao = Identidade & { dono: string; email: string; telefone: string }

type Dados = { name: string; host: string; slug: string; timezone: string }

/**
 * Nome, endereço, apelido e fuso conferidos e na forma que vai ao banco. O host
 * é gravado como o navegador manda — sem protocolo, sem porta, sem barra —,
 * senão nasce um salão que nenhuma requisição encontra.
 */
function dadosDoSalao(input: Identidade): Dados | Erro {
  const name = input.nome.trim()
  const host = normalizeHost(input.host.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
  const slug = slugify(input.slug?.trim() || input.nome)
  const timezone = input.fuso?.trim() || FUSO_PADRAO

  if (!name) return { erro: 'Informe o nome do salão.' }
  if (!host) return { erro: 'Informe o endereço, por exemplo: beleza-pura.com.br.' }
  if (host.startsWith(STAFF_PREFIX)) {
    return {
      erro: `Informe o endereço do cliente, sem "${STAFF_PREFIX}": a equipe entra em ${host}.`,
    }
  }
  // Salão no host do backoffice nasceria inalcançável: o backoffice responde
  // primeiro e o salão nunca apareceria para ninguém.
  if (host === backofficeHost()) {
    return { erro: `${host} é o endereço do backoffice; use outro.` }
  }
  if (!slug) return { erro: 'O nome não gerou um apelido válido; escreva um apelido.' }
  if (!isTimeZone(timezone)) return { erro: `Fuso horário desconhecido: ${timezone}.` }

  return { name, host, slug, timezone }
}

/** O endereço e o apelido são a identidade do salão na rede: dois salões no
 * mesmo endereço fariam um esconder o outro. */
async function emUso(db: Db, dados: Dados, exceto?: string): Promise<Erro | undefined> {
  const repo = createCompanyRepo(db)

  const porHost = await repo.findByHost(dados.host)
  if (porHost && porHost.id !== exceto) return { erro: `Já existe um salão em ${dados.host}.` }

  const porSlug = await repo.findBySlug(dados.slug)
  if (porSlug && porSlug.id !== exceto) {
    return { erro: `O apelido "${dados.slug}" já está em uso.` }
  }
  return undefined
}

/**
 * Criar salão é operação de quem administra a plataforma, pelo backoffice ou
 * pelo terminal: uma página pública de cadastro deixaria qualquer pessoa virar
 * dona de um salão novo no mesmo app.
 */
export async function criarSalao(
  db: Db,
  input: NovoSalao,
): Promise<{ company: Company; owner: Awaited<ReturnType<typeof criarDono>> } | Erro> {
  const dados = dadosDoSalao(input)
  if ('erro' in dados) return dados

  const dono = input.dono.trim()
  const phone = normalizePhone(input.telefone)
  const email = normalizeEmail(input.email)
  if (!dono) return { erro: 'Informe o nome do dono.' }
  if (!phone) return { erro: 'Telefone inválido; use DDD e número, como 11988880001.' }
  if (!email) return { erro: 'E-mail inválido; é por ele que o dono entra.' }

  const conflito = await emUso(db, dados)
  if (conflito) return conflito

  const [company] = await db.insert(companies).values(dados).returning()
  if (!company) return { erro: 'Não foi possível criar o salão.' }

  // A assinatura nasce junto e sem pagamento registrado: salão novo entra na
  // lista como pendente de cobrança, que não é o mesmo que vencido.
  await createSubscriptionRepo(db).save(company.id, {
    plan: 'mensal',
    priceCents: null,
    paidUntil: null,
  })

  return { company, owner: await criarDono(db, company.id, { name: dono, email, phone }) }
}

function criarDono(
  db: Db,
  companyId: string,
  dono: { name: string; email: string; phone: string },
) {
  return createProviderRepo(db).create(companyId, {
    ...dono,
    role: 'owner',
    slotMinutes: 60,
    minLeadMinutes: 60,
  })
}

/** Mudar o endereço muda o lugar onde o salão atende: quem tinha o link antigo
 * cai no 404 de salão não encontrado. */
export async function editarSalao(db: Db, id: string, input: Identidade): Promise<Company | Erro> {
  const dados = dadosDoSalao(input)
  if ('erro' in dados) return dados

  const conflito = await emUso(db, dados, id)
  if (conflito) return conflito

  const atualizado = await createCompanyRepo(db).update(id, dados)
  return atualizado ?? { erro: 'Salão não encontrado.' }
}
