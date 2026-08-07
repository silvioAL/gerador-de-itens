# SPEC-18 — Campo tipo "lista" (repetível) e o editor de Endpoints revivido

**Depende de/relacionado a:** SPEC-08 §3 (`campos_no`, o mecanismo de campo customizável por tipo de nó/time), CONTEXTO-E-ARQUITETURA.md §2 (Jornada 2, import via Graphify — o gatilho real desta rodada).

**Status: completo.**

---

## 1. Por que agora

Testando `gerador import-graphify` contra um projeto Camunda real (não este repositório), quase nenhum nó apareceu — achado documentado em SPEC-06 §5.4 (matching por caminho de arquivo era restritivo demais). Corrigido isso, o usuário foi além: "quando falei da parte de configurações estava me referindo a poder editar facilmente esse form que faltou implementar" — apontando que a captura de contrato de endpoint (`service.spec.contratoEndpoints`, um textarea único cobrindo todos os endpoints de um serviço misturados) nunca foi tão boa quanto o protótipo original.

Investigação no `gerador_de_itens-2.html` (o protótipo pré-rewrite, ver JOURNEY §1) confirmou: ele tinha um editor de "Endpoints" de verdade — lista repetível, botão "+ endpoint", cada linha com method/path/ação. O rewrite em TypeScript **manteve o modelo de dados** (`No.endpoints?: Endpoint[]`, já consumido por `derivar.ts` pra gerar uma atividade por endpoint) mas **nunca portou a UI** — só dava pra povoar `endpoints[]` escrevendo JSON à mão, e request/response viviam soltos num campo de texto único (`contratoEndpoints`), sem ligação com qual endpoint específico é qual.

## 2. Decisão de design: mecanismo genérico, não um editor hardcoded de Endpoints

O protótipo original tinha **várias** listas repetíveis com UI própria e hand-rolled: Endpoints (service), stages (Camunda), motores/rulesets (FICO), regras (rule) — cada uma seu próprio HTML/JS. Reconstruir só "Endpoints" do mesmo jeito repetiria exatamente o padrão que este rewrite já rejeitou desde SPEC-02/SPEC-03 ("não escreva formulário específico por tipo de nó").

Em vez disso: um **tipo de campo novo, genérico** — `TipoCampo` ganha `"lista"`, e `FieldSpec` ganha `itemSpec?: FieldSpec[]` (a forma de cada item; sem lista-de-lista, complexidade que ninguém pediu). Qualquer tipo de nó pode ter um campo `type: "lista"` declarado em `diagrama.json` (ou, agora, autorado direto na UI — §5), e o mesmo renderer genérico (`PropertiesPanel.tsx`) sabe desenhar a lista repetível pra qualquer um deles. "Endpoints" é só o primeiro uso, não um caso especial no código.

## 3. Onde o dado mora

Um campo `type: "lista"` guarda seu valor como qualquer outro campo — `No.spec[key]: ValorSpec`, só que `valor` é `Record<string, unknown>[]` (um objeto por item, chaveado por `itemSpec[].key`) em vez de escalar. Isso significa que campo lista participa do mesmo sistema que todo outro campo já tem de graça: `camposVisiveis`/`when`, N/A com motivo (`specNA`), proveniência (`origem: manual|extraido|...`).

`No.endpoints?: Endpoint[]` (o array especial no topo do nó, só pra `service`) foi **removido** — a lista de endpoints agora é só mais um campo de `service.spec`, chamado `endpoints`. `derivar.ts` lê `no.spec.endpoints?.valor as Endpoint[]` em vez de `no.endpoints`. `Endpoint` (`packages/engine/src/model/types.ts`) ganhou `request?`/`response?` opcionais — não existiam no protótipo original (que só tinha method/path/ação), mas é o que faltava pra amarrar o contrato de payload ao endpoint certo, resolvendo a ambiguidade do `contratoEndpoints` antigo.

## 4. UI genérica — `PropertiesPanel.tsx`

`FieldControl` ganhou um `case "lista"` dispatching pra `ListaControl`: zero ou mais itens, cada um renderizado recursivamente via `FieldControl` de novo (um por sub-campo do `itemSpec`), com botão "+ item" e "✕ remover" por linha. Sub-campos não têm sugestão de perfil de time nem N/A próprios — granularidade que ninguém pediu; provenance e N/A continuam só no nível do campo lista inteiro.

Achado de acessibilidade ao implementar: reaproveitar `FieldControl` recursivamente faz o mesmo `aria-label` (`campo.label`, ex.: "Method") se repetir em toda linha — ambíguo pra teste e pra leitor de tela. `FieldControl`/`TextareaComExpandir` ganharam um `ariaLabel?` opcional que `ListaControl` sobrescreve com `"{label} — item {n}"`.

## 5. Autoria via `CamposNoTab.tsx` — a peça que faz "editar facilmente" ser real

Não bastava o mecanismo existir só pra `service.endpoints` fixado em `diagrama.json` — o pedido era poder desenhar esse tipo de formulário pela própria ferramenta. `CamposNoTab` (editor de `campos_no`, SPEC-08 §3) ganhou `"lista"` como opção em "Tipo de campo", e um sub-editor (`ItemSpecEditor`) que monta o `itemSpec` linha a linha (chave, rótulo, tipo, opções quando `select`) — qualquer time pode criar um campo repetível novo do zero, não só herdar o de Endpoints.

Persistência (os três backends, mesma disciplina de sempre — hospedado e local ficam com a mesma forma):
- `packages/web/src/api/client.ts`: `CampoNo`/`DadosCampoNo` ganham `itemSpec?: ItemSpecCampo[]`.
- `packages/server`: migração `0009_campos_no_item_spec.sql` (`ALTER TABLE campos_no ADD COLUMN item_spec jsonb`), schema Drizzle e Zod (`routes/camposNo.ts`) atualizados.
- `packages/cli` (`openApiLocal.ts`, modo local): `CampoNoLocal` ganha o mesmo campo, serializado direto em `config/campos-no.json` — sem schema de banco, é só JSON.

## 6. Documento final — `gerarEspecificacaoEntrega.ts`

Um campo `type: "lista"` não cabe numa célula da tabela `| Campo | Valor | Proveniência |` que todo campo escalar usa — `formatarValor` num array viraria `"[object Object],[object Object]"`. `descreverEspecificacaoNo` agora separa campos escalares (tabela, como sempre) de campos lista (bloco próprio depois da tabela, um item por linha numerada). Sub-campos curtos (method/path/ação) ficam resumidos numa linha; sub-campos `textarea` (request/response) ganham linha própria indentada — um contrato JSON de várias linhas esmagado junto do resumo ficaria ilegível.

## 7. Migração de dados existentes

`config/diagrama.example.json` (+ mirror `packages/cli/templates/diagrama.json`): `service.spec.contratoEndpoints` removido, substituído por `endpoints` (`type: "lista"`, `itemSpec`: method/path/ação/request/response). Todo `config/cenarios/*.json` (+ mirror) que tinha `endpoints[]` no nível do nó ou `contratoEndpoints` no `spec` foi migrado pro formato novo — 16 cenários no total, a maioria só com `endpoints: []` vazio (removido, um campo não-preenchido simplesmente não aparece em `spec`) e 4 com dado real (`credito-completo`, `internal`, `mobile-android`, `mobile-ios`) onde o texto livre antigo (`"POST /x → {...} / 201 {...}"`) foi separado em `request`/`response` estruturados. `fixtures/01-servico-novo-fila-consumo.json` (fixture compartilhada de `derivar.fixture.test.ts`) migrada do mesmo jeito.

`external.spec` (`contratoEndpointsChamados`/`contratoRequest`/`contratoResponse`, JOURNEY §44) **não foi tocado** — é um campo flat legítimo pra "quais endpoints de terceiro este nó chama", conceito diferente de "quais endpoints este serviço expõe, cada um com seu contrato".

## 8. Validação

Testes novos: `packages/engine` (`campos.ts` genérico já cobria `when`/default sem mudança; `derivar.fixture.test.ts` com o fixture migrado; `gerarEspecificacaoEntrega.test.ts` — 5 casos cobrindo item com sub-campo curto+longo, múltiplos itens numerados, lista vazia, N/A, e que campo lista nunca vaza pra dentro da tabela de escalares); `packages/web` (`PropertiesPanel.test.tsx` — 3 casos: sem itens, adicionar+editar itens sem colisão de aria-label entre linhas, remover item específico; `CamposNoTab.test.tsx` — 2 casos: autoria de itemSpec completo, linha de sub-campo em branco descartada). Regressão completa dos 4 workspaces; `packages/server` typecheca limpo (migração/schema/rota), testes de integração não rodam nesta sessão por falta de Postgres local, mesma limitação de sempre.
