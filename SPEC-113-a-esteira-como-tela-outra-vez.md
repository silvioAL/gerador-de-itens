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

Investigado antes de decidir: a tela antiga tinha um motor **client-side**
(`useEsteiraDeAgentes.ts`) que orquestrava papel-por-papel e lote-por-lote
**no navegador**, chamando `POST /ia/pipeline/:papel` diretamente do
`fetch` do cliente. Essa rota só existia no modo `gerador open` **local** —
que não existe mais desde a SPEC-33 (*"modo único hospedado … o deprecate não
vai acontecer"*). **Não dá para ressuscitar aquele código e ele simplesmente
funcionar**: a rota da qual ele dependia foi removida por uma mudança de
arquitetura totalmente separada (o produto virou hospedado-único), não pelas
SPECs de fluxo.

O motor server-side de hoje (`casos-de-uso/fluxos.ts` + `routes/fluxos.ts`,
construído pela SPEC-107) já roda em produção, não expõe credencial de IA ao
navegador, e **já entrega a experiência ao vivo que se queria de volta** —
provado nesta mesma sessão: `EsteiraAoVivo.tsx`, plugada em
`executarAoVivo` (o stream de eventos por nó que a SPEC-107 fatia D
construiu), reproduziu a faixa animada de papéis com handoff, streaming de
texto e tick de conclusão, rodando de ponta a ponta contra o dublê de IA na
stack de trabalho.

**Decisão**: manter as capacidades de execução (conector, função, agente
como peças internas) e a mecânica de streaming ao vivo — e remover o CANVAS
como interface (o lugar onde a pessoa pluga nós à mão para configurar
automações arbitrárias), substituindo por **telas fixas e dedicadas** por
capacidade conhecida, com a sequência definida no código.

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

### Reaproveitável sem reescrever (achado da investigação)

`corridaDaEsteira.ts`, `filaDaEsteira.ts`, `lotesDaEsteira.ts` em
`packages/aplicacao` — a lógica PURA de "rodar os papéis em lote,
encadeados" sobrevive à SPEC-107 G5 como funções que não mencionam "fluxo"
por dentro. `engine/export/exportar.ts` e o conector de publicação, idem.
`EsteiraAoVivo.tsx` (construída nesta sessão) já recebe papéis/estado como
props simples — sobrevive à remoção do fluxo trocando só quem a alimenta.

### Precisa ser reconstruído como rota direta

A SPEC-107 G5c-3 apagou as implementações antigas com comentários explícitos
("MORREU") no próprio código-fonte de `routes/quebras.ts`. Sem fluxo, não
existe mais endpoint nenhum para:

- `POST /quebras/:id/itens/exportar` (Exportar prontos)
- `POST /quebras/:id/documento/publicar` (Publicar)
- Ensaiar/simular cenários (hoje `apiExecucaoDeFluxo.executar(ID_DO_FLUXO_DO_ENSAIO)`)
- Rodar a esteira de agentes (hoje `apiExecucaoDeFluxo.executarAoVivo(ID_DO_FLUXO_DA_ESTEIRA)`)

Não é degradação visual — é ausência de rota. As quatro precisam voltar como
rotas diretas no servidor, reaproveitando a lógica de negócio pura listada
acima.

## 5. As fatias

### Fatia A — a base do rollback (mecânica de git) ✅ feita nesta rodada

Branch `rollback-fluxo-pre-105` a partir do commit pré-SPEC-105 (`f16cd29`),
com os dois commits independentes que um `git reset --hard` ingênuo teria
destruído (`16f1479`, vocabulário; `3106a37`, criação de time — o próprio
HEAD da `main`) trazidos de volta por `cherry-pick`. Build e suíte de
unidade rodados como linha de base antes de qualquer remoção adicional.

### Fatia B — esta SPEC ✅ feita nesta rodada

### Fatia C — rotas diretas de exportar/publicar

Reconstruir `POST /quebras/:id/itens/exportar` e
`POST /quebras/:id/documento/publicar`, reaproveitando
`engine/export/exportar.ts` e o conector de destino já existente.

### Fatia D — a Bancada de Ensaios como tela própria

`BancadaDeEnsaios.tsx` já é o componente visual certo — hoje é invocado como
nó-tela dentro de um fluxo. Passa a ser invocada diretamente (rota +
gesto na mesa/documento), sem o nó de fluxo por trás.

### Fatia E — a Esteira como tela dedicada

Rota nova (`POST /quebras/:id/esteira/executar`, com o mesmo streaming
NDJSON de hoje) chamando `corridaDaEsteira`/`filaDaEsteira`/`lotesDaEsteira`
diretamente — sem passar pelo executor genérico de grafo. `EsteiraAoVivo.tsx`
passa a ser alimentada por ela em vez de `apiExecucaoDeFluxo`.

### Fatia F — remoção

Só depois que C/D/E já substituíram tudo que dependia deles:
`packages/web/src/fluxo/`, `routes/fluxos.ts`, o executor genérico de
`casos-de-uso/fluxos.ts`, e o resto da lista da seção 4.

### Fatia G — reescrever a narrativa do onboarding

`JourneyModal.tsx` e `useTour.ts` narram o canvas de fluxos como "o mapa vivo
da ferramenta" em ~35 pontos de texto — precisa reescrita de copy, não só
remoção de import.

## 6. O que esta SPEC NÃO faz

- Não ressuscita o motor client-side antigo (§3) — decisão explícita, pela
  rota morta que ele dependia.
- Não resolve agendamento nem webhook como capacidades (§7, riscos).
- Não implementa as fatias C-G nesta rodada — são trabalho de sessões
  futuras, do mesmo tamanho de qualquer outra SPEC deste projeto.

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
