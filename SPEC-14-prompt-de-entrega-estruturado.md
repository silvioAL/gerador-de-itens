# SPEC-14 — Especificação de entrega estruturada

**Depende de** `gerarPacoteImplementacao` (JOURNEY.md §11.3, removida por este SPEC) · Corrige um achado de auditoria (JOURNEY.md §29): o único `.md` agregado (`paraMarkdown`) só carregava `specResumo` (subconjunto curado); os campos de contrato ricos e os N/A com motivo só existiam na versão por-atividade. Este SPEC fecha o gap por construção: a especificação completa vira uma variável do documento gerado, nunca fica de fora.

**Status: aprovado, pronto pra implementar — v3.** v1 tinha 5 perguntas em aberto (todas respondidas). v2 gerava um documento **por atividade**, chamado de "prompt" — usado contra um cenário real (fluxo de aprovação de crédito) e corrigido pelo usuário: virar um documento **por quebra inteira**, e o nome "prompt" confunde (não é uma instrução de LLM, é um artefato estruturado). v3 é essa correção.

---

## 1. Objetivo

1. **`.csv` deixa de ser saída** — feito (JOURNEY §26).
2. **A entrega final vira um documento estruturado por quebra** — "Especificação de entrega", não "prompt". Um documento só, cobrindo todas as atividades derivadas daquela quebra, não mais um artefato por atividade atômica. O usuário tem um agente próprio, conectado via MCP, que faz o upload — fora do escopo deste projeto.

## 2. Por que "por quebra", não "por atividade" — achado de uso real

v2 gerava um documento por atividade do engine (uma linha da tabela de revisão = um artefato). Testado contra um cenário real (fluxo de aprovação de crédito: orquestração, decisão de score, consulta a bureau externo, persistência, auditoria, reprocessamento), o resultado ficou ruim: a atividade atômica "Setup inicial de srv-credito-api" virou um documento inteiro sozinho, com uma "História" degenerada ("Como \<papel\>, quero setup inicial de srv-credito-api...") — porque uma atividade de setup não é uma história de usuário, é um passo técnico dentro de uma entrega maior. Gerar N documentos rasos e repetitivos (cada um repetindo Contexto/História) é pior que um documento coeso.

**Correção:** um documento por `quebra` (todas as atividades de `resultado.atividades`), não por atividade. Contexto e visão geral aparecem **uma vez** no topo; cada atividade vira uma **seção numerada** dentro do documento, com sua própria especificação técnica/refinamento/critérios de aceite (que são legitimamente por-atividade); Definition of Ready/Done fecham o documento, uma vez.

## 3. Arquitetura: dois subagentes Claude Code fora do app, não LLM dentro do server

Sem mudança desta decisão: **nenhuma chamada a LLM entra em `packages/server`.** O `gerador` continua motor determinístico, config-driven, zero I/O de IA — produz um documento bem formado (template + variáveis). Dois subagentes do Claude Code, fora deste repositório, no mesmo espírito da Fase C (Confluence):

1. **Subagente de revisão/refino** — lê a especificação de entrega gerada, aplica o refino (linguagem de PO, cenários Gherkin de verdade, avalia DoR/DoD contextualmente — ver §5).
2. **Subagente de upload** (já existe, é do usuário) — conectado ao MCP do rastreador de destino, recebe o resultado já refinado.

Motivo: meter LLM dentro do server exigiria gerenciar chave de API, custo, erro de rede externa — infraestrutura nova pra resolver o que uma sessão Claude Code já resolve de graça.

## 4. Estrutura do documento (lista fechada)

```
# {{titulo}}

## Contexto
{{contexto}}

## Visão geral
{{historiaPo}}

## Itens
{{itens}}

## Definition of Ready
{{definitionOfReady}}

## Definition of Done
{{definitionOfDone}}
```

- **Título** — texto livre (default "Especificação de entrega"), não é mais `atividade.rotulo`.
- **Contexto** — `quebra.demandInfo` + união de `timesEnvolvidos` de todas as atividades.
- **Visão geral (estilo PO)** — "Como \<papel\>, quero \<ação\>, para que \<benefício\>" — **uma vez**, não repetida por item. Sem inferência automática (exige julgamento humano ou do subagente de refino).
- **Itens** — uma seção `### N. {{rotulo}} — {{descricao}}` por atividade, nesta ordem, cada uma com: cabeçalho (tipo/tamanho/techs/contextos/dependências), especificação técnica completa (tabela com proveniência, reaproveitando a lógica de `gerarPacoteImplementacao`), requisitos de refinamento técnico (`gerarChecklistTecnico`/`gerarCiclosDeTeste`, já existentes), critérios de aceite (placeholder Gherkin — conteúdo real fica pro subagente de refino). **Renderização de item não é template editável pelo usuário** — só a estrutura de fora (título/contexto/visão geral/DoR/DoD) é.
- **Definition of Ready / Definition of Done** — ver §5.

## 5. DoR/DoD são contextuais — o motor direciona, não decide

Apontado pelo usuário: DoR (Definition of Ready) e DoD (Definition of Done) variam por contexto — o motor pode *direcionar* (um baseline objetivo, verificável a partir do que já foi modelado), mas a heurística fina (o que realmente importa pra *este* fluxo) é trabalho do subagente de refino, não do engine determinístico.

- **Definition of Ready** — baseline fixo + nota explícita de que não é lista fechada:
  - Contexto e objetivo de negócio claros
  - Dependências (`enabler`/`dependent`) mapeadas
  - Nenhum campo obrigatório em aberto na especificação técnica (prontidão verde)
  - _(item específico deste fluxo — completar com base no contexto; não é uma lista fechada)_
- **Definition of Done** — baseline fixo (código revisado, sem regressão na suíte) + mesma nota. Os ciclos de teste automatizados (`gerarCiclosDeTeste`) continuam aparecendo, mas dentro de cada item (são por techs/contextos daquele item específico), não agregados aqui.

## 6. Template: 1 documento só, base global com override por time

Como o documento cobre a quebra inteira (mistura de tipos de atividade), o conceito de "um template por tipo de item" (v2) não se sustenta — **vira 1 template só**, mesmo padrão de override de `campos_no`/`perfis_time` (sentinela `__global__`, override por time).

- Tabela `especificacao_templates`: `id, timeId ("__global__" ou id de time), conteudo, atualizadoEm`. Único por `timeId` (não mais por `(timeId, tipoItem)` — a dimensão `tipoItem` deixa de existir).
- `GET /especificacao-template?timeId=X` devolve o efetivo: template do time se existir, senão o global.
- `PUT /especificacao-template` upsert por `timeId`.
- Seed: um template global (o texto do §4) — não mais 4.

**O que sai desta versão, por não fazer mais sentido:** `prompt_templates.tipoItem`, o enum `["História","Task","Débito Técnico","Spike"]`, e o seletor de molde na revisão — tudo isso existia só pra escolher "com qual template renderizar esta atividade", problema que desaparece ao gerar um documento por quebra em vez de por atividade.

## 7. Variáveis, substituição e validação

- Placeholders `{{variavel}}` — substituição de string simples.
- Variáveis válidas: `titulo`, `contexto`, `historiaPo`, `itens`, `definitionOfReady`, `definitionOfDone` — 6, não mais 8 (especificação técnica/refinamento/critérios/dependências viraram parte da renderização interna de cada item, não variáveis de topo).
- Validação ao salvar: rejeitar `{{variavel}}` desconhecida (typo) — mesmo mecanismo de v2 (`validarTemplate`/`extrairVariaveis`, reaproveitados sem mudança de lógica, só a lista de variáveis válidas muda).

## 8. Onde isso entra no fluxo existente

- `ReviewScreen.tsx`: o botão por linha ("gerar prompt", v2) some. Vira **um botão no cabeçalho da tela** (ao lado de "Exportar .md"), que abre um painel com o documento inteiro da quebra + botão copiar.
- CLI: `gerador implementar <quebra.json> [--out arquivo]` — perde o argumento `<chave-ou-rótulo>` (não tem mais sentido pedir uma atividade específica); gera o documento inteiro, mesmo padrão de `gerador derive`.
- `gerarPacoteImplementacao`/a função de v2 (`gerarPrompt`, por atividade) não sobrevivem em paralelo — substituídas por `gerarEspecificacaoEntrega(atividades, diagrama, config, opcoes)`.

## 9. O que fica de fora

- Nenhuma chamada a LLM dentro de `packages/server`.
- Nenhuma chamada direta a Jira/Azure DevOps/rastreador algum.
- Geração automática do conteúdo dos cenários Gherkin, ou da heurística fina de DoR/DoD — isso é trabalho do subagente de refino.
- `paraCsv()`/`paraMarkdown()` continuam existindo no engine, sem mudança.

## 10. Implementação

1. `packages/engine/src/especificacao/gerarEspecificacaoEntrega.ts` — substitui `packages/engine/src/prompt/gerarPrompt.ts` (v2, removido).
2. `packages/server`: migração reescrita in-place (a de v2 nunca rodou fora desta sessão de desenvolvimento — sem custo reescrever em vez de empilhar uma nova), schema `especificacaoTemplates`, rota `GET/PUT /especificacao-template`.
3. `packages/web`: `EspecificacaoTemplateTab.tsx` (editor único, substitui `PromptTemplatesTab.tsx`); `ReviewScreen.tsx` ganha o botão de documento único no cabeçalho.
4. CLI: `implementar.ts` perde o argumento de atividade, gera o documento inteiro.
5. Testes: `gerarEspecificacaoEntrega` contra fixture real com múltiplas atividades (confirma que o documento agrupa tudo, não duplica Contexto/Visão geral); validação de variável desconhecida.
