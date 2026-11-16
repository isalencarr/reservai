# Changelog

Uma seção por entrega, da mais nova para a mais velha. O que mudou para quem
usa — a lista de arquivos está no histórico do git.

## 1.1 — Porta do backoffice — 2026-11-15

- Existe um terceiro endereço, o do backoffice (`BACKOFFICE_HOST`, em
  desenvolvimento `backoffice.localhost`). Ele não pertence a salão nenhum.
- Quem abre o backoffice é só quem está na tabela `platform_admins`. A entrada é
  por link no e-mail, como a da equipe.
- A lista nasce no `db:migrate`, a partir de `PLATFORM_OWNER_EMAIL` e
  `PLATFORM_OWNER_NAME`. Sem a variável, ninguém entra; com e-mail inválido, a
  migração falha em vez de passar batido.
- Sessão do backoffice não abre a área de equipe de salão nenhum, e sessão de
  dono de salão não abre o backoffice.
- Entrada, saída e tentativa recusada no backoffice ficam registradas sem
  empresa associada, com o motivo começando em "backoffice".
- Primeira tela: a lista dos salões em operação, só leitura.
- Criar salão no endereço do backoffice passou a ser recusado pelo
  `bun run salao:novo`: o salão nasceria inalcançável.
- Correção: em desenvolvimento o endereço chega com a porta
  (`backoffice.localhost:3000`) e o pedido do link morria com erro 500. O host
  do backoffice agora é aceito com e sem porta.
