# reservai

Agenda e reserva de horários para salões. Cada salão é um domínio (whitelabel) e
vive isolado dos outros. São dois endereços por salão:

- `beleza-pura.localhost` — o que o cliente usa.
- `equipe.beleza-pura.localhost` — a área de quem trabalha no salão.

Cada endereço serve só a sua área: rota de equipe no endereço do cliente responde
404, e o contrário também.

## Rodar

```sh
bun install
bun run db:reset   # migrations + dados de exemplo
bun run dev        # http://beleza-pura.localhost:3000
```

Salões de exemplo: `beleza-pura.localhost:3000` e `studio-norte.localhost:3000`,
com a equipe em `equipe.beleza-pura.localhost:3000`. O dono de exemplo é a Carla,
telefone `11988880001`; o código de acesso sai no terminal do servidor.

### Criar um salão de verdade

```sh
bun run salao:novo --nome "Barbearia do Zé" --host zebarber.com.br \
  --dono "José Alves" --telefone 11944440001
```

O comando cria o salão e o primeiro dono, que entra por `equipe.<host>`. Não há
tela pública de criação de salão: isso é operação de quem administra o servidor.

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

## Como está organizado

- `src/domain/` — regras puras (tempo, jornada, grade do dia). Sem banco, sem HTTP.
- `src/db/` — schema Drizzle, migrations e conexão. Trocar de banco mexe só em `client.ts` e no schema.
- `src/repos/` — acesso ao banco atrás de uma interface por entidade.
- `src/web/` — servidor Hono, resolução do salão pelo domínio, rotas e telas (HTMX).
- `src/notify/` — mensagens fora da tela. Hoje só a versão em log; o canal real
  (WhatsApp ou SMS) entra quando houver salão piloto.
- `src/jobs/` — rotinas que também rodam fora da web, como a expiração de pedidos.

## Telas

| Rota                    | Endereço | Quem acessa                              |
| ----------------------- | -------- | ---------------------------------------- |
| `/`                     | cliente  | qualquer pessoa                          |
| `/entrar`               | cliente  | nome, telefone e código                  |
| `/reserva`              | cliente  | pedido em passos                         |
| `/reserva/meus`         | cliente  | seus horários e cancelamento             |
| `/` e `/equipe`         | equipe   | painel com o que a pessoa pode abrir     |
| `/equipe/entrar`        | equipe   | telefone cadastrado e código             |
| `/equipe/pessoas`       | equipe   | só o dono: adicionar, editar e desativar |
| `/agenda/:prestador`    | equipe   | o próprio prestador ou o dono            |
| `/pendentes/:prestador` | equipe   | o próprio prestador ou o dono            |
| `/horarios`             | equipe   | conferência da disponibilidade           |
| `/servicos`             | equipe   | só o dono                                |
| `/clientes`             | equipe   | só o dono                                |

Em desenvolvimento os códigos de acesso aparecem no terminal do servidor, com o
prefixo `[notify:access-code]`.

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
10. Cliente e equipe entram com telefone e código de 6 dígitos (10 minutos, 5
    tentativas). São portas separadas: um código não abre a outra. A sessão fica
    num cookie assinado, válido só naquele salão.
11. O prestador mexe na própria agenda e na própria fila. Catálogo, carteira e
    cadastro da equipe são do dono.
12. Quem entra na equipe nasce com jornada de segunda a sábado, 9h–12h e 13h–18h.
