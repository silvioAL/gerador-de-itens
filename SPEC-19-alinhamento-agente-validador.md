# SPEC-19 — Alinhamento com o agente de IA que valida os itens (padrão de Confluence)

**Depende de/relacionado a:** `packages/engine/src/refinamento/gerarRefinamento.ts`, SPEC-14 (documento único, `gerarEspecificacaoEntrega.ts`).

**Status: parcialmente implementado — itens 1-3 do achado abaixo.**

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

## 5. Validação

`gerarRefinamento.test.ts`: teste novo confirmando o marcador exato (`<- ✍️ especificar`) em toda linha e a ausência de formato `- [ ]`; `describe("gerarVolumetria", ...)` (3 casos: contexto que ativa, contexto que não bate, tech sem volumetria configurada). `gerarEspecificacaoEntrega.test.ts`: 2 casos cobrindo o bloco de volumetria aparecendo/não aparecendo no documento final conforme o contexto da atividade. Fixtures de teste que usavam `tipo: "checklist"` (`validator.fixture.test.ts`, `exportar.test.ts`, `ReviewScreen.test.tsx`) atualizadas pra remover o campo, sem mudança de comportamento nesses testes. Regressão completa dos 4 workspaces.
