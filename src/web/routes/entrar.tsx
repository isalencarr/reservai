import { type Context, Hono } from 'hono'
import type { Db } from '../../db/client.ts'
import { CODE_MAX_ATTEMPTS, codeExpiry, generateCode, hashCode } from '../../domain/access-code.ts'
import { normalizePhone } from '../../domain/phone.ts'
import type { Notifier } from '../../notify/notifier.ts'
import { createAccessCodeRepo } from '../../repos/access-codes.ts'
import { createCustomerRepo } from '../../repos/customers.ts'
import { setCustomerSession } from '../customer-session.ts'
import { requireArea, type TenantEnv } from '../tenant.ts'
import { Entrar, type EntrarProps } from '../views/entrar.tsx'
import { Layout } from '../views/layout.tsx'

/** Só caminhos internos: `next` vem do formulário e não pode virar redirecionamento
 * para fora do salão. */
function safeNext(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/reserva'
}

export function entrarRoutes(db: Db, notifier: Notifier) {
  const codeRepo = createAccessCodeRepo(db)
  const customerRepo = createCustomerRepo(db)
  const app = new Hono<TenantEnv>()
  app.use('*', requireArea('customer'))

  const render = (c: Context<TenantEnv>, props: EntrarProps, status = 200) =>
    c.html(
      c.req.header('HX-Request') ? (
        <Entrar {...props} />
      ) : (
        <Layout title="Entrar" company={c.get('company')}>
          <Entrar {...props} />
        </Layout>
      ),
      status as 200,
    )

  app.get('/', (c) => render(c, { next: safeNext(c.req.query('next')) }))

  app.post('/', async (c) => {
    const company = c.get('company')
    const body = await c.req.parseBody()
    const next = safeNext(body.next)
    const name = typeof body.nome === 'string' ? body.nome.trim() : ''
    const phone = normalizePhone(typeof body.telefone === 'string' ? body.telefone : undefined)

    if (name.length < 2) return render(c, { next, error: 'Escreva seu nome.' }, 422)
    if (!phone) {
      return render(c, { next, error: 'Telefone inválido. Use DDD e número.' }, 422)
    }

    const code = generateCode()
    await codeRepo.issue({
      companyId: company.id,
      phone,
      name,
      audience: 'customer',
      codeHash: hashCode(code),
      expiresAt: codeExpiry(new Date()),
    })
    await notifier.send({ kind: 'access-code', to: phone, code })

    return render(c, { next, phone })
  })

  app.post('/codigo', async (c) => {
    const company = c.get('company')
    const body = await c.req.parseBody()
    const next = safeNext(body.next)
    const phone = normalizePhone(typeof body.telefone === 'string' ? body.telefone : undefined)
    const typed = typeof body.codigo === 'string' ? body.codigo.replace(/\D/g, '') : ''

    if (!phone) return render(c, { next, error: 'Comece de novo, por favor.' }, 422)

    const active = await codeRepo.findActive(company.id, phone, 'customer', new Date())
    if (!active) {
      return render(c, { next, error: 'O código venceu. Peça outro.' }, 422)
    }

    if (active.attempts + 1 >= CODE_MAX_ATTEMPTS && active.codeHash !== hashCode(typed)) {
      // Erros demais queimam o código: sem isso, dá para tentar os seis dígitos até acertar.
      await codeRepo.clear(company.id, phone, 'customer')
      return render(c, { next, error: 'Muitas tentativas. Peça um código novo.' }, 422)
    }

    if (active.codeHash !== hashCode(typed)) {
      await codeRepo.registerAttempt(active.id)
      return render(c, { next, phone, error: 'Código errado.' }, 422)
    }

    const customer = await customerRepo.upsert(company.id, phone, active.name)
    await codeRepo.clear(company.id, phone, 'customer')
    await setCustomerSession(c, company.id, customer.id)

    c.header('HX-Redirect', next)
    return c.redirect(next, 303)
  })

  return app
}
