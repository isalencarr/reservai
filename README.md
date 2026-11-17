# reservai

Agenda e reserva de horários para salões. Cada salão é um domínio (whitelabel) e
vive isolado dos outros. São dois endereços por salão:

- `beleza-pura.localhost` — o que o cliente usa.
- `equipe.beleza-pura.localhost` — a área de quem trabalha no salão.

Cada endereço serve só a sua área: rota de equipe no endereço do cliente responde
404, e o contrário também.

Fora dos salões existe um terceiro endereço, o do backoffice, onde quem
administra a plataforma vê e configura os clientes. Cada entrega está no
[CHANGELOG.md](CHANGELOG.md).

## Rodar

```sh
bun install
bun run db:reset   # migrations + dados de exemplo
bun run dev        # http://beleza-pura.localhost:3000
```

Salões de exemplo: `beleza-pura.localhost:3000` e `studio-norte.localhost:3000`,
com a equipe em `equipe.beleza-pura.localhost:3000`. O dono de exemplo é a Carla,
e-mail `carla@belezapura.com.br`; o link de acesso sai no terminal do servidor.

### Backoffice

```sh
export BACKOFFICE_HOST=backoffice.localhost
export PLATFORM_OWNER_EMAIL=voce@exemplo.com
export PLATFORM_OWNER_NAME="Seu nome"
bun run db:migrate   # garante o seu acesso ao backoffice
bun run dev          # http://backoffice.localhost:3000
```

O e-mail do dono da plataforma vem do ambiente, não do repositório: ele é a
chave de tudo, e num sistema só de link por e-mail quem controla aquela caixa
controla a plataforma. Sem `PLATFORM_OWNER_EMAIL`, o app sobe e o backoffice
fica sem ninguém que consiga entrar.

### Acesso de suporte

Para olhar o salão de um cliente, abra uma janela de suporte no backoffice e
entre em `equipe.<host>` com o seu e-mail da plataforma. A janela vence em 2
horas, aparece no registro de acessos do dono e dá só leitura: carteira de
clientes, cadastro da equipe e registro de acessos ficam fora.

### Criar um salão de verdade

```sh
bun run salao:novo --nome "Barbearia do Zé" --host zebarber.com.br \
  --dono "José Alves" --telefone 11944440001
```

O comando cria o salão e o primeiro dono, que entra por `equipe.<host>`. O
backoffice faz o mesmo pela web, com a mesma regra (`src/platform/companies.ts`).
Não há tela pública de criação de salão: isso é operação de quem administra a
plataforma.

## Comandos

| Comando                   | O que faz                                       |
| ------------------------- | ----------------------------------------------- |
| `bun run check`           | gate completo: lint, tipos e testes             |
| `bun test`                | testes de domínio e de integração               |
| `bun run lint`            | Biome (warning quebra) + ESLint de API obsoleta |
| `bun run typecheck`       | `tsc --noEmit`                                  |
| `bun run lint:deprecated` | só a checagem de API obsoleta                   |
| `bun run db:generate`     | gera migration a partir de `src/db/schema.ts`   |
| `bun run db:migrate`      | aplica migrations                               |
| `bun run db:seed`         | recria os dados de exemplo                      |
| `bun run jobs:expire`     | expira pedidos cujo prazo venceu                |
| `bun run salao:novo`      | cria um salão e o primeiro dono                 |

O `lint` roda duas ferramentas: o Biome cuida de estilo e regras gerais, e o
ESLint entra só com `@typescript-eslint/no-deprecated`, que precisa dos tipos do
projeto para ver chamada de API obsoleta. Por isso o TypeScript está fixado na
linha 6: o typescript-eslint ainda não suporta a 7.

## Aparência

A folha de estilo (`public/app.css`) é Material 3 Expressive escrito à mão:
cantos grandes, tipografia pesada, blocos de destaque coloridos, listas em
grupo conectado, menu em pílulas e a resposta física no toque (o canto afrouxa,
o botão encolhe). As cores não estão nela — vêm de
variáveis `--md-*` que o servidor injeta por salão, geradas por
`@material/material-color-utilities` a partir de uma cor-semente. Trocar a cor
do salão muda o app inteiro, para a equipe e para o cliente.

Os ícones são os Material Symbols oficiais, montados em um sprite local por
`bun run icons` — nada vem da internet em tempo de execução. Para acrescentar
um ícone, inclua o nome na lista de `scripts/icons.ts` e rode o comando.

Não usamos biblioteca de componentes: MUI é React e o nosso front é HTML com
HTMX; o `@material/web` do Google está em modo de manutenção desde 2024.

## Como está organizado

- `src/domain/` — regras puras (tempo, jornada, grade do dia). Sem banco, sem HTTP.
- `src/db/` — schema Drizzle, migrations e conexão. Trocar de banco mexe só em `client.ts` e no schema.
- `src/repos/` — acesso ao banco atrás de uma interface por entidade.
- `src/web/` — servidor Hono, resolução do salão pelo domínio, rotas e telas (HTMX).
- `src/web/backoffice/` — o app da plataforma. Host próprio, sem salão no
  contexto: nenhuma rota daqui enxerga `company`.
- `src/repos/setup.ts` — consulta de leitura que cruza serviços, equipe e
  jornada para dizer o que falta configurar. Alimenta o guia e o aviso do topo.
- `src/platform/` — operações da plataforma sobre os salões (criar, editar).
  Usadas pelo backoffice e pelo comando de terminal, com a mesma regra.
- `src/notify/` — mensagens fora da tela. Hoje só a versão em log; o canal real
  (WhatsApp ou SMS) entra quando houver salão piloto.
- `src/jobs/` — rotinas que também rodam fora da web, como a expiração de pedidos.

## Telas

| Rota                    | Endereço   | Quem acessa                                  |
| ----------------------- | ---------- | -------------------------------------------- |
| `/`                     | cliente    | qualquer pessoa                              |
| `/entrar`               | cliente    | nome, telefone e código                      |
| `/reserva`              | cliente    | pedido em passos                             |
| `/reserva/meus`         | cliente    | seus horários e cancelamento                 |
| `/equipe/entrar`        | equipe     | e-mail e link de acesso                      |
| `/equipe`               | equipe     | agendas do salão; prestador cai na própria   |
| `/equipe/pessoas`       | equipe     | só o dono: convidar, editar e desativar      |
| `/equipe/acessos`       | equipe     | só o dono: entradas, saídas e recusas        |
| `/equipe/guia`          | equipe     | como o app funciona e o que falta configurar |
| `/agenda/:prestador`    | equipe     | o próprio prestador ou o dono                |
| `/pendentes/:prestador` | equipe     | o próprio prestador ou o dono                |
| `/horarios`             | equipe     | conferência da disponibilidade               |
| `/servicos`             | equipe     | só o dono                                    |
| `/clientes`             | equipe     | só o dono                                    |
| `/entrar`               | backoffice | e-mail da plataforma e link de acesso        |
| `/`                     | backoffice | lista dos salões em operação                 |

A equipe entra por e-mail: pede um link em `/equipe/entrar` e o link chega pelo
notificador. Em desenvolvimento ele aparece no terminal do servidor, com o
prefixo `[notify:magic-link]`; o código do cliente sai como `[notify:access-code]`.

Ninguém se cadastra sozinho: o link só é emitido para e-mail que já está na
equipe ativa daquele salão. O dono convida em `/equipe/pessoas`, e a pessoa
recebe o link na hora.

## Regras já decididas

1. Um horário só é oferecido se o serviço inteiro couber na jornada e não tocar
   nada ocupado.
2. O pedido do cliente segura o horário. O prazo de confirmação é o menor entre
   24h e uma hora antes do atendimento.
3. Serviço tem duração em minutos e consome quantos slots forem necessários.
4. Cliente é da carteira da empresa; o prestador vê nome e horário, nunca o contato.
5. Bloqueio manual é um agendamento de origem `external`, sem cliente.
6. Cada prestador tem antecedência mínima para receber pedidos (padrão 60 min).
7. O cliente escolhe sempre um prestador; não existe "qualquer profissional".
8. O cliente cancela sozinho até 2h antes; depois disso, só pelo salão.
9. Recusar um pedido não exige motivo.
10. O cliente entra com telefone e código de 6 dígitos (10 minutos, 5
    tentativas). A equipe entra por e-mail, com link de acesso válido por 15
    minutos e sessão de 7 dias. São portas e endereços separados.
11. O prestador mexe na própria agenda e na própria fila. Catálogo, carteira e
    cadastro da equipe são do dono.
12. Quem entra na equipe nasce com jornada de segunda a sábado, 9h–12h e 13h–18h.
13. Entrada, saída e tentativa recusada ficam registradas com e-mail mascarado e
    IP truncado, visíveis em `/equipe/acessos`.
14. A interface segue o Material 3 (Material You). O salão escolhe uma cor da
    lista e o tom (claro, escuro ou automático) em `/equipe/aparencia`; a paleta
    inteira é gerada pelo algoritmo oficial do Google.

15. Salão suspenso não recebe pedido novo, mas continua mostrando e deixando
    cancelar o que já estava marcado, e a equipe continua entrando. A assinatura
    é conferida na mão pelo backoffice; nada suspende sozinho.
16. O acesso de suporte é uma janela curta, concedida no backoffice, só de
    leitura, sem dados pessoais de cliente nem da equipe, e registrada em
    `/equipe/acessos` do próprio salão.
17. Salão novo nasce com o endereço no ar e vazio, então o app diz o que falta:
    serviço ativo, alguém marcado para executar cada serviço e jornada para quem
    atende. O guia mostra isso como passo a passo, na ordem de montagem, e o
    aviso do topo só conta o que impede de marcar.
18. Quem administra a plataforma entra por um host próprio e está em
    `platform_admins`, lista criada na migração a partir do ambiente. Não existe
    cadastro aberto nessa porta, e a sessão de lá não abre a área de nenhum
    salão.

### Uma regra de lint desligada

`style/noDescendingSpecificity` está desligada no `biome.json`. Ela acusa
qualquer `.componente span` escrito depois de outro `.outro span`, o que em uma
folha organizada por componente acontece o tempo todo e só empurra para nomes
de classe artificiais. O resto do gate continua valendo, warnings inclusive.
