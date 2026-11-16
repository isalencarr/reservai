import type { FC } from 'hono/jsx'
import type { Company } from '../../../db/schema.ts'
import { STAFF_PREFIX } from '../../tenant.ts'
import { Icon } from '../../views/icon.tsx'

export type SaloesProps = { items: Company[] }

export const Saloes: FC<SaloesProps> = ({ items }) => (
  <section id="saloes">
    <div class="hero">
      <Icon name="storefront" class="hero-icon" />
      <strong>
        {items.length} {items.length === 1 ? 'salão' : 'salões'}
      </strong>
      <span class="hero-sub">clientes com o software em operação</span>
    </div>

    {items.length === 0 ? (
      <p class="empty">Nenhum salão ainda.</p>
    ) : (
      <ul class="people">
        {items.map((company) => (
          <li key={company.id}>
            <span class="item">
              <Icon name="storefront" class="avatar" />
              <span class="text">
                <span>{company.name}</span>
                <small>
                  {company.host} · equipe em {STAFF_PREFIX}
                  {company.host} · {company.timezone}
                </small>
              </span>
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
)
