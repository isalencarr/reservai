# Changelog

Uma seção por entrega, da mais nova para a mais velha. O que mudou para quem
usa — a lista de arquivos está no histórico do git.

## 3.3 — Um lugar só para os nomes da rede — 2026-11-17

- O código passou a ser todo em inglês. O que a pessoa lê e digita continua em
  português: texto de tela, caminho de rota, campo de formulário e parâmetro de
  URL.
- Esses nomes de rede ficavam espalhados por rota e por tela, cada lado
  escrevendo o seu. Agora moram em `src/web/wire.ts`, e tela e rota leem do
  mesmo lugar.
- Isso achou um defeito: o botão de desativar serviço e o de tirar da equipe
  mandavam `active` e a rota lia `ativo`. Desativar funcionava por acaso; trazer
  de volta nunca funcionou. Corrigido, com teste que usa o que a própria tela
  monta.
- A agenda da equipe usava `?date=` e as telas do cliente `?data=` para a mesma
  coisa. Virou `?data=` em todo lugar.
- O plano da assinatura era gravado como `mensal`/`anual` e agora é
  `monthly`/`yearly`. A migração traduz o que já estava no banco; o backoffice
  continua mostrando "mensal" e "anual" para quem administra.

## 3.2 — Passo a passo da montagem — 2026-11-17

- O guia deixou de listar só o que falta e passou a mostrar o caminho inteiro,
  em cinco passos numerados: serviços, equipe, quem executa cada serviço,
  jornada e divulgar o endereço. Quem está montando o salão vê onde está.
- O passo já cumprido continua à vista, com o que existe hoje ("4 serviços
  ativos"), e o passo que ainda depende do de cima aparece apagado, sem link:
  antes a lista não dizia a ordem, e descobrir que serviço vem antes de jornada
  custava uma volta pelo app.
- Convidar a equipe é o único passo opcional: quem atende sozinho segue em
  frente. Convite não aceito virou nota desse passo.
- O endereço para divulgar saiu do cartão solto e virou o último passo, que só
  chega a sua vez quando o resto está pronto.
- O aviso do topo continua igual, contando só o que impede o cliente de marcar.
- `bun run db:reset` deixava os arquivos `-wal` e `-shm` para trás, e o banco
  recriado subia com erro de I/O. Agora apaga os três.

## 3.1 — Jornada de quem atende — 2026-11-16

- Tela nova em `/equipe/jornada`, só do dono: a semana de cada pessoa, sete dias
  com duas faixas por dia. A lacuna entre as faixas é o almoço, dia sem faixa
  nenhuma é folga, e um botão repõe a jornada padrão de segunda a sábado.
- Antes disso não existia onde mudar jornada: ela só nascia junto com a pessoa.
  O `/horarios` era, e continua sendo, apenas consulta de horário livre — o guia
  dizia o contrário e foi corrigido.
- A semana é conferida antes de gravar: fim depois do início, horário dentro do
  dia e faixas que não se cruzam. Faixa que encosta na outra passa, porque o
  cálculo da agenda já junta as duas.
- A semana troca inteira de uma vez. Nada de meio-caminho entre apagar a antiga
  e gravar a nova, que deixaria a agenda sem oferecer nada.
- A pendência "sem horário de trabalho" agora leva para essa tela, e o acesso de
  suporte vê a jornada sem poder mudar.
- Com a tela nova o menu chegou a dez itens, e em tira horizontal metade ficava
  fora da vista. Em tela larga ele virou uma coluna à esquerda, que acompanha a
  rolagem; no celular continua a tira acima do conteúdo.

## 2.2 — Guia do dono — 2026-11-15

- Tela nova em `/equipe/guia`, primeiro item do menu. Em cima, o que falta
  configurar, com cada item levando para a tela que resolve. Embaixo, como
  funciona cada parte do app, começando pelo que o cliente vê.
- Enquanto faltar algo que impeça o cliente de marcar, um aviso aparece no topo
  de toda tela interna, com link para o guia. Convite de equipe não aceito
  aparece no guia, mas não vira tarja: não impede ninguém de marcar.
- Com tudo configurado, o guia mostra o endereço do cliente para copiar e
  divulgar, e lembra que o endereço da equipe não vai para o cliente.
- Quem atende também abre o guia, com a explicação das telas que alcança e sem
  o checklist, que é tarefa do dono.

## 2.1 — O app sabe o que falta configurar — 2026-11-15

- Uma regra nova responde se o salão está pronto para receber cliente: precisa
  de serviço ativo, de alguém marcado para executar cada serviço e de jornada
  para quem atende. Convite de equipe não aceito entra como aviso, não como
  impedimento.
- A conta é feita uma vez por tela interna aberta, então o aviso do próximo
  marco não depende de cada rota lembrar de calcular.
- Ainda não aparece na tela: isso é o marco 2.2.

## 1.4 — Acesso de suporte — 2026-11-15

- No backoffice dá para abrir uma janela de suporte de 2 horas num salão, e
  encerrar antes do prazo. A janela vence sozinha.
- Com a janela aberta, o seu e-mail da plataforma recebe link de acesso na porta
  da equipe daquele salão (`equipe.<host>`). Sem janela, essa porta responde
  como se o e-mail fosse desconhecido.
- Dentro, você vê o salão como o dono vê: agendas, pedidos, horários e serviços.
  A carteira de clientes, o cadastro da equipe e o registro de acessos ficam
  fora, e o menu não oferece o que você não alcança.
- Nada pode ser alterado. O bloqueio é por método da requisição, num lugar só —
  rota de escrita nova já nasce protegida. A única escrita permitida é sair.
- Abrir e encerrar ficam no registro de acessos do próprio salão, marcados como
  suporte, com e-mail mascarado e o prazo da janela.

## 1.3 — Assinatura e suspensão — 2026-11-15

- Cada salão tem uma assinatura: plano (mensal ou anual), valor e até quando
  está pago. Tudo conferido na mão, sem cobrança automática.
- A lista de salões diz a situação de cada um: "pago até", "vencido em" ou "sem
  pagamento". Salão novo nasce sem pagamento registrado, que é diferente de
  vencido.
- Dá para suspender e reativar um salão. Nada suspende sozinho: você olha os
  vencidos e decide.
- Salão suspenso não recebe pedido novo. A porta do cliente avisa que a agenda
  está fechada e oferece "Meus horários"; o que já estava marcado continua
  valendo e pode ser cancelado pelo cliente.
- A equipe do salão suspenso continua entrando, com um aviso no topo de toda
  tela interna. É por lá que ela vê a agenda e resolve o pagamento.

## 1.2 — Salões pelo backoffice — 2026-11-15

- Dá para criar salão pela web: nome, endereço, apelido, fuso e o primeiro dono,
  que recebe o link de acesso na porta da equipe dele.
- Dá para editar nome, endereço, apelido e fuso de um salão existente. Mudar o
  endereço muda onde ele atende, e a tela avisa isso.
- O fuso passou a ser escolhido numa lista dos fusos do Brasil, e um fuso que o
  sistema não conhece é recusado em vez de virar horário trocado nas telas.
- A regra de criar salão saiu do comando de terminal para `src/platform/`, usada
  pelos dois caminhos. Erro de cadastro virou resposta com mensagem, então a
  mesma frase aparece no terminal e no formulário.
- `bun run salao:novo` continua funcionando igual.

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
