# SPEC-28 — Gestão de acessos: quem pode editar o quê

> **Status**: Fase 1 implementada no MECANISMO, pendente na COBERTURA — 2 dos 16 recursos são de fato checados por alguma rota. Ver §3, que é o que vale ler antes de mexer aqui.
>
> **Origem**: Escrito depois da pergunta do usuário sobre "grupo de usuários de agilidade pode editar os agentes / revisar / aprovar alterações nos checklists de processo; os arquitetos nas configurações de padrões arquiteturais e especificações; outro setor edita o fluxo de agentes; **em outra empresa isso ocorre por time**".

## 1. Objetivo

Permitir que uma organização configure **quem pode ler, editar e aprovar cada área de configuração** do produto — sem impor um organograma único, porque a mesma feature é organizada de formas diferentes em empresas diferentes (por área/chapter numa, por time noutra).

## 2. Decisão que ordena tudo: só no modo hospedado

Confirmado com o usuário: **a gestão de acessos vale apenas para o modo hospedado** (`packages/server`, com login, organização e times).

O modo local (`gerador open`) **continua sem permissão nenhuma** — quem roda na própria máquina é dono de tudo. Isso não é uma lacuna: é a natureza do modo. Permissão em arquivo local seria convenção, não segurança (qualquer pessoa edita o JSON), e a SPEC-17 pivotou o produto justamente para "um `npm install -g` e funciona, sem login". Fingir controle onde ele não existe é pior do que não ter.

Consequência prática de projeto: **toda checagem de permissão vive em `packages/server`**. Nem `engine` nem `web` decidem permissão — o web só *esconde* o que o servidor já negaria, e esconder é conveniência, nunca o mecanismo.

## 3. Estado atual (revisado — o que EXISTE e o que FALTA)

> Esta seção foi reescrita depois de ler o código. A versão anterior descrevia
> um mundo onde nada de RBAC existia, e isso deixou de ser verdade quando a
> Fase 1 foi implementada. Uma SPEC que descreve o passado como se fosse o
> presente é pior que uma SPEC desatualizada: ela faz alguém reconstruir o que
> já está lá.

### 3.1 O mecanismo existe, e está completo

Em `packages/server`:

- **Tabelas** `papeis_acesso`, `papel_permissao`, `usuario_papel` — criadas na
  migração `0010_acessos.sql`.
- **`resolverPermissoes()`** (`auth/permissoes.ts`) implementa os três eixos do
  §4.1, incluindo o escopo: papel organizacional (`escopoTimeId` nulo) cobre
  qualquer time; papel de time cobre só o dele.
- **`exigirPermissao()`** como `preHandler`, com 403 que diz **qual** recurso e
  **qual** ação faltaram.
- **Modo aberto (§4.3)** honrado: organização sem papel nenhum → `rbacAtivo:
  false` → permite tudo.
- **Lista fechada** de 16 recursos, com `regras` quebrado em quatro (§4.2).
- **`editar` não implica `ler`** — as duas são concedidas explicitamente, como
  o §6 exige.
- **Rota `/acessos`** para administrar papéis, ela mesma protegida por
  `exigirPermissao("acessos", "editar")` (§4.4).

Nada disso precisa ser redesenhado. O desenho aguentou o encontro com o código.

### 3.2 A cobertura não existe — e este é o ponto

**Apenas 2 dos 16 recursos são checados por alguma rota:** `campos-no` (editar)
e `acessos` (editar).

Os outros 14 — `perfis-time`, `campos-aresta`, os quatro `regras.*`,
`especificacao-template`, `prompt-unico-template`, `pipeline-agentes`,
`modelo-ia`, `credenciais-ia`, `retrospectivas`, `quebras`, `membros` — podem
ser concedidos e negados na tabela, e **nenhuma rota pergunta**.

Consequência concreta: criar o papel "Agilidade" com permissão só em
`regras.checklistProcesso`, atribuir a alguém, e essa pessoa continua editando
`pipeline-agentes`, `credenciais-ia` e todo o resto. A permissão existe, é
gravada, é resolvida — e ignorada.

O próprio código já nomeia esse modo de falha, no comentário da lista de
recursos:

> *"permissão sobre recurso que nenhuma rota checa é permissão que falha ABERTA
> e em silêncio — o pior modo de falha possível numa camada de autorização"*

É a descrição exata do estado atual. O comentário foi escrito como justificativa
para a lista ser fechada; virou o diagnóstico da própria implementação.

### 3.3 Leitura honesta do que aconteceu

A Fase 1 entregou o **mecanismo** e usou `campos-no` como piloto — o que é uma
decisão defensável: provar o desenho numa rota antes de espalhá-lo por catorze.
O erro não foi parar ali; foi **marcar a fase como concluída** com o piloto no
lugar da cobertura, sem deixar registrado que faltava o resto.

Por isso o teste de aceitação do §10, que é o pedido do usuário escrito como
cenário, hoje só passaria com `campos-no`.

## 4. Decisões de arquitetura

### 4.1 Três eixos, não um

Um RBAC que só tem "papel → permissão" não resolve o caso do usuário, porque o mesmo papel tem alcance diferente em cada empresa. O modelo tem **três** eixos:

| Eixo | O que é | Exemplos |
|---|---|---|
| **Recurso** | a área de configuração | `regras.checklistProcesso`, `pipeline-agentes`, `campos-no`, `especificacao-template` |
| **Ação** | o que se faz com ela | `ler`, `editar`, `aprovar` |
| **Escopo** | onde aquilo vale | a organização inteira, ou um `timeId` específico |

O escopo é o que responde *"em outra empresa isso ocorre por time"*: o mesmo papel "Agilidade" pode ser criado com escopo organizacional numa instalação e com escopo de time noutra, **sem código diferente**.

### 4.2 Recursos são uma lista FECHADA

Nada de string livre. O conjunto de recursos é um enum versionado no código, espelhando as áreas que hoje existem na `ConfigScreen` e nas rotas:

```
perfis-time            campos-no              campos-aresta
regras.checklistTecnico   regras.checklistProcesso   regras.testes   regras.volumetria
especificacao-template    prompt-unico-template
pipeline-agentes          modelo-ia              credenciais-ia
quebras                   membros
```

Motivo: permissão sobre recurso inventado é permissão que nunca é checada — falha aberta e silenciosa. Com enum, um recurso novo **obriga** a decidir a permissão dele no mesmo commit em que nasce.

Note que `regras` é quebrado em quatro: o usuário quer Agilidade no **checklist de processo** e Arquitetura no **técnico**. Um recurso `regras` inteiro não expressaria isso.

### 4.3 Migração sem travar ninguém: "modo aberto" até o primeiro papel

Ligar RBAC num produto que hoje não tem trava é o caminho clássico para deixar todo mundo de fora no dia do deploy. A regra:

> **Enquanto uma organização não tiver NENHUM papel de acesso criado, ela se comporta exatamente como hoje**: todo membro do time edita tudo do seu time.
> Assim que o primeiro papel é criado, o RBAC passa a valer para aquela organização.

Isso torna a adoção uma decisão explícita de quem administra, não um efeito colateral de atualizar a versão. E dá um caminho de volta óbvio (apagar os papéis) enquanto a configuração está sendo desenhada.

### 4.4 O papel de administrar acessos é ele mesmo um recurso

`acessos` é recurso como qualquer outro (`ler`/`editar`). Quem cria a organização recebe um papel **Administrador** com tudo, senão a primeira pessoa a ligar o RBAC se tranca para fora — é o erro mais fácil de cometer aqui, e ele é irreversível pela própria UI.

### 4.5 `aprovar` é permissão, não fluxo (ainda)

O usuário pediu *"revisar/aprovar alterações nos checklists de processo"*. Isso são **duas** features:

1. **Permissão de aprovar** — a ação existe no modelo desde o começo (barata).
2. **Fluxo de proposta → aprovação** — mudança em recurso marcado como "exige aprovação" não entra direto: vira uma proposta pendente, e alguém com `aprovar` aceita ou rejeita. Isso é máquina de estado, tela de pendências, notificação e diff — trabalho real.

Fasear resolve: a Fase 3 entrega o fluxo. Até lá, `aprovar` é registrado no modelo mas só `ler`/`editar` são exigidos. Um sistema que aceita a permissão e ignora o fluxo é honesto; um que promete aprovação e aplica direto, não.

### 4.6 Negar é o padrão, e o servidor é a única fonte

Com RBAC ligado: sem permissão explícita, a resposta é **403**. O front esconde botão por conveniência (não mostrar o que vai falhar), mas nenhuma decisão de acesso mora no `web` — quem esconde não protege.

## 5. Modelo de dados (proposto)

```
papeis_acesso        (id, organizacaoId, nome, criadoEm)
papel_permissao      (papelId, recurso, acao)                    -- acao ∈ ler|editar|aprovar
usuario_papel        (email, papelId, escopoTipo, escopoTimeId)  -- escopoTipo ∈ organizacao|time
recurso_politica     (organizacaoId, recurso, exigeAprovacao)    -- Fase 3
```

`usuario_papel.escopoTimeId` nulo = vale na organização inteira. É a linha inteira do §4.1 num campo.

## 6. Resolução de permissão (o algoritmo)

Para `(usuário, recurso, ação, timeId?)`:

1. Organização **sem papéis** → permite (modo aberto, §4.3).
2. Junta todas as permissões dos papéis do usuário cujo escopo cobre o `timeId` pedido (escopo organizacional cobre qualquer time).
3. Permite se existir `(recurso, ação)`. `editar` **não** implica `ler` — as duas são concedidas explicitamente, porque "pode editar mas não pode ver" é bug, e o jeito de garantir que não aconteça é não deixar a implicação implícita no código.
4. Senão, 403 com mensagem que diz **qual** recurso e **qual** ação faltaram (erro de permissão que não diz o que falta gera chamado, não correção).

## 7. Superfície

**Server**: um `preHandler` novo, `exigirPermissao(recurso, acao, resolverTimeId?)`, aplicado nas rotas existentes. Convive com `exigirTime` — pertencer ao time continua necessário; a permissão é a camada de cima.

**Web**: aba **Acessos** na `ConfigScreen` (só hospedado, só com `acessos.editar`): criar papel, marcar a matriz recurso×ação, atribuir pessoas com escopo. E `GET /permissoes/minhas` alimenta o esconder-botão.

**Auditoria**: toda escrita já registra autor (SPEC-09 §4); passa a registrar também o papel que autorizou. Sem isso, "quem aprovou isso?" não tem resposta.

## 7.1 O RAG entra aqui, e é o caso mais sensível

O corpus de retrospectivas (SPEC-23 fluxo 5, ainda na fila) é o material **mais sensível** que o produto vai guardar: retrospectiva tem nome de pessoa, conflito de time, decisão que deu errado. Duas consequências para esta SPEC:

**1. Recursos próprios, separando ingerir de ler.**

| Recurso | Ação | Quem tipicamente |
|---|---|---|
| `retrospectivas` | `editar` | quem facilita a retro (agilidade) — ingerir e remover documento |
| `retrospectivas` | `ler` | quem pode ver os trechos citados como fonte de uma sugestão |

São ações diferentes de propósito: sugerir um checklist **citando o trecho de origem** (que é a regra da SPEC-23 §5 — nunca sugestão sem rastro) significa que **quem vê a sugestão vê o trecho**. Se a pessoa não pode ler o corpus, a citação tem que ser suprimida — e uma sugestão sem rastro é uma sugestão que ninguém consegue avaliar. Ou seja: na prática, quem usa o RAG precisa de `ler`. O modelo deixa isso explícito em vez de deixar vazar por descuido.

**2. O filtro de escopo vem ANTES da busca vetorial, nunca depois.**

Esta é a regra que impede o vazamento clássico de RAG multi-tenant. Buscar no índice inteiro e filtrar o resultado depois parece equivalente e não é: basta um erro de ordem, um `top-k` aplicado antes do filtro, ou um trecho que escapa para o prompt, e a retrospectiva do time A aparece na sugestão do time B. A consulta é montada com o escopo (`organizacaoId` + `timeId` autorizados) **como parte do critério de recuperação**, e o índice guarda esse escopo junto de cada chunk.

Registrado como requisito de verificação, não como recomendação: o teste da Fase 1 precisa provar que uma busca do time A **nunca** retorna chunk do time B — inclusive quando o texto do B é o mais similar à pergunta do A. Esse é o teste que importa, porque é o caso em que a busca "acerta" e o produto erra.

## 8. Fora de escopo, deliberado

- **Modo local** (§2).
- **SSO/SCIM para provisionar grupos** do AD/Okta. Desejável em empresa grande, mas o valor aparece com o RBAC já existindo; sincronizar grupo antes de ter papel é sincronizar para lugar nenhum.
- **Permissão por item/quebra individual** (ACL por registro). O pedido é sobre configuração, e ACL por registro multiplica a complexidade do modelo por N.
- **Hierarquia de papéis** (papel que herda de outro). Sem caso real ainda; herança é fácil de adicionar e difícil de tirar.

## 9. Roteiro faseado

1. **Fase 1a — mecanismo** ✅ *feito*: tabelas, `resolverPermissoes`,
   `exigirPermissao`, enum de recursos, modo aberto (§4.3), rota `/acessos`.
   Piloto em `campos-no`.
2. **Fase 1b — cobertura** ⬅️ *é aqui que estamos*: aplicar `exigirPermissao`
   nas 14 rotas restantes e escrever o teste de cenário do §10.

   Entra aqui também o **papel Administrador no onboarding**, que a Fase 1
   prometia e não entregou: hoje ele só existe dentro dos testes, que o criam
   à mão.

   Sem ele há uma **tranca inevitável**, não condicional. Criar um papel são
   duas chamadas — `POST /acessos/papeis` e depois
   `POST /acessos/papeis/:id/membros`. A primeira passa (modo aberto: zero
   papéis). Mas ela mesma cria o primeiro papel, e `resolverPermissoes` liga o
   RBAC assim que **existe qualquer papel na organização**, independente de
   quem o tem. Na segunda chamada quem acabou de criar o papel ainda não está
   atribuído a ele: `atribuicoes.length === 0` → `porRecurso` vazio → 403.

   Ou seja: a organização fica trancada fora de `/acessos` entre as duas
   chamadas, sempre, e nem um papel que conceda `acessos/editar` salva — não
   dá pra atribuí-lo a ninguém. Só sai disso com acesso ao banco.

   Medido contra o Postgres de verdade, não deduzido:

   ```
   POST /acessos/papeis            → 201  {"nome":"Administrador",
                                           "permissoes":[{"recurso":"acessos","acao":"editar"}]}
   POST /acessos/papeis/:id/membros → 403  {"erro":"sem permissão para \"editar\" em \"acessos\""}
   ```

   **A saída não é auto-atribuir o primeiro papel a quem o criou.** Parece a
   correção óbvia e não é: se o primeiro papel for "Agilidade" com só
   `regras.checklistProcesso`, auto-atribuí-lo dá à pessoa exatamente esse
   papel — e ela segue trancada fora de `acessos`. A auto-atribuição resolve o
   caso em que o primeiro papel por acaso concede `acessos/editar`, que é o
   caso fácil.

   O que fecha o buraco em todos os casos é **garantir `acessos/editar` a
   alguém antes que o RBAC possa ligar**: papel Administrador criado junto da
   organização, no onboarding. Para as organizações que já existem sem ele,
   isso exige uma migração que escolha um administrador — e *quem* é essa
   pessoa é decisão de produto, não de implementação. Está aqui como pergunta,
   não como plano.

   Fasear 1a/1b não é burocracia: a diferença entre "o mecanismo funciona" e
   "o mecanismo protege" é justamente onde esta SPEC se enganou uma vez. Uma
   fase que termina com 2 de 16 recursos cobertos precisa dizer isso no nome.

   **Decisão pendente do usuário** (§3.2 lista os 14): `quebras` e
   `credenciais-ia` merecem tratamento diferente? `quebras` é o trabalho do
   dia a dia e já tem escopo por time — travar por papel pode atrapalhar mais
   do que proteger. `credenciais-ia` é o oposto: é o recurso mais sensível do
   produto (chave de API), e talvez devesse exigir permissão mesmo em
   organização sem papel nenhum, quebrando o modo aberto de propósito.
3. **Fase 2 — UI de acessos**: aba Acessos + `GET /permissoes/minhas` + esconder o que não pode. É aqui que a feature vira usável.
4. **Fase 3 — aprovação**: `recurso_politica.exigeAprovacao`, proposta pendente, tela de revisão com diff, ação `aprovar` valendo. Reusa o cartão antes/depois que a `ConversaEspecificacao` já tem (SPEC-27 Fase 2) — o formato de "veja o que muda e aceite" já existe e foi validado.
5. **Fase 4 — SSO de grupos** (se e quando pedido).

## 10. Verificação

Fase 1 e 2 têm um teste que é o próprio pedido do usuário, escrito como cenário: uma organização com papel "Agilidade" (editar `regras.checklistProcesso` + `pipeline-agentes`, escopo organizacional) e papel "Arquitetura" (editar `campos-no`, `campos-aresta`, `regras.checklistTecnico`, `especificacao-template`, escopo organizacional); uma pessoa de cada; e a asserção de que **cada uma recebe 200 no seu recurso e 403 no da outra**. Mais o cenário por time: o mesmo papel "Agilidade" com `escopoTimeId`, dando 200 no time A e 403 no time B.

E um teste de migração: organização sem papéis continua deixando qualquer membro editar (§4.3) — se este quebrar, a atualização tranca clientes existentes.

### 10.1 O teste que faltava, e que teria evitado o buraco do §3.2

Um teste que percorra a lista `RECURSOS` e afirme que **cada recurso é exigido
por pelo menos uma rota**. Sem ele, acrescentar um recurso ao enum é gratuito e
silencioso: a permissão passa a existir na UI e na tabela, e nenhuma rota a
consulta.

É o mesmo padrão do `paridade.sanity.test.ts`, que compara as rotas dos dois
modos lendo o código-fonte — a diferença entre "confio que alguém lembrou" e
"o teste não deixa esquecer".
