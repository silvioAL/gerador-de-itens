# SPEC-22 — Checklist técnico respeita se o recurso já existe ou é novo

**Depende de/relacionado a:** SPEC-01 §9 (`FieldSpec.when`, operador `nodeStatus`), SPEC-20 (`ItemProcesso.when`, checklist de processo separado do técnico).

**Status: implementado.**

---

## 1. Contexto

O usuário reportou um problema de funcionalidade central: ao marcar um nó (ex.: um Mongo) como "já existe" em vez de "novo", o documento gerado continuava listando os mesmos itens de "Requisitos de refinamento técnico" que apareceriam para um recurso criado do zero — "isso não faz sentido... a ideia da ferramenta é acelerar o processo".

## 2. Achado

Todo `No` já tem `status: "novo" | "existente"` (`model/types.ts`), usado pelo engine pra decidir **quantas** atividades derivar — `derivarCriacaoGenerica()` retorna `[]` pra todo recurso `existente` (nenhuma atividade "Criar X." é gerada). O operador `nodeStatus` (`Condicao`) já existia e já era usado extensivamente em `FieldSpec.when` de `config/diagrama.example.json`: praticamente todo tipo de recurso (mongo, sql, kafka, rabbit, cache, storage, batch, camunda, rule/fico, job, mobile) tem um campo "Plano de migração"/"Estratégia para instâncias em voo" condicionado a `{ not: { nodeStatus: "novo" } }` — só aparece quando o recurso já existe.

O buraco estava no **checklist técnico** (`Requisito`, a seção "Requisitos de refinamento técnico" do documento final): o tipo não tinha `when` nenhum, e `gerarChecklistTecnico(regras, techs, contextos)` nem recebia os nós da atividade — estruturalmente não tinha como saber se o recurso era novo ou existente. O checklist de **processo** (`ItemProcesso`, SPEC-20) já tinha esse mecanismo (`when` avaliado contra os nós de origem via `condicaoBate()`), só nunca foi estendido pro checklist técnico.

Isso produziu uma duplicação concreta e evidenciável em `config/regras.example.json`: três itens de `checklistTecnico` repetiam, em texto solto, exatamente a mesma decisão que um `FieldSpec` já-existente-only já cobria — e apareciam pra TODO nó do contexto, novo ou existente:
- `Backend-dados`: *"Definir plano de migração e rollback do schema"* — duplica o campo `migracao` de mongo/sql.
- `Backend-orquestracao`: *"Definir o que acontece com instâncias em voo na migração..."* — duplica o campo `estrategiaVersionamento` do camunda.
- `Backend-regras`: *"Definir versionamento das regras..."* — duplica o campo `migracao` de rule/fico.

Os demais itens de `checklistTecnico` (retry/DLQ, idempotência, verificação de índice, timeout, invalidação de cache, política de acesso a objeto, chunk size de lote...) **não são duplicação** — são decisões de integração/uso que valem tanto pra recurso novo quanto existente (o código que fala com o recurso é novo de qualquer forma). Não foram condicionados.

## 3. Correção

- `Requisito` (`packages/engine/src/config/types.ts`) ganhou `when?: Condicao`, mesma semântica de `ItemProcesso.when` (satisfaz se **algum** nó de origem bater — `.some()`, mesma régua já usada).
- `gerarChecklistTecnico()` (`packages/engine/src/refinamento/gerarRefinamento.ts`) ganhou os parâmetros `nos: No[], arestas: Aresta[]` e passou a filtrar com `condicaoBate()` — extraída pra aceitar `Requisito | ItemProcesso` (a lógica era idêntica entre os dois, só o tipo do item mudava).
- Dois call sites atualizados: `gerarEspecificacaoEntrega.ts` (trivial — `nos`/`diagrama.edges` já computados ali pro checklist de processo, reusados) e `exportar.ts` (`paraMarkdown`, usado por `gerador derive`) — ganhou um parâmetro opcional `diagrama?: Diagrama`; sem ele, os nós de origem ficam `[]` e nenhum item condicionado aparece (mesma disciplina de "condição que não dá pra avaliar não é assumida verdadeira"). `packages/cli/src/commands/derive.ts` passa `quebra.diagrama`.
- Conteúdo: os três itens duplicados (`Backend-dados`, `Backend-orquestracao`, `Backend-regras`) ganharam `"when": { "nodeStatus": "existente" }` em `config/regras.example.json` e no mirror byte-idêntico `packages/cli/templates/regras.json`. Nenhum outro item mudou.

## 4. Fora de escopo, deliberado

- Nenhum item novo foi criado ("confirmar credenciais de acesso ao recurso existente", "validar que o índice necessário já existe") — o pedido era consertar a duplicação sem sentido, não expandir o checklist com conteúdo especulativo de domínio que ninguém pediu.
- Sem granularidade por sub-recurso (ex. "esta collection é nova" dentro de um Mongo que já existe) — `nodeStatus` no nível do nó inteiro já resolve o caso relatado.

## 5. Validação

- Testes novos: `gerarRefinamento.test.ts` (item condicionado a `nodeStatus` aparece/some conforme o status do nó de origem; sem nó de origem, não aparece), `exportar.test.ts` (mesmo comportamento com/sem `diagrama` passado pra `paraMarkdown`). Regressão completa: engine 120, web 129, cli 29.
- Validação real: `gerador implementar` sobre o cenário `credito-completo` (camunda, fico, sql, mongo, rule) em dois estados — todos "novo" (nenhum dos 3 itens aparece em lugar nenhum do documento) e camunda/mongo/rule marcados "existente" (cada item aparece só na atividade do nó certo — ex. "Definir plano de migração e rollback do schema" aparece na atividade do Mongo `existente`, mas não na do SQL que continua `novo`, mesmo contexto `Backend-dados` nos dois).
