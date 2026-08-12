# SPEC-38 — Times com níveis, papéis portados por time e stack como perfil aberto

> Corrige uma falha de abstração apontada em uso real (JOURNEY §175): o modelo
> atual funde a identidade organizacional do time com a escolha técnica
> corrente (`perfis_time`), não gradua a participação (`usuario_time` sem
> nível — todo membro é admin de fato) e atribui papéis de acesso só a
> e-mails, nunca ao time que de fato é o owner (`usuario_papel.email`).

## 1. Origem

Três observações do usuário, com as decisões que as fecharam:

1. **"A stack é arquétipo, e aberto"** — um time pode começar a trabalhar com
   tecnologia A ou B a qualquer momento; isso não é atributo da identidade
   dele. E os owners dos papéis (arquitetura, agilidade, QA) **não configuram
   por stack**: o eixo estável da configuração é o componente/arquétipo
   (serviço, fila, batch…), direção que a SPEC-36 já mediu e apontou.
2. **"Time = grupo de usuários com níveis"** — visualizar quebras · fazer
   quebras e operar · administrar — ou grupo que ocupa papéis de owner (o
   time de arquitetura opera E edita prompts, fluxo etc.).
3. **Participação cross é comum** — um usuário em N times, com nível próprio
   em cada um. (O vínculo N:N já existe; o que falta é o nível por vínculo.)

### Decisões fechadas com o usuário

- **D1 — curadoria configurável**: o admin define SE haverá curadoria do
  catálogo de perfis de stack e por qual papel. O owner do time pode criar
  perfis e liberar acesso a outro dev como owner; o próprio owner pode ter o
  papel de curadoria.
- **D2 — níveis não colapsam**: `administrar` NÃO é o mesmo que `operar`.
  Administrar significa lidar com as configurações.
- **D3 — configuração é de owner**: para editar configurações é preciso ser
  owner do time ou receber permissão de um owner.
- **D4 — migração**: os `perfis_time` existentes podem ser zerados; nada a
  migrar.

## 2. Estado atual (o que o código diz)

- `perfis_time` (`packages/server/src/db/schema.ts`): linha por
  `(timeId, tipoNo, campo) → valor`. "Trabalha com Java" é atributo do time.
- `usuario_time`: só `(email, timeId)`. O comentário da tabela assume o
  problema: "sem papel de admin separado, qualquer membro do time administra
  a própria lista de membros". `convites_time` idem — qualquer membro gera.
- RBAC da SPEC-28: papéis da organização, escopo opcional por time, recursos
  de configuração em lista fechada (`auth/permissoes.ts`), atribuição por
  e-mail (`usuario_papel`). Falha aberta quando não há RBAC configurado.
- Consumo dos perfis: sugestões no `PropertiesPanel` ("usar sugestão: Java"),
  captura pelo botão "salvar estes valores como padrão do time", contexto da
  `ConversaPanel`, aba "Perfis de time".

## 3. Modelo-alvo

### 3.1 Níveis de participação (D2, D3)

`usuario_time` ganha `nivel`:

| nível | pode |
|---|---|
| `visualizar` | abrir e ler quebras do time |
| `operar` | tudo do dia a dia: criar/editar quebras, derivar, refinar, esteira |
| `owner` | tudo acima + configurações do time + membros/níveis + convites sem teto |

Regras:

- **Teto do convite**: qualquer membro convida até o PRÓPRIO nível (pedido
  literal: "convidar mais users de no máximo mesmo nível"). `convites_time`
  ganha `nivel`; aceitar o convite grava o vínculo com esse nível.
- **Configuração exige owner OU delegação** (D3): as rotas de configuração
  (campos, regras, template, pipeline, perfis…) passam a exigir nível
  `owner` no time-alvo, OU permissão RBAC explícita no recurso (que é a
  "permissão de owner" da D3 — concedida via papéis, como hoje). A falha
  aberta da SPEC-28 continua valendo só para o eixo RBAC; o eixo de nível é
  sempre exigido.
- **Escrita de quebra exige `operar`**; `visualizar` recebe 403 na escrita e
  a UI esconde o que não pode (mesma filosofia da SPEC-28 Fase 2: esconder é
  conveniência, a negação mora na rota).
- Migração: membros existentes viram `owner` — é o poder que já têm hoje de
  fato; rebaixar alguém é decisão humana pós-migração, não efeito colateral.

### 3.2 Papel portado por time (ponto 2, D3)

Nova tabela `time_papel (time_id, papel_id)`: um papel de acesso pode ser
atribuído a um TIME, além de a e-mails. Herança: **membros de nível `owner`
do time portador herdam o papel** — coerente com D3 (um `operar` do time de
arquitetura opera; editar prompts pede owner ou delegação individual, que
continua existindo via `usuario_papel`). Entrar/sair do time (ou mudar de
nível) atualiza a herança sozinho — é o que a atribuição por e-mail nunca
conseguiu.

`AcessosTab` ganha a atribuição a time ao lado da atribuição a pessoa.

### 3.3 Stack como perfil aberto (ponto 1, D1, D4)

Some o `perfis_time`; nascem:

- `perfis_stack (id, organizacao_id, nome, criado_por, criado_em)` — o
  catálogo, da organização, com nome de gente ("Java + Spring Boot").
- `perfil_stack_valores (perfil_id, tipo_no, campo, valor)` — o mesmo
  formato de valores de hoje, só que pendurado no perfil, não no time.
- `times.perfil_stack_id` (nullable) — o time APONTA um perfil. Trocar de
  tecnologia é trocar o ponteiro (ou editar o perfil), não reescrever o time.

Curadoria (D1) reusa a máquina da SPEC-28: recurso novo `perfis-stack` na
lista fechada. Sem nenhum papel com esse recurso → catálogo aberto (qualquer
owner de time cria/edita — "modo aberto continua abrindo"). O admin liga a
curadoria criando um papel com `perfis-stack:editar` e dando-o a quem cura —
que pode ser uma pessoa, o time de arquitetura via §3.2, ou o próprio owner
do time. Apontar o ponteiro do próprio time é ato de owner do time, sempre.

Consumo não muda de mecânica: sugestões, captura ("salvar como padrão")
e conversa leem o perfil apontado pelo time ativo. A captura grava no perfil
apontado; sem ponteiro, oferece criar um perfil novo com os valores lidos
(respeitando a curadoria). A aba "Perfis de time" vira "Perfis de stack":
catálogo + qual perfil este time usa.

Migração (D4): `DROP TABLE perfis_time`, sem transporte de dados. O recurso
RBAC `perfis-time` sai da lista fechada junto (o teste-guarda de cobertura
obriga a decisão no mesmo commit).

## 4. O que NÃO muda

- O RBAC da SPEC-28 (recursos, ações, escopo org/time, resolução) — muda só
  QUEM porta (times além de e-mails) e nasce um recurso novo.
- `quebras` continua fora do RBAC (decisão assinada em `RECURSOS_SEM_ROTA`);
  o gate de escrita passa a ser o NÍVEL, que é o eixo certo para trabalho.
- Cross-participação: já funciona, permanece; cada vínculo carrega seu nível.
- O eixo componente/arquétipo da configuração (SPEC-36) — esta SPEC o
  reforça, não o substitui.

## 5. Fases propostas

- **Fase 1 — níveis**: coluna `nivel` + migração (existentes → owner), teto
  no convite, rotas de membros/níveis exigem owner, gate de escrita de quebra
  (`operar`) e o gate de owner nas rotas de configuração; `MembrosTab` mostra
  e edita níveis.
- **Fase 2 — perfis de stack**: tabelas novas, ponteiro no time, recurso
  `perfis-stack`, aba "Perfis de stack", captura gravando no perfil, drop de
  `perfis_time`.
- **Fase 3 — papel portado por time**: `time_papel`, herança para owners,
  atribuição a time no `AcessosTab`.

Cada fase com a régua de sempre: teste que MORDE (defeito reinjetado →
vermelho exato), suítes completas, validação no bundle de produção.

## 5.1 Fase 1 — implementada (§176)

Níveis, teto do convite, gates de escrita (quebra=operar, config=owner ou
delegação) e a UI de membros — ver JOURNEY §176.

## 5.2 Fase 2 — implementada (§177)

`perfis_stack` + `perfil_stack_valores` + `times.perfil_stack_id` (migração
0020, com o DROP de `perfis_time` da D4). A projeção `PerfisDeTimes` que as
sugestões consomem sobreviveu com o MESMO contrato (`GET /perfis-time`) — só
que derivada do perfil apontado. A captura (`PUT /perfis-time/:timeId`)
grava no perfil apontado e cria "stack de {time}" quando não há ponteiro. A
curadoria virou o preHandler `exigirEdicaoCurada`: aberto → ato de owner;
papel com `perfis-stack` existe → SÓ o grant edita, inclusive por cima de
owners — a exceção deliberada ao owner-bypass da Fase 1 (D1). Apontar o
ponteiro é `exigirNivel(owner)` no próprio time, sempre.

## 6. Verificação (feito quando)

1. Um `visualizar` abre quebras do time e recebe 403 ao tentar salvar; a UI
   nem oferece o botão.
2. Um `operar` trabalha o dia inteiro sem tocar em configuração; ao tentar,
   403 com motivo.
3. Um convite gerado por `operar` não consegue nascer com nível `owner`.
4. Time aponta "Java + Spring Boot"; troca o ponteiro para "Node" e as
   sugestões dos nós novos mudam na hora — sem editar o time.
5. Com curadoria ligada, um owner de time sem o papel curador não cria perfil
   no catálogo (mas segue apontando o próprio ponteiro); com curadoria
   desligada, cria.
6. Papel "Arquitetura" atribuído ao time-arquitetura: um owner desse time
   edita o pipeline sem atribuição individual; ao sair do time, perde.
