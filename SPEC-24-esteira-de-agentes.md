# SPEC-24 — Esteira de agentes (PO → Arquiteto → Especialista técnico → QA)

## 1. Objetivo

Substituir o mecanismo atual de geração por item (SPEC-23, Fase 1d-ii — uma chamada de IA só, devolvendo história + critérios + checklist técnico de uma vez) por uma **esteira de 4 papéis em sequência fixa**, cada um consumindo o artefato **completo** do papel anterior (não item a item), com um funil único de revisão (proposta → aprovar → confirmar) e rastreabilidade completa de origem. O pipeline de 4 papéis é o **default configurável**, não uma esteira hardcoded: o usuário poderá editar prompts, ordem, e escolher quais agentes se aplicam a quais nós/contextos por um canvas dentro das Configurações — mas essa configurabilidade é Fase F deste roteiro, não pré-requisito das fases anteriores.

Referência de comportamento: `_prototipos/gerador-itens-prototipo-v3.html` (protótipo mockado, sem IA real) + spec de comportamento fornecida pelo usuário (reproduzida em anexo ao final deste documento, §12).

## 2. Contexto

SPEC-23 Fase 1d-ii (implementada, `v0.1.29`) fechou o gap arquitetural mais grave — a IA já escreve história de usuário e critérios de aceite contextuais, não só checklist técnico solto — mas ainda é **uma chamada única e genérica** por item. O usuário, ao compartilhar o protótipo v3, descreveu uma divisão de responsabilidade mais rica e mais próxima de como um time real trabalha: um papel de Produto escreve a história e os critérios, um papel de Arquitetura desenha o contrato técnico (request/response/erros) e as dependências, um papel de Especialista técnico deriva os requisitos de refinamento por tech/contexto (o que já existe hoje via `regras.json`/`listarPlaceholders()`), e um papel de QA deriva regras de teste e escreve cenários Gherkin.

A diferença estrutural mais importante em relação a 1d-ii: cada papel processa **todos os itens de uma vez** antes do próximo começar — não é mais "item 1 completo, item 2 completo...", é "PO termina todos os itens, depois Arquiteto começa em todos os itens, depois Especialista, depois QA". Isso é mais fiel ao fluxo real (um PO não pensa request/response de contrato, um Arquiteto não escreve critério de aceite) e abre espaço pra cada papel usar um prompt/contexto mais focado.

## 3. Investigação feita (mapeamento pro código atual)

- **`RegrasConfig`/`Condicao`** (`packages/engine/src/config/types.ts`) já tem a forma exata que o papel "Especialista técnico" descreve: `RegrasPorTech.checklistTecnico: Requisito[]` (`{texto, contextos, when?}`), `RegrasPorTech.testes: TesteAutomatizado[]` (`{tipo, validacao, contextos, dev, hlg}`). A regra `aplica(regra) = contextos vazio OU interseção != ∅` do protótipo já existe, implementada em `contextoBate()` (`gerarRefinamento.ts:10-17`) — usada por `requisitosRelevantes`/`testesRelevantes` dentro de `listarPlaceholders()`. **Nenhuma mudança de schema é necessária pro papel Especialista** — ele é, na prática, o mecanismo já existente de checklist técnico/testes, só reencaixado como uma etapa nomeada da esteira em vez de "parte do call único".
- **`ValorSpec`** (`{valor, origem, evidencia?, confianca?, confirmado?, padrao?}`, `model/types.ts:10-17`) e `Quebra.respostasItens: Record<atividadeChave, Record<chave, ValorSpec>>` continuam sendo o mecanismo de persistência pra tudo que é **texto escalar com proveniência** — história de usuário, critérios de aceite, requisito de checklist, regra de teste. O campo `evidencia` (existente, hoje não usado por nenhum fluxo de IA) é reaproveitado pra guardar a origem `"tech · contexto"` que o protótipo pede (invariante #2, §12.9) — sem precisar de campo novo no modelo.
- **Contrato de arquitetura** (request/response/erros/dependências, escrito pelo papel Arquiteto) **não cabe** em `ValorSpec` (que é um valor escalar + proveniência, não uma estrutura aninhada). Precisa de um campo novo — ver §5.
- **`DiagramaCompacto.tsx`** (leitura pura, SVG, sem handlers de clique hoje) é a base certa pro canvas somente-leitura com filtro por nó que a Fase D pede — mais perto do necessário do que reaproveitar `Canvas.tsx` (React Flow completo, construído pra edição/drag/connect, exigiria desligar bastante coisa).
- **`ConfigScreen.tsx`** já tem o padrão de abas (`AbaConfig` union + botão + bloco condicional) que a Fase F (config de pipeline) vai seguir — mesma estrutura de `CamposNoTab`/`EspecificacaoTemplateTab` existentes.
- **`/ia/*` hoje**: `GET /ia/status`, `POST /ia/sugerir` (streaming, um placeholder), `POST /ia/sugerir-item` (GBNF, um item inteiro — o mecanismo que esta spec substitui pelo default). Nenhuma rota por papel existe ainda.
- **`useGeracaoAoVivo`/`ItemFilaGeracao`** (1d-ii) processam **um item por vez, do início ao fim**. A esteira de 4 papéis muda o eixo: processa **um papel por vez, por todos os itens**. É um redesenho de orquestração, não uma extensão incremental.

## 4. Decisões de arquitetura

### 4.1 Papel = etapa nomeada de um pipeline configurável, com um schema de saída fixo por papel

Cada papel é um registro `{id, rotulo, ordem, promptBase, entradas[], saidasEsperadas[]}`. O **default** (não removível, mas editável) é exatamente a esteira de 4 papéis do protótipo:

| Papel | Consome | Produz | Onde grava |
|---|---|---|---|
| `po` | diagrama (nós/arestas), contexto do épico | história de usuário, critérios de aceite | `respostasItens[chave]["_historiaUsuario"]`/`["_criteriosAceite"]` — **já existente (1d-ii), sem mudança** |
| `arquiteto` | itens do PO, arestas do diagrama | contrato (nó vinculado, request, response, erros, dependências) | 5 chaves fixas novas em `respostasItens[chave]` (§4.2) |
| `especialista` | contratos, `RegrasConfig` (tabela já existente) | requisitos de refinamento (checklist técnico/volumetria) | `respostasItens[chave]["${tech}::${texto}"]` — **mecanismo já existente, sem mudança** |
| `qa` | critérios do PO, contrato do Arquiteto, requisitos do Especialista | regras de teste + cenário Gherkin (texto livre) | `respostasItens[chave]["_regrasTeste"]`/`["_cenarioFeature"]`, chaves fixas novas (§4.2) |

Cada papel só começa quando o anterior terminou **todos os itens** — não é uma restrição nova de código, é a ordem de iteração do orquestrador (§6).

### 4.2 Contrato e cenários de teste — decisão fechada: sem tipo novo, cada sub-campo é sua própria chave em `respostasItens`

Decisão fechada (revisitada antes de codar a Fase A — a ideia original de serializar um objeto dentro de `ValorSpec.valor: unknown` foi descartada): **nenhum tipo novo no `model/types.ts`, nenhuma mudança em `ValorSpec`**. Cada sub-campo do contrato vira sua própria chave fixa dentro de `respostasItens[atividadeChave]`, exatamente como `_historiaUsuario`/`_criteriosAceite` já funcionam — um `ValorSpec` normal, `valor: string`, sem exceção. Motivo: um `valor: unknown` guardando JSON serializado quebraria toda suposição hoje espalhada pela UI (`typeof p.resposta?.valor === "string"` em `ReviewScreen.tsx`, `String(p.resposta?.valor)` em `renderizarItemEspecificacao`) e exigiria um editor de sub-campo novo — ao passo que campos escalares soltos reusam **tudo** (input, "✨ Sugerir", "Confirmar", markdown final) sem nenhuma linha de UI nova além de listar mais placeholders. Precedente direto: o próprio contrato-de-nó em `AbaContrato` já é uma lista de campos escalares, não um objeto aninhado editável de uma vez.

Chaves fixas novas, sempre presentes (mesmo padrão de `CHAVE_HISTORIA_USUARIO`/`CHAVE_CRITERIOS_ACEITE`):

```ts
// packages/engine/src/refinamento/gerarRefinamento.ts
export const CHAVE_CONTRATO_NO_VINCULADO = "_contratoNoVinculado";
export const CHAVE_CONTRATO_REQUEST = "_contratoRequest";
export const CHAVE_CONTRATO_RESPONSE = "_contratoResponse";
export const CHAVE_CONTRATO_ERROS = "_contratoErros";
export const CHAVE_CONTRATO_DEPENDENCIAS = "_contratoDependencias";
export const CHAVE_REGRAS_TESTE = "_regrasTeste";       // texto livre (markdown), mesma forma que _criteriosAceite
export const CHAVE_CENARIO_FEATURE = "_cenarioFeature";  // conteúdo Gherkin, texto livre
```

`PlaceholderRefinamento.secao` ganha 3 valores novos: `"contrato" | "regrasTeste" | "cenarioFeature"` (as 5 chaves de contrato compartilham a seção `"contrato"` — são o mesmo agrupamento visual). `FichaItem` ganha:

```ts
contrato: { noVinculado: FichaPlaceholder; request: FichaPlaceholder; response: FichaPlaceholder; erros: FichaPlaceholder; dependencias: FichaPlaceholder };
regrasTeste: FichaPlaceholder;
cenarioFeature: FichaPlaceholder;
```

`regrasTeste`/`cenarioFeature` sendo texto livre (não lista estruturada de `RegraTeste[]`) é a mesma simplificação já aplicada a `_criteriosAceite` ("1 ou 2 cenários... formato livre, pode ser Gherkin") — consistente, não uma regressão de expressividade em relação ao resto do sistema.

### 4.3 Estado do item é derivado, não persistido — generaliza `statusDoItem()` já existente

```
rascunho ──(edição humana | proposta aplicada)──▶ em revisão ──(0 requisitos pendentes)──▶ refinado
```

`statusDoItem()` (`ReviewScreen.tsx`) já implementa essa régua pros placeholders de 1d-ii (`respostaConfirmada()` = `origem === "manual" || confirmado === true`). Generalização necessária: incluir os novos campos (`contrato`/`regrasTeste`/`cenarioFeature`) na lista de "placeholders" que contam pro status — mesma função, lista maior de entrada.

### 4.4 Funil único de proposta — generaliza a disciplina "nada sugerido conta até confirmado" pra um fluxo de 2 passos visíveis

```
proposta ──▶ [Aprovar] ──▶ confirmação ("altera N pontos de ITEM-XX") ──▶ [Confirmar] ──▶ aplicada
```

Hoje (1d-ii) uma sugestão já fica `origem: "sugerido", confirmado: false` até o usuário confirmar — a mecânica de fundo já existe. O que faltava era a **UI de dois passos visíveis** (Aprovar ≠ escrever, Confirmar escreve) e o **roteamento por conteúdo** de um pedido em chat livre pro papel certo (tabela §12.6) — isso substituiria e absorveria a sub-fase 1e ("funil unificado de proposta") já registrada em SPEC-23 §6.5.

**Decisão revisada na implementação (achado real do usuário)**: em vez do funil de 2 passos (Aprovar → confirmação → Confirmar) por sugestão individual, ou do chat livre com roteamento por conteúdo — ambos ainda maiores que o necessário —, o usuário esclareceu o pedido real: "essencialmente é a mesma experiência do protótipo, a diferença é que pode avançar sozinho até o fim, ou ir parando conforme está hoje". Ou seja, o que faltava não era um funil de aprovação por sugestão, e sim uma **configuração de sistema** que alterna entre os dois modos já existentes na infraestrutura:

- `confirmacaoObrigatoria: true` (default, comportamento de hoje) — cada resposta da esteira fica `confirmado: false`, pendente de revisão manual campo a campo.
- `confirmacaoObrigatoria: false` — a esteira aplica cada resposta direto (`confirmado: true`), avançando sozinha item a item, papel a papel, sem pausa — o mesmo comportamento do protótipo de referência. O usuário continua podendo revisar/editar qualquer campo depois, a qualquer momento.

Persistência: `config/pipeline-agentes.json` (`GET`/`PUT`), o mesmo arquivo que a Fase F (§4.6) vai estender com prompts/ordem/agentes contextuais — não um arquivo novo por decisão de configuração do pipeline. UI: nova aba "Pipeline de IA" em `ConfigScreen`. O chat livre com roteamento por conteúdo (`/ia/perguntar`, tabela §12.6) e o funil de 2 passos por sugestão individual continuam registrados como possível evolução futura, mas **não fazem parte do que foi pedido** — removidos do escopo imediato desta spec.

### 4.5 Canvas somente-leitura com filtro por item — extensão pontual de `DiagramaCompacto`

Clique num nó filtra a lista de itens pelos itens daquele nó (e esmaece os demais); segundo clique limpa o filtro. Selecionar um item destaca o nó correspondente (mecanismo de destaque já existe via `noAtivoId`, só reaproveitado pra seleção manual em vez de só "nó em geração"). Implementação: adicionar `onClick` por nó em `DiagramaCompacto`, e um `filtroNoId` de estado na `ReviewScreen` que filtra `resultado.atividades` antes de renderizar a lista.

### 4.6 Configurabilidade do pipeline (Fase F, não bloqueante das fases anteriores)

O usuário poderá: (a) editar o prompt-base de cada papel, (b) reordenar/desabilitar papéis, (c) escolher **quais papéis se aplicam a quais nós/contextos** via um canvas dentro de Configurações (mesmo padrão visual do canvas principal, mas o propósito aqui é mapear papel→contexto, não desenhar arquitetura). Precedente direto: `regras.json`/`RegrasPorTech` já faz exatamente esse tipo de mapeamento (tech→contexto→requisito) — a config de pipeline generaliza esse padrão pra papel→contexto→prompt. Persistência: `config/pipeline-agentes.json`, mesmo padrão de arquivo local editável já usado por `regras.json`/`campos-no.json`.

## 5. Fluxo por fluxo (mapeamento protótipo → implementação)

Seções 1, 2, 4, 5, 6, 7, 8, 9 do comportamento anexado (§12) mapeiam, respectivamente, pra: orquestrador de 4 estágios (§6 abaixo), `statusDoItem()` generalizado (§4.3), derivação por regras já existente (§4.1, papel Especialista), edição direta reaproveitando os componentes de formulário já existentes (`AbaRefinamento`-like, um por seção da ficha), funil único (§4.4), canvas com filtro (§4.5), rastreabilidade (novo — ver §7), e os invariantes (§4.3/#4.4 já cobrem #1 e #3; #2 é o uso de `evidencia`; #4/#5 são consequência de reusar a mecânica existente).

## 6. Orquestração — eixo muda de "item completo" pra "papel completo em todos os itens"

```ts
// esboço conceitual, não assinatura final — detalhar em Fase C
interface EstadoEsteira {
  papelAtual: "po" | "arquiteto" | "especialista" | "qa" | null;
  itemAtualDoPapel: string | null;  // atividadeChave
  progressoPapel: { feito: number; total: number };
  rodando: boolean; pausado: boolean;
  iniciar(): void; pausar(): void; continuar(): void; gerarDeNovo(): void;
}
```

Cada papel roda sequencialmente sobre a fila de itens (nunca em paralelo — mesma razão de sempre, um modelo local, uma sessão só); o papel inteiro termina antes do próximo começar. Handoff visível na UI: um "token" atravessa a seta entre papéis no header, nomeando o payload entregue (ex.: "critérios → Arquiteto") — puramente visual, sem mudança de mecanismo por trás. Falha num item de um papel não trava a esteira — item fica sem aquele campo, os demais completam, editável manualmente depois (mesma disciplina de 1d-ii).

Pips por item: cada card na lista mostra 4 indicadores (um por papel), preenchido quando aquele papel já passou por aquele item — dado derivado de quais campos da ficha já têm `ValorSpec` presente, não estado novo.

**Riqueza visual (Fase E, implementada)** — achado real do usuário, repetido em várias mensagens: "visualmente ainda está muito distante do protótipo... animações, feedback visual onde os agentes estão trabalhando, alternância dos itens, animação das conexões". A barra de handoff ganhou um tick circular numerado por papel (`①②③④`) — check verde quando o papel já terminou, anel girando (CSS puro, `@keyframes`) enquanto está ativo, número apagado quando ainda não chegou a vez; o token que "atravessa a seta" descrito acima virou de fato um elemento visual (`handoff-hop-token`, remontado a cada handoff via `key`, retriggerando a animação), mostrando o rótulo do item entregue. O pip do papel/item em processamento agora pulsa (`pip-pulsando`), distinto do pip só preenchido (já passou). `DiagramaCompacto` ganhou: nó ativo pulsando (opacidade do traçado, `diagrama-no-ativo`) e as arestas que tocam o nó ativo destacadas com um traço tracejado fluindo (`diagrama-aresta-ativa`, `stroke-dashoffset` animado) — todas as animações em CSS puro (`packages/web/src/styles.css`), sem lib nova.

## 7. Rastreabilidade

Cada resposta (`ValorSpec`) já carrega `origem`. Falta: (a) `evidencia` populado com `"papel · tech · contexto"` quando aplicável, (b) horário — `ValorSpec` não tem timestamp hoje; precisa de campo novo opcional (`geradoEm?: string`, ISO) se a rastreabilidade "com horário" (§12.8) for exigida literalmente; decisão adiada pra quando essa fase for implementada (pode ser dispensável se o "consolidado de edições humanas" bastar sem timestamp por campo).

## 8. Fora de escopo, deliberado

- Edição de prompts/variáveis/ordem dos agentes fora da Fase F — cada fase anterior usa o pipeline default fixo (mas já modelado como dados, não hardcoded no código, pra Fase F não exigir reescrever o motor).
- Persistência/envio ao board (Jira/Linear/etc.) — fora de escopo desta tela, como já é hoje.
- Multi-modelo (um papel usando um LLM diferente de outro) — o pipeline roda inteiro sobre o mesmo `MotorChat` já carregado; suporte a modelo por papel fica registrado como possível extensão futura, não desenhado agora.
- Paralelismo entre papéis ou entre itens — mantém a disciplina "nunca paralelo" de 1c/1d/1d-ii; se o tempo total da esteira (4x mais chamadas que 1d-ii) virar fricção real, otimização de desempenho é problema a resolver depois de medir, não a especular agora.

## 9. Roteiro faseado (registrado nesta spec, não implementado nesta rodada)

1. **Fase A — modelo de dados (implementada)**: 7 chaves fixas novas (contrato ×5, `_regrasTeste`, `_cenarioFeature`) sempre presentes em `listarPlaceholders()`, `FichaItem`/`montarFichaItem()` expondo os campos novos, seções novas em `renderizarItemEspecificacao()` (decisão de §4.2 fechada). **Decisão tomada na implementação, revisando a intenção original deste item**: `statusDoItem()` (ReviewScreen) e a fila de geração (`montarFila()`/`AbaRefinamento`) **não foram generalizados** pra contar os 7 campos novos — eles ficam de propósito fora da UI/fila até a Fase B/C existirem. Motivo: sem uma rota/orquestração capaz de preenchê-los ainda, contá-los como pendência faria todo item regredir pra "rascunho" permanentemente, sem nenhuma ferramenta (nem manual) pra resolver — regressão de UX sem benefício. `FichaItem` expõe os campos novos (dado disponível pra quem quiser consumir), mas nenhuma tela referencia isso ainda — é modelo de dados puro, exatamente como planejado, só que a fronteira "invisível" inclui também `statusDoItem`/fila, não só rota/UI.
2. **Fase B — cli (implementada)**: `POST /ia/pipeline/:papel` — uma rota parametrizada por papel na URL, não 4 rotas nomeadas (decisão tomada: o schema é sempre o mesmo formato dinâmico de `placeholders[]`, só o preâmbulo do prompt muda por papel via `PREAMBULO_PADRAO_POR_PAPEL`). Papel desconhecido cai no preâmbulo genérico (nunca 400), já pensando na Fase F (papel custom). `/ia/sugerir-item` (Fase 1d-ii) foi **removida** — a esteira processa por papel, o mecanismo de item-inteiro-numa-chamada não tem mais consumidor.
3. **Fase C — orquestração web (implementada)**: `useGeracaoAoVivo` (item×tudo) substituído por `useEsteiraDeAgentes` (papel×todos-os-itens, §6) — hook novo, o antigo foi removido junto com `apiIa.sugerirItem`. Fase bar mostra o handoff visual (4 papéis com setas, o atual destacado) e "item N de M" dentro do papel corrente. Pips (4 indicadores por item, um por papel) na lista lateral mostram por onde cada item já passou. `AbaRefinamento` reorganizada em seções por papel. **`statusDoItem()`/fila de geração generalizados** pra contar os 9 placeholders agora que a Fase B/C existe de verdade (decisão da Fase A revertida, como planejado).
4. **Fase D — canvas com filtro (implementada)**: `DiagramaCompacto` ganhou `onClickNo`/`noFiltradoId` (props novas, opcionais — não quebra os usos existentes em Fase 1d/C). `ReviewScreen` ganhou estado `filtroNoId`: clique num nó filtra `resultado.atividades` pra só os itens daquele nó (via `chaveParaNodeId`, já existente), segundo clique no mesmo nó limpa (toggle); os demais nós ficam esmaecidos (`opacity: 0.35`) enquanto o filtro está ativo. `noAtivoId` ganhou um segundo uso: já destacava o nó em geração (`esteira.atual`); agora, fora da esteira rodando, destaca o nó do item selecionado manualmente — reaproveitamento direto, sem mecanismo novo, exatamente como previsto em §4.5. Indicador textual "N de M itens · rótulo do nó" com botão "× limpar filtro" complementa o toggle por clique (acessibilidade — não depende de acertar o mesmo nó de novo).
5. **Fase E — configuração de confirmação + riqueza visual (implementada, escopo revisado)**: decisão revisada em §4.4 (achado real do usuário) — não o funil de 2 passos/chat livre originalmente desenhado, e sim um toggle de sistema `confirmacaoObrigatoria` (`config/pipeline-agentes.json`, `GET`/`PUT`, aba "Pipeline de IA" em `ConfigScreen`) alternando entre pausar pra confirmação manual (default) e aplicar direto sem pausa (comportamento do protótipo). Junto: riqueza visual da esteira (ticks numerados/check/anel girando na barra de handoff, token de handoff visível, pip pulsante no papel/item em processamento, nó ativo pulsando e arestas conectadas animadas no `DiagramaCompacto`) — ver detalhe em §6. Funil de 2 passos por sugestão e chat livre com roteamento por conteúdo ficam registrados como possível evolução futura, fora do escopo imediato.
6. **Fase F — configurabilidade**: aba nova em `ConfigScreen` pra editar prompts/ordem, canvas de mapeamento papel→contexto (§4.6) — a aba "Pipeline de IA" já existe (Fase E), Fase F estende o mesmo arquivo/tela com os campos que faltam.
7. **Fase G — rastreabilidade**: horário por resposta, se necessário (§7).

Cada fase ganha sua própria especificação de detalhe antes de codar (§6.1 já estabelecido no projeto) — esta spec é só a arquitetura, não uma licença pra implementar tudo de uma vez.

## 10. Verificação

**Fases A-C validadas com Playwright contra o modelo Qwen3-4B real** (cenário "Mensageria RabbitMQ", 6 itens): `gerador open`, "Derivar Quebra" disparou a esteira sozinha — handoff visual "PO → Arquiteto → Especialista técnico → QA" com "PO" destacado, ficha reorganizada em seções por papel ("PO"/"ARQUITETO"), campos ainda sem resposta mostrando "PO gerando…". Depois dos 6 itens do PO completarem (todos passaram de "rascunho" pra "revisar"), o handoff avançou pra "Arquiteto" de verdade (`aria-current="step"` migrou), confirmando que o eixo "papel × todos os itens" funciona como desenhado — não é só um item processado, é o PAPEL inteiro. Conteúdo gerado real e contextual, não genérico: história "Como um membro do time de antifraude, quero ser notificado assim que um pagamento for aprovado, para que possamos monitorar e auditar as transações..." e critérios citando `srv-pagamentos-aprovacao`, DLQ, timeout de 5 segundos, retries — nomes reais do diagrama, não placeholder. 24 pips renderizados na lista (4 papéis × 6 itens), confirmando o indicador visual "por onde o item já passou". Fases E-G continuam não implementadas (roteiro §9).

Fora dessa validação real (que substitui/complementa a revisão de spec pra fases já codadas), verificação de fases futuras continua sendo a revisão desta spec pelo usuário antes de cada uma começar, mesma disciplina do SPEC-23 original.

**Fase D validada com Playwright contra o `gerador open` real, com o modelo Qwen3-4B já instalado na máquina do usuário e a esteira rodando ao vivo** (cenário "Mensageria RabbitMQ", 4 nós, 6 itens): clique no último nó do diagrama compacto (`srv-antifraude`) reduziu a lista de 6 para 1 item (o único derivado daquele nó); os outros 3 nós ficaram visivelmente esmaecidos no SVG, o nó filtrado manteve opacidade plena. Segundo clique no mesmo nó restaurou os 6 itens. Confirmado que o filtro funciona corretamente COM a esteira de agentes rodando em paralelo (não é um modo exclusivo) — a fase bar de handoff e o filtro por nó convivem na mesma tela sem conflito, exatamente como desenhado.

**Fase E validada com Playwright contra o `gerador open` real, modelo Qwen3-4B rodando ao vivo** (cenário "Mensageria RabbitMQ"): screenshot do header confirma os 4 ticks numerados (`①②③④`), PO com anel girando (ativo) e os demais como número apagado (pendente); aresta entre `srv-pagamentos-...` e `pagamentos.even...` (os dois nós envolvidos no item em processamento) destacada com traço azul tracejado, nó ativo com borda azul. Pip verde preenchido no item concluído confirma o indicador funcionando junto com a animação. `confirmacaoObrigatoria` validado via testes automatizados (CLI: GET default `true`, PUT/GET roundtrip; web: hook aplica `confirmado: true` quando `false`, `ReviewScreen` end-to-end com `onResponderItem` mockado) — não validado manualmente em modo `false` nesta rodada (fica registrado como verificação pendente pra próxima sessão de teste do usuário).

## 11. Fora de escopo desta tela (herdado literalmente do comportamento anexado)

Edição de prompts/variáveis/ordem dos agentes (tela própria — Fase F) · edição do canvas principal (a tela de revisão só lê, nunca escreve no diagrama) · persistência e envio ao board.

## 12. Anexo — spec de comportamento fornecida pelo usuário (verbatim, referência de protótipo `gerador-itens-prototipo-v3.html`)

> Ver mensagem do usuário nesta rodada (JOURNEY.md §67) para o texto completo — omitido aqui por já estar mapeado seção a seção em §3-§7 acima. Resumo das 10 seções originais: (1) A esteira — 4 papéis, tabela entrada/saída/escreve-na-ficha; (2) Estado do item; (3) Sequência de geração — canvas/lista/ficha por fase; (4) Derivação por regras — `aplica()`, re-derivação preserva editado; (5) Edição direta — inline, marca "editado"; (6) Propostas — funil único, roteamento por conteúdo; (7) Canvas — somente leitura, filtro por nó; (8) Rastreabilidade; (9) Invariantes (5 itens); (10) Fora de escopo desta tela.
