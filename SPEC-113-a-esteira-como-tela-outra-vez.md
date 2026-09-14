# SPEC-113 — A esteira como tela outra vez: o rollback do canvas de fluxos plugável

> **A tese, nas palavras do usuário:** depois de testar a SPEC-112 na stack
> real — *"não deu nem um pouco certo, melhor fazermos um rollback para a
> época em que ele ainda existia e gerar uma spec justificando, vamos
> ressimplificar o sistema"*. E, sobre a porta corrigida que ainda não bastou:
> *"agora encontrei, mas é um botão 'tímido'! outra questão é que em versões
> anteriores existia uma tela muito bonita e animada nesse fluxo … na época
> que não era um fluxo plugável … gosto bastante dessa forma com as
> animações, os conectores eram animados, enfim, precisamos plugar aquela
> tela como experiência"*.

## 1. O que estava sendo medido quando a decisão aconteceu

A SPEC-112 (§§406-411) tentou fechar a "jornada contínua": ligar a mesa, o
ensaio, a esteira de agentes e o documento, que viviam como telas que não se
falavam. A fatia A-E cumpriu o que prometia — nó opcional, motivo do Derivar
no corpo da tela, jornada com telas de trabalho, galeria bidirecional, laço do
ensaio fechando de onde veio — e um achado real durante o teste (§411) expôs
dois problemas mais fundos:

1. **Derivar levava direto ao documento sem porta nenhuma para a esteira** —
   sintoma medido, corrigido com um botão.
2. **O botão corrigido não bastou.** A pergunta que sobrou não era "falta uma
   porta", era "por que isto é um formulário técnico e não uma experiência" —
   e a resposta trouxe à tona que uma tela bonita e animada **já existiu**, e
   foi removida quando a esteira virou um nó de um grafo genérico (SPEC-107
   G5c-3, *"a MORTE: a tela de revisão e o motor client saem"*).

## 2. O diagnóstico (os três motivos, na ordem em que o usuário os confirmou)

- **Complexidade sem benefício percebido.** Nós, arestas, mapeamento de campo
  a campo, catálogo de conectores, tipos de gatilho, telas-como-nó,
  subfluxo — todo esse aparato (SPEC-105 a SPEC-111) virou carga cognitiva
  que ninguém pediu, para resolver problemas que telas dedicadas já
  resolviam mais simples.
- **Perda de experiência e qualidade visual.** A tela de revisão antiga
  (`ReviewScreen`, `EsteiraAgentes`, `DiagramaCompacto`) tinha identidade e
  polimento próprios — faixa de papéis com handoff animado, diagrama
  compacto com halo no nó em processamento. Generalizar tudo como nó de
  canvas técnico nivelou a experiência por baixo.
- **O modelo mental errado para o produto.** "Baixo código com canvas
  conectável" (a tese literal da SPEC-110: *"nosso objetivo era tornar
  parecido com um low code"*) nunca foi o que o produto precisava ser. A
  jornada contínua devia ter sido resolvida com telas em sequência, não com
  um grafo que a pessoa desenha.

## 3. A decisão

**O motor de execução server-side FICA. A interface de grafo genérico SAI.**

**Correção em relação à primeira versão desta SPEC**: aqui foi escrito que o
motor **client-side** antigo (`useEsteiraDeAgentes.ts`, que orquestrava
papel-por-papel e lote-por-lote no navegador chamando `POST
/ia/pipeline/:papel` via `fetch`) dependia de uma rota que "só existia no modo
`gerador open` local, ausente no servidor hospedado de hoje (404)". **Isso
estava errado.** A investigação original leu o código pela árvore git de um
commit já deletado e presumiu que a rota fosse local-only; checando
diretamente nesta branch (`rollback-fluxo-pre-105`), `POST
/ia/pipeline/:papel` (`server/src/routes/ia.ts`) é uma rota Fastify comum,
sem nenhum gate de modo local, resolvendo a credencial pelo mesmo mecanismo
hospedado de qualquer outra rota de IA (`credencialEmVigor(...,
ID_PROVEDOR_GATEWAY)`). Por `git log -L` ela é compatível com hospedado desde
a **SPEC-31** ("IA no modo hospedado, sem binário nativo no container",
commits `1523719`/`545ba20`) — bem antes da SPEC-105 sequer existir.

Consequência prática: `ReviewScreen`/`EsteiraAgentes`/`useEsteiraDeAgentes`
**já estão de pé, ligados e funcionais nesta branch**, exatamente como
existiam antes da SPEC-105 (`App.tsx` já importa e renderiza `ReviewScreen`
sem gate nenhum de fluxo). Não há reconstrução nenhuma a fazer para a
esteira — ela é a "mesma experiência anterior" pedida, literalmente, sem
reescrever uma linha.

`EsteiraAoVivo.tsx` (construída durante a SPEC-112, plugada no motor
server-side de fluxo) deixa de ser necessária para este propósito — foi uma
ponte para o modelo "canvas + executor genérico" que este rollback abandona.
Ela não é trazida para esta branch.

**Decisão**: manter o motor client-side original tal como está (ele nunca
dependeu de nada que tenha morrido) e remover só o CANVAS de fluxo genérico —
substituindo os fluxos que existiam meramente como wrapper de rotas diretas
(exportar, publicar) por rotas diretas de novo, sem tocar na esteira/ensaio,
que já não passavam por fluxo nenhum nesta branch.

## 4. O que sai, o que fica, o que é reconstruído

### Sai (deletável direto — investigado, ~10 mil linhas)

- `packages/web/src/fluxo/` inteiro: `FluxoScreen.tsx` (o canvas), `GaleriaDeFluxos.tsx`,
  `MolduraDoStage.tsx`, `RenderizadorDaTela.tsx`, `vocabularioDoFluxo.ts`.
- `ConectoresTab.tsx`, `TelasTab.tsx` — catálogos configuráveis pelo usuário.
- A maior parte de `aplicacao/src/config/fluxos.ts` e
  `casos-de-uso/fluxos.ts` — o grafo como dado e o executor GENÉRICO de nós
  (gatilho, subfluxo, tela-como-nó, mapeamento nó↔nó).
- `server/src/routes/fluxos.ts` (1806 linhas) e `server/src/fluxos/`
  (agendamentos, webhooks).
- Migrations `0043/0046/0047/0048/0049` (rastro de execução, agendamento,
  subfluxo, webhook) — nenhuma tem FK de fora apontando pra ela; uma
  migration nova de `DROP TABLE` fecha a conta, sem risco para o resto do
  schema.
- ~15 specs E2E exclusivos de fluxo (`fluxo-*.spec.ts`, `galeria-de-fluxos`,
  `gatilho-webhook`, `no-opcional`, `agendamento`, `conectores`,
  `pdca-como-fluxo`, `tela-*`, `jornada-*`, `esteira-pela-fiacao`,
  `origem-do-ensaio`) e os scripts visuais `.mjs` correspondentes.
- A SPEC-112 inteira (branch `spec-112-a-no-opcional`, PR #383) — nunca
  chegou a ser mesclada na `main`; fecha-se o PR sem mergear. O nó opcional,
  a jornada-como-fluxo e a porta da esteira não têm onde morar sem o canvas.

### Fica intocado

Mesa/quebra (o canvas de DESENHO DE SISTEMA — conceito anterior à SPEC-105,
não confundir com o canvas de fluxos), Documento de desenho, PDCA (rotas
diretas, `pdca-melhoria` como fluxo era só um overlay opcional), tokens,
regras, produtos, autenticação, RBAC de recursos que não sejam
`fluxos*`, landing page, tour de onboarding (com reescrita de texto — ver
riscos).

### Nada disto precisou ser reconstruído (correção sobre a investigação original)

A investigação original (feita lendo a árvore git do commit `864e5a35` já
deletado, não o estado real desta branch) presumiu que a SPEC-107 G5c-3 havia
apagado de vez as quatro rotas diretas — exportar, publicar, ensaiar, rodar a
esteira — e que elas precisariam voltar reconstruídas. **Checando a branch
`rollback-fluxo-pre-105` de verdade, nenhuma das quatro precisou de uma linha
de código novo**:

- `POST /quebras/:id/itens/exportar` e `POST /quebras/:id/documento/publicar`
  já existem intactas em `routes/quebras.ts` (o "MORREU" no comentário do
  código se refere ao commit que as apagou DEPOIS da SPEC-105 — nesta branch,
  anterior a isso, elas nunca morreram).
- `EnsaiosScreen.tsx`/`.test.tsx` (a bancada de ensaios pré-SPEC-105, da
  SPEC-66) já está importada e ligada em `App.tsx`, sem gate de fluxo.
- `ReviewScreen`/`EsteiraAgentes`/`useEsteiraDeAgentes` (a esteira animada)
  também já está importada e ligada em `App.tsx`, e o motor client-side que a
  alimenta (`POST /ia/pipeline/:papel`) é uma rota hospedada comum desde a
  SPEC-31 — nunca dependeu do modo local (ver correção no §3).

Cada uma dessas quatro "fatias de reconstrução" (C, D, E do plano original)
virou, na prática, apenas uma fatia de **verificação**: ler o código desta
branch, confirmar que o fio já existe de ponta a ponta, e validar contra a
stack real.

## 5. As fatias

### Fatia A — a base do rollback (mecânica de git) ✅ feita nesta rodada

Branch `rollback-fluxo-pre-105` a partir do commit pré-SPEC-105 (`f16cd29`),
com os dois commits independentes que um `git reset --hard` ingênuo teria
destruído (`16f1479`, vocabulário; `3106a37`, criação de time — o próprio
HEAD da `main`) trazidos de volta por `cherry-pick`. Build e suíte de
unidade rodados como linha de base antes de qualquer remoção adicional.

### Fatia B — esta SPEC ✅ feita nesta rodada (e corrigida nesta rodada — ver §3)

### Fatia C — rotas diretas de exportar/publicar ✅ verificado, sem código novo

`POST /quebras/:id/itens/exportar` e `POST /quebras/:id/documento/publicar`
já existem intactas em `routes/quebras.ts` nesta branch. Confirmado por
leitura direta do arquivo.

### Fatia D — a Bancada de Ensaios como tela própria ✅ verificado, sem código novo

`EnsaiosScreen.tsx` já existe pré-SPEC-105 (SPEC-66) e já está ligada em
`App.tsx` (`rota.tela === "ensaios"`, `onSimular`) sem depender de fluxo.

### Fatia E — a Esteira como tela dedicada ✅ verificado, sem código novo

`ReviewScreen`/`EsteiraAgentes`/`useEsteiraDeAgentes` já existem e já estão
ligadas em `App.tsx` (linhas 76-77 import, ~1929 render), alimentadas pelo
motor client-side original chamando `POST /ia/pipeline/:papel` — rota
confirmada hospedada-compatível desde a SPEC-31 (ver correção no §3). Não há
`EsteiraAoVivo.tsx` nem rota nova a construir: a experiência pedida
("a mesma anterior") já é literalmente a que está de pé nesta branch.

### Fatia F — remoção

Só depois que C/D/E já substituíram tudo que dependia deles:
`packages/web/src/fluxo/`, `routes/fluxos.ts`, o executor genérico de
`casos-de-uso/fluxos.ts`, e o resto da lista da seção 4.

### Fatia G — reescrever a narrativa do onboarding

`JourneyModal.tsx` e `useTour.ts` narram o canvas de fluxos como "o mapa vivo
da ferramenta" em ~35 pontos de texto — precisa reescrita de copy, não só
remoção de import.

## 6. O que esta SPEC NÃO faz

- Não resolve agendamento nem webhook como capacidades (§7, riscos).
- Não implementa a fatia F (remoção) nem a G (onboarding) nesta rodada — são
  trabalho de sessões futuras, do mesmo tamanho de qualquer outra SPEC deste
  projeto.

## 7. Riscos nomeados

- **R1 — Agendamento e webhook ficam sem lar.** Essas duas capacidades
  (gatilho de fluxo por relógio ou por chamada HTTP externa) só existiram
  DENTRO do conceito de fluxo — nunca tiveram tela dedicada antes da
  SPEC-105, porque não existiam antes dela. Removido o canvas, elas não têm
  para onde voltar sem desenho novo. Gap conhecido, não resolvido nesta
  rodada.
- **R2 — Subfluxo e "conector de banco" (consulta SQL configurável) morrem
  sem substituto**, pela mesma razão do R1: eram capacidades NOVAS da
  SPEC-110, não coisas que existiam antes e estão "voltando".
- **R3 — O onboarding (tour guiado) fica narrativamente desatualizado** até
  a fatia G rodar — quem abrir o tour antes disso vai ouvir sobre um canvas
  de fluxos que não existe mais no código.
- **R4 — Duas cópias de JOURNEY.md divergem.** A branch de rollback tem um
  JOURNEY.md que PULA as entradas §360-404 (as da SPEC-105 a SPEC-111) — se
  algum dia esta branch for comparada ou mesclada com a `main` de verdade, o
  histórico narrativo não vai bater linha a linha. É uma escolha deliberada
  (a narrativa devia contar a história do código que EXISTE), não um
  descuido.
