# SPEC-28 — Gestão de acessos: quem pode editar o quê

> **Status**: desenho aprovado, implementação não iniciada. Escrito depois da pergunta do usuário sobre "grupo de usuários de agilidade pode editar os agentes / revisar / aprovar alterações nos checklists de processo; os arquitetos nas configurações de padrões arquiteturais e especificações; outro setor edita o fluxo de agentes; **em outra empresa isso ocorre por time**".

## 1. Objetivo

Permitir que uma organização configure **quem pode ler, editar e aprovar cada área de configuração** do produto — sem impor um organograma único, porque a mesma feature é organizada de formas diferentes em empresas diferentes (por área/chapter numa, por time noutra).

## 2. Decisão que ordena tudo: só no modo hospedado

Confirmado com o usuário: **a gestão de acessos vale apenas para o modo hospedado** (`packages/server`, com login, organização e times).

O modo local (`gerador open`) **continua sem permissão nenhuma** — quem roda na própria máquina é dono de tudo. Isso não é uma lacuna: é a natureza do modo. Permissão em arquivo local seria convenção, não segurança (qualquer pessoa edita o JSON), e a SPEC-17 pivotou o produto justamente para "um `npm install -g` e funciona, sem login". Fingir controle onde ele não existe é pior do que não ter.

Consequência prática de projeto: **toda checagem de permissão vive em `packages/server`**. Nem `engine` nem `web` decidem permissão — o web só *esconde* o que o servidor já negaria, e esconder é conveniência, nunca o mecanismo.

## 3. Estado atual (o que existe e o que falta)

O que já existe e é reaproveitado:

- `usuarioTime(email, timeId)` — pertencimento a time, sem papel nenhum.
- `exigirSessao()` e `exigirTime(resolverTimeId)` em `packages/server/src/auth/middleware.ts` — dois níveis só: *logado* e *pertence ao time*.
- `organizacoes`, `times`, `convitesTime` no schema.
- `registrarAuditoria()` — já grava quem escreveu o quê nas rotas protegidas (SPEC-09 §4).

O que falta, e é exatamente o pedido: **não existe papel**. O comentário no schema é explícito — *"sem papel de admin separado, qualquer membro do time administra a própria lista de membros"*. Hoje, quem entra no time edita tudo: regras de refinamento, pipeline de agentes, templates, campos.

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

## 8. Fora de escopo, deliberado

- **Modo local** (§2).
- **SSO/SCIM para provisionar grupos** do AD/Okta. Desejável em empresa grande, mas o valor aparece com o RBAC já existindo; sincronizar grupo antes de ter papel é sincronizar para lugar nenhum.
- **Permissão por item/quebra individual** (ACL por registro). O pedido é sobre configuração, e ACL por registro multiplica a complexidade do modelo por N.
- **Hierarquia de papéis** (papel que herda de outro). Sem caso real ainda; herança é fácil de adicionar e difícil de tirar.

## 9. Roteiro faseado

1. **Fase 1 — modelo e checagem**: tabelas, `exigirPermissao`, enum de recursos, modo aberto (§4.3), papel Administrador no onboarding. Sem UI: prova com testes de rota (403/200 por papel).
2. **Fase 2 — UI de acessos**: aba Acessos + `GET /permissoes/minhas` + esconder o que não pode. É aqui que a feature vira usável.
3. **Fase 3 — aprovação**: `recurso_politica.exigeAprovacao`, proposta pendente, tela de revisão com diff, ação `aprovar` valendo. Reusa o cartão antes/depois que a `ConversaEspecificacao` já tem (SPEC-27 Fase 2) — o formato de "veja o que muda e aceite" já existe e foi validado.
4. **Fase 4 — SSO de grupos** (se e quando pedido).

## 10. Verificação

Fase 1 e 2 têm um teste que é o próprio pedido do usuário, escrito como cenário: uma organização com papel "Agilidade" (editar `regras.checklistProcesso` + `pipeline-agentes`, escopo organizacional) e papel "Arquitetura" (editar `campos-no`, `campos-aresta`, `regras.checklistTecnico`, `especificacao-template`, escopo organizacional); uma pessoa de cada; e a asserção de que **cada uma recebe 200 no seu recurso e 403 no da outra**. Mais o cenário por time: o mesmo papel "Agilidade" com `escopoTimeId`, dando 200 no time A e 403 no time B.

E um teste de migração: organização sem papéis continua deixando qualquer membro editar (§4.3) — se este quebrar, a atualização tranca clientes existentes.
