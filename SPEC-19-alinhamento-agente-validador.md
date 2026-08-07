# SPEC-19 — Alinhamento com o agente de IA que valida os itens (padrão de Confluence)

**Depende de/relacionado a:** `packages/engine/src/refinamento/gerarRefinamento.ts`, SPEC-14 (documento único, `gerarEspecificacaoEntrega.ts`).

**Status: implementado — itens 1-3 do achado abaixo (§3), mais a dimensão de habilitação de teste (§6), trazida numa segunda rodada a partir do config do protótipo original.**

---

## 1. Contexto

O usuário compartilhou o conteúdo de uma página de Confluence que documenta o **padrão exigido por um agente de IA downstream** — o agente que recebe a especificação de solução gerada por esta ferramenta e valida/processa os itens (histórias, tasks, débitos técnicos) pra uso real do time. Não é um padrão que este projeto inventa; é um contrato de formato que já existe do lado de quem consome a saída.

Comparando o documento contra `gerarRefinamento.ts` real (não suposição), achados concretos:

1. **Marcador errado.** O motor escrevia `<- especificar`; o Confluence exige `<- ✍️ especificar` (com o emoji) em toda linha de "Requisitos de refinamento", sem exceção.
2. **Formato de linha inconsistente.** Requisitos `tipo: "checklist"` viravam `- [ ] texto` (caixa de seleção); só os `tipo: "fill-now"` ganhavam o marcador. O Confluence não tem conceito de checklist — toda linha de refinamento é uma especificação em aberto, sempre com o mesmo marcador.
3. **Sem "Requisitos de volumetria".** Bloco fixo (Response time/Max error/RPS/Test duration, sempre em branco) que não existia no motor.
4. **"Débito Técnico" sem a seção "Resolução Técnica".** O Confluence exige 4 campos estruturados (Problema/Impacto atual/Solução/Benefícios) só pra esse `TipoItem`.
5. **Taxonomia diferente.** O Confluence usa uma lista fixa e genérica de requisitos por tecnologia (Backend/Camunda/FICO + categorias de processo como "Setup - Mocks"), enquanto o motor varia por contexto dentro da tech (mensagens/dados/http/orquestração...) — mais granular.

## 2. Decisão do usuário, item a item

**Itens 1, 2 e 3 — implementados** (ver §3 abaixo).

**Item 4 — deliberadamente ignorado.** Nas palavras do usuário: *"acho que podemos interpretar como tipo de demanda, acredito que esse é o nível de abstração correto, mas nossa ferramenta é agnóstica a isso, vamos ignorar."* A seção "Resolução Técnica" (Problema/Impacto/Solução/Benefícios) é conteúdo que quem refina a demanda escreve, não algo derivável do diagrama de arquitetura — está fora do nível de abstração desta ferramenta. Não implementado, e não deveria ser sem uma razão nova.

**Item 5 — não implementado, e a razão importa mais que a conclusão.** O usuário recusou adotar a taxonomia genérica do Confluence como substituta da atual, explicando o porquê: *"um dos objetivos é reduzir a fricção entre mapear a solução técnica e fazer especificações x organizar essa demanda em histórias/tarefas... criar mocks é uma visão sobre o que deve ser feito (provável item de checklist), não algo do desenho da solução per se."*

Ou seja: esta ferramenta mapeia **solução técnica** (o diagrama → especificação técnica por item). "Setup - Mocks", "Configuração Base de Parâmetros" etc. são categorias de **processo/checklist de trabalho** (organizar como o time executa a demanda), uma camada diferente — não pertencem ao desenho da solução, então não viram tipo de nó nem tech nova aqui. A granularidade por contexto que o motor já tem (`Backend-mensagens`, `Backend-dados`, `Backend-chamadas http`...) é **mais precisa** que a lista genérica do Confluence pra esse propósito, e continua sendo o desenho certo — não foi trocada por uma lista mais pobre só pra bater com o formato externo.

## 3. Implementação (itens 1-3)

`Requisito.tipo` (`"checklist" | "fill-now" | "texto"`) **removido** de `packages/engine/src/config/types.ts` — não tinha mais efeito nenhum que fizesse sentido manter, já que toda linha renderiza igual agora. `gerarChecklistTecnico()` (`gerarRefinamento.ts`) passa a emitir `- {texto} <- ✍️ especificar` uniformemente pra todo requisito, sem ramificação por tipo.

`RegrasPorTech` ganhou `volumetria?: { contextos: string[] }` — mesma semântica de casamento parcial de contexto que `Requisito.contextos` já usa (`contextoBate()`, reaproveitado). Nova função `gerarVolumetria(regras, techs, contextos)` emite o bloco fixo (nomes, ordem e o marcador exigidos pelo Confluence, campos sempre `___` — nunca preenchidos automaticamente) quando alguma tech relevante tem `volumetria` configurada pro conjunto de contextos da atividade. Ativado por padrão só pra `Backend` no contexto `Backend-chamadas http` (`config/regras.example.json`) — o único exemplo concreto que o Confluence documentou; times ajustam via config, mesma disciplina de sempre.

`gerarEspecificacaoEntrega.ts`: `renderizarItemEspecificacao()` insere `#### Requisitos de volumetria` como seção própria, logo após "Requisitos de refinamento técnico", só quando o bloco não é vazio.

## 4. Migração de dados

`config/regras.example.json` (+ mirror `packages/cli/templates/regras.json`): removidas todas as chaves `"tipo": "checklist"/"fill-now"` dos requisitos (31 ocorrências); adicionado `"volumetria": { "contextos": ["Backend-chamadas http"] }` em `Backend`.

## 5. Validação (primeira rodada)

`gerarRefinamento.test.ts`: teste novo confirmando o marcador exato (`<- ✍️ especificar`) em toda linha e a ausência de formato `- [ ]`; `describe("gerarVolumetria", ...)` (3 casos: contexto que ativa, contexto que não bate, tech sem volumetria configurada). `gerarEspecificacaoEntrega.test.ts`: 2 casos cobrindo o bloco de volumetria aparecendo/não aparecendo no documento final conforme o contexto da atividade. Fixtures de teste que usavam `tipo: "checklist"` (`validator.fixture.test.ts`, `exportar.test.ts`, `ReviewScreen.test.tsx`) atualizadas pra remover o campo, sem mudança de comportamento nesses testes. Regressão completa dos 4 workspaces.

---

## 6. Segunda rodada — a dimensão que faltava: habilitação de teste

**Gatilho.** O usuário questionou minha avaliação do item 5 ("vc conferiu se estão na configuração?") e mandou o `tabelaRegras` que estava em uso no protótipo HTML original — menos detalhado que o nosso, mas com itens que nunca portamos. Junto veio o enquadramento do problema, que é o que realmente importa: *"um dos objetivos é reduzir a fricção entre mapear a solução técnica e fazer especificações x organizar essa demanda em histórias/tarefas... na nossa parte de configuração deveria ter os questionamentos úteis enquanto especificamos: precisa de mocks? tem massa de testes integrados? será possível fazer testes integrados?"*

**Achado, depois de conferir de verdade.** Minha comparação anterior olhou o eixo errado (nomes de tecnologia). Conferindo os arquivos: `mock`, `massa`, `curl`, `laiaute`, `apontamento` tinham **zero ocorrências** em qualquer requisito nosso. A diferença real entre os dois conjuntos é de dimensão, não de taxonomia:

- **Nossos requisitos eram todos de correção arquitetural** — idempotência, DLQ, circuit breaker, índices, TTL, versionamento. Respondem *"o desenho está certo?"*
- **Os do original eram quase todos de habilitação de execução/teste** — curl da chamada, mockoon configurado, massa DEV, massa HLG, serviços a repontar durante o teste, layout do arquivo. Respondem *"dá pra executar e testar isso?"*

A sobreposição era praticamente nula. Não era uma versão pobre da nossa — era uma dimensão inteira ausente, exatamente a fricção que o usuário nomeou.

**Escopo escolhido** (via `AskUserQuestion`, entre três opções): só requisitos por contexto — sem mecanismo novo no engine. Trazer os itens de habilitação, ajustar a redação, e nada mais.

**O que entrou** (`config/regras.example.json` + mirror `packages/cli/templates/regras.json`):
- Habilitação de teste: massa de HLG (sempre), mock/Mockoon com cenários de sucesso e erro (DEV), snippet curl da chamada, serviços a repontar durante o teste e para quais rotas.
- Camunda (contexto `Backend-orquestracao`): descrever as alterações no processo, curl da chamada que inicializa.
- FICO (contexto `Backend-regras`): descrever motores/rulesets/fluxos modificados, anexar documentação das políticas.
- Mensageria: especificar filas/exchanges/tópicos a criar ou alterar, por ambiente.
- Lote: layout do arquivo quando origem/destino for arquivo — *se aplicável*.
- Ciclo de teste novo: "Teste funcional do processo" (DEV, `Backend-orquestracao`), que o original tinha e não tínhamos.
- `volumetria.contextos` expandido de só `Backend-chamadas http` para também `Backend-mensagens`, `Backend-orquestracao` e `Backend-processamento em lote` — a cobertura que o original já tinha.

**Passada de redação, motivada por um ponto preciso do usuário.** Sobre índices: *"nessa altura do desenho não se sabe quais os índices serão criados, mas é um item de checklist de implementação verificar (se aplicável) se vai envolver índices para não esquecer de implementar."* Nossa redação era assertiva ("Índices criados para as queries novas"), o que lê como afirmação de feito — errado pra um item que ainda vai ser especificado. Todos os requisitos passaram pra voz imperativa (a mesma do Confluence: "Definir...", "Especificar...", "Verificar..."), com "— se aplicável" onde o desenho legitimamente ainda não sabe. O caso dos índices virou: *"Verificar se as queries novas exigem índice e especificar quais — se aplicável"*.

**Duas correções ao plano original, decididas durante a implementação:**

1. **Não criei o contexto `Backend-processamento de arquivos`**, apesar de o original ter "processamento de arquivos" e eu ter proposto isso. Nenhum tipo de nó usaria esse contexto — viraria exatamente a declaração órfã que eu tinha acabado de criticar no `Frontend` (declarado em `app.example.json`, sem nenhum nó ou regra usando). Pior: `validateRegras()` falha alto quando um contexto de `regras.json` não existe em `app.json`, então seria config morta *e* quebraria a validação se eu declarasse só de um lado. O layout de arquivo entrou em `Backend-processamento em lote` com "se aplicável".

2. **Itens compartilhados entre contextos viraram uma entrada só com múltiplos contextos**, não entradas duplicadas. `contextoBate()` usa `.some()`, então uma entrada com `contextos: ["Backend-chamadas http", "Backend-orquestracao"]` casa se *qualquer* um estiver presente — e imprime uma vez só quando os dois estão. Duplicar a mesma frase em duas entradas produziria linha repetida numa atividade com ambos os contextos. Verificado na validação real (abaixo).

**Escopo mantido fora, com a razão:** o usuário perguntou por "precisa de mocks?" como *pergunta durante a especificação*. Isso hoje não é expressável: `requisitosRelevantes()` filtra **só por contexto** — um requisito não pode depender da resposta de um campo do nó. Fazer isso exigiria `Requisito.when` + decidir como avaliar a condição numa atividade de aresta (source e target são dois nós diferentes). Ficou registrado como opção B da pergunta de escopo, não escolhida nesta rodada.

## 7. Validação (segunda rodada)

Além dos 98 testes de engine verdes: validação de ponta a ponta com dado real, não só suíte. `gerador init` num projeto temporário (valida o template junto), `gerador implementar` sobre o cenário `credito-completo` (14 itens, contextos http + orquestração + regras + dados), e leitura da saída:

- Item de endpoint HTTP recebeu curl, mock/Mockoon, serviços a repontar, e o bloco de volumetria.
- Item de processo Camunda recebeu mock, repontar, descrição das alterações, curl de inicialização, compensação, instâncias em voo, e volumetria.
- Item de setup (sem contexto) recebeu só os dois itens sem contexto — sem volumetria, como esperado.
- **Zero linhas de requisito duplicadas** em qualquer item, confirmando a decisão 2 acima.
