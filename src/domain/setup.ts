/**
 * O que falta para o salão receber cliente. Um salão nasce com o endereço no
 * ar e vazio, e sem esta lista o dono só descobre o problema quando o primeiro
 * cliente não acha horário nenhum.
 */

export type PendenciaKey =
  | 'sem-servico'
  | 'servico-sem-profissional'
  | 'profissional-sem-jornada'
  | 'convite-pendente'

export type Pendencia = {
  key: PendenciaKey
  texto: string
  href: string
  /** Verdadeiro quando o cliente não consegue agendar enquanto isso durar. */
  bloqueia: boolean
}

export type DadosDeSetup = {
  servicosAtivos: number
  /** Nomes, para a pendência dizer qual é o item e não só quantos. */
  servicosSemProfissional: string[]
  profissionaisSemJornada: string[]
  convitesPendentes: string[]
}

const lista = (nomes: string[]) =>
  nomes.length <= 2
    ? nomes.join(' e ')
    : `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2}`

export function pendenciasDeSetup(dados: DadosDeSetup): Pendencia[] {
  const pendencias: Pendencia[] = []

  if (dados.servicosAtivos === 0) {
    pendencias.push({
      key: 'sem-servico',
      texto: 'Cadastre o primeiro serviço: é o que o cliente escolhe para começar.',
      href: '/servicos',
      bloqueia: true,
    })
  }

  if (dados.servicosSemProfissional.length > 0) {
    pendencias.push({
      key: 'servico-sem-profissional',
      texto: `Sem ninguém marcado para executar: ${lista(dados.servicosSemProfissional)}.`,
      href: '/servicos',
      bloqueia: true,
    })
  }

  if (dados.profissionaisSemJornada.length > 0) {
    pendencias.push({
      key: 'profissional-sem-jornada',
      texto: `Sem horário de trabalho: ${lista(dados.profissionaisSemJornada)}.`,
      href: '/horarios',
      bloqueia: true,
    })
  }

  if (dados.convitesPendentes.length > 0) {
    pendencias.push({
      key: 'convite-pendente',
      texto: `Ainda não entrou no app: ${lista(dados.convitesPendentes)}.`,
      href: '/equipe/pessoas',
      bloqueia: false,
    })
  }

  return pendencias
}

/** Pronto para divulgar o endereço: o que sobrou não impede ninguém de marcar. */
export function prontoParaDivulgar(pendencias: Pendencia[]): boolean {
  return pendencias.every((p) => !p.bloqueia)
}
