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

**Riqueza visual (Fase E, implementada em duas rodadas)** — achado real do usuário, repetido em várias mensagens: "visualmente ainda está muito distante do protótipo... animações, feedback visual onde os agentes estão trabalhando, alternância dos itens, animação das conexões".

*Primeira rodada*: tick circular numerado por papel na barra de handoff (check verde quando terminou, anel girando enquanto ativo, número apagado quando ainda não chegou a vez); token atravessando a seta a cada handoff (`handoff-hop-token`, remontado via `key` pra retriggerar a animação); pip do papel/item em processamento pulsando (`pip-pulsando`), distinto do pip só preenchido; nó ativo pulsando no `DiagramaCompacto` (`diagrama-no-ativo`) e arestas que o tocam com traço tracejado fluindo (`diagrama-aresta-ativa`).

*Segunda rodada* (o usuário comparou de novo com o protótipo e apontou 4 diferenças estruturais que sobravam — "a barra dos agentes é menor, localização dos textos, timeline que vai sendo gerada à esquerda dos cards dos itens, as animações das conexões... a scroll bar também está diferente"):

- **`EsteiraAgentes.tsx` (componente novo)**: a barra saiu de dentro do header — onde era um apêndice espremido — pra uma **faixa própria de 62px** logo abaixo dele, com 4 células `flex: 1` no padrão do `.pipe`/`.ag` do protótipo: número (`01`..`04`), nome do papel, subtítulo, e tick à direita. O subtítulo é o detalhe que faltava: quando o papel ainda não chegou a vez, mostra **o que ele faz** (`DESCRICAO_PAPEL`, exportado junto de `ROTULO_PAPEL` — fonte única); quando está ativo, vira **o que ele está fazendo agora** ("item 3 de 14 · 03", prefixado por "Pausado — " quando pausado). Célula ativa ganha borda inferior e fundo suave; conectores entre células têm seta em CSS puro e hospedam o token de handoff. O header ficou só com título, trilho fino de progresso (`.track` do protótipo), contadores e botões.
- **Timeline vertical na lista** (`.review-rail`): linha com gradiente à esquerda dos cards, um "galho" horizontal e um ponto por item, e uma barra de progresso brilhante que cresce conforme os itens saem do rascunho. O ponto reflete o estado real do item: pulsando quando a esteira está escrevendo nele, verde quando refinado, azul com halo quando selecionado. A altura do brilho é derivada do mesmo `statusDoItem()` que os cards usam — sem estado paralelo de "progresso visual" que pudesse divergir do que a lista mostra.
- **Cometa nas conexões** (`.diagrama-cometa`): além do tracejado fluindo, um traço claro percorre a aresta do nó de origem ao de destino, em laço, enquanto aquele nó está ativo. Usa `pathLength="100"` no `<line>` — com isso o traço vira porcentagem do comprimento e a mesma animação serve pra arestas curtas e longas sem ajuste por caso.
- **Scrollbar** (`.review-lista`): a nativa do Windows (larga, clara) destoava do tema escuro; agora é fina, com polegar escuro arredondado e borda da cor do fundo.

Todas as animações continuam em CSS puro (`packages/web/src/styles.css`), sem lib nova.

*Quarta rodada — streaming de verdade nos campos + divisória arrastável + pan/zoom*. Três pedidos do usuário: (1) "nesses campos de resposta hoje fica só esse ícone de gerando e 3 pontos, é um tanto pobre... mostrar o que está rodando no modelo seria a melhor coisa, tal como a experiência que existe com o Claude"; (2) divisória clicável/arrastável entre o diagrama e a metade de baixo; (3) pan/zoom no diagrama compacto como no canvas principal.

- **Streaming do pipeline** (llm+cli+web): `completarComSchema` ganhou `onTexto` — a grammar GBNF restringe O QUE sai, não impede streaming; o texto cru do JSON restrito sai token a token. `/ia/pipeline/:papel` virou text/plain chunked (mesmo padrão do `/ia/sugerir` da Fase 1c); como o corpo completo é sempre JSON válido (a grammar garante), o cliente acumula, mostra ao vivo e faz `JSON.parse` no final — sem segundo canal pra resposta estruturada. `useEsteiraDeAgentes` expõe `respostasAoVivo: Record<chave, string>` extraído do JSON parcial por `extrairRespostasParciais()` (varredura de pares `"chave": "valor..."` tolerante a valor não fechado — não é parser de JSON geral e não precisa ser, o parse de verdade acontece no final). Na `AbaRefinamento`, o campo em geração mostra o texto do modelo digitando com caret piscando (`.texto-ao-vivo::after`), e pontinhos respirando antes do primeiro token — não mais "…" parado.
- **Divisória arrastável** (`ReviewScreen`): faixa de 10px com grip entre o diagrama e o split, `cursor: ns-resize`, pointer capture; altura clampada em [120px, 70vh]. `DiagramaCompacto` ganhou o prop `altura` (default continua 30vh).
- **Pan/zoom** (`DiagramaCompacto`): a vista é um viewBox alternativo (`null` = enquadramento automático); arrastar o fundo move (limiar de 4px separa arrasto de clique — o clique de soltar um pan NÃO vira filtro por nó), roda do mouse amplia/reduz ancorado no cursor, duplo clique recentra.

Achado de teste registrado: jsdom 25 **não implementa `PointerEvent`** — `fireEvent.pointerDown` cai num `Event` genérico que descarta `clientX`/`button` do init, e o guard `e.button !== 0` engolia tudo silenciosamente. Correção dupla: o código tolera eventos sem essas propriedades (`e.button != null && ...`, coords `?? 0` — inofensivo no browser), e os testes despacham `Event` com as propriedades atribuídas via `Object.assign` (helper `eventoPonteiro`).

*Terceira rodada — o `DiagramaCompacto` refeito nas proporções do protótipo*. O usuário pediu explicitamente pra eu abrir o protótipo com Playwright ("como nos testes web, abra ele, rode, tire mais prints, entenda o código") em vez de descrever as diferenças — fiz isso, e o `buildDiagram()`/CSS do protótipo viraram a referência direta: palco de 30vh com fundo pontilhado e brilho radial no topo; cards de 200×64 com **tipo em caps colorido + nome em mono + badge de contagem de itens** (`contagemPorNo`, derivado em `ReviewScreen` da mesma `origem.nodeId` que o filtro usa) e a marca `EXISTENTE` pra nós com esse status; **arestas como paths curvos** (reta borda-a-borda na mesma linha, cúbica entre linhas) **na cor do nó de origem**, com o rótulo da conexão em caps ancorado no ponto médio real do path sobre um fundo escuro; animação de desenho na entrada (`stroke-dashoffset` com `pathLength=100`) e nós "pousando" em cascata (`animation-delay` por índice, `fill-mode: backwards` de propósito — `both` manteria `opacity: 1` pra sempre e quebraria o esmaecimento do filtro); halo do nó ativo via `drop-shadow` **na cor do próprio tipo** (não mais azul fixo); legenda de tipos presentes no canto inferior esquerdo (a "barra do fluxo informacional") e a dica "Clique num nó pra filtrar os itens" à direita.

*Quinta rodada — lote por agente + fix do Confirmar + animações param quando ocioso*. Três achados reais do usuário: (1) "os itens são gerados com chamadas individuais ao modelo? está muito lento — passe todo material em uma chamada única para cada agente; com 20-30 itens rode em grupos de 5-10 com recuperação do contexto"; (2) "o botão Confirmar ao lado de Sugerir parece não estar gerando ação nenhuma"; (3) "quando encerro a aplicação pelo terminal as animações da tela seguem rodando como se não tivesse parado de executar".

- **Lote por agente** (cli+web): era **1 chamada por item por papel** (4×N — até 52 chamadas pra 13 itens, a causa real da lentidão: cada chamada paga o overhead de prompt+prefill inteiro de novo). Agora `/ia/pipeline/:papel` recebe `{contextoEpico?, itens: [{chave, rotulo, contextoNo, placeholders}]}` — o LOTE inteiro numa chamada só — e devolve JSON **aninhado** `{itemChave: {placeholderChave: valor}}`, garantido pelo schema GBNF aninhado. `useEsteiraDeAgentes` fatia a fila em grupos de `TAM_LOTE_ESTEIRA = 5` (5, não 10: a resposta do lote precisa caber na janela de saída do modelo local sem truncar — os campos do Especialista estouram fácil com 10). Cada lote re-envia o prompt completo (contexto do épico + contexto de nó por item) — é a "recuperação do contexto" entre grupos. 4×⌈N/5⌉ chamadas: 13 itens caem de 52 pra 12. A revisão individual não muda nada — as respostas continuam aterrissando placeholder a placeholder via `onResponderItem`, e o streaming ao vivo virou `extrairRespostasParciaisAninhadas()` (dois níveis fixos, mesmo mini-scanner) com `respostasAoVivoPorItem`; `atual` (item destacado/auto-follow) agora é derivado da última chave de item aberta no JSON parcial — o destaque acompanha o item que o modelo está literalmente escrevendo dentro do lote, e `escrevendoChaves` marca o lote inteiro nos pips/rail.
- **Fix do Confirmar**: o handler lia só o rascunho digitado (`rascunhos[chave]`) — quando a resposta veio da esteira e o usuário não digitou nada, era `undefined` e o clique virava um no-op silencioso, com o botão habilitado (o texto exibido no textarea usava o fallback pra `p.resposta.valor`, o handler não). Correção: o mesmo fallback dentro do handler. Teste de regressão cobre exatamente o cenário (resposta `sugerido`/não confirmada, clique sem digitar).
- **Animações param quando ocioso**: pulso do nó ativo, cometa e fluxo tracejado eram chaveados só em `noAtivoId` — que tem fallback pro item selecionado manualmente, então a tela continuava "trabalhando" pra sempre depois da esteira acabar (ou do servidor morrer). `DiagramaCompacto` ganhou o prop `animado` (= `esteira.rodando`): sem ele, o nó selecionado mantém só o destaque estático (halo, borda, espessura), nenhuma animação de trabalho roda.

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
6. **Fase F — configurabilidade (implementada, escopo essencial)**: `config/pipeline-agentes.json` ganhou `papeis[]` — lista ordenada de `{id, nome, descricao, grupo, preambulo, ativo, contextos}`. A ordem do array É a ordem da esteira; `ativo: false` pula o papel; `preambulo` custom vence o padrão (resolvido no servidor: custom → padrão do grupo → genérico); `contextos` restringe o papel a techs/contextos específicos, com a MESMA semântica de casamento parcial do `contextoBate()` do engine ("Backend-mensagens" casa "Backend-mensagens rabbitmq"). **Fronteira central da fase**: as 4 SEÇÕES da ficha (`GrupoFicha`) continuam fixas — dado do engine —, e todo papel (inclusive custom) escreve em exatamente uma; agentes contextuais são papéis custom presos a contextos que "roubam" os itens do contexto deles do papel geral quando vêm ANTES na ordem (regra: o primeiro papel ativo do grupo que casar leva o item — `papelDoGrupo()`). A aba "Pipeline de IA" virou o editor completo (reordenar ↑↓, ativar/desativar, nome/descrição/prompt/contextos, "+ Agente contextual" removível; os 4 padrão só desativam). Achado de implementação: o auto-start da esteira ganhou a MESMA disciplina do `confirmacaoObrigatoria` — espera status E config juntos (`Promise.allSettled`) e passa os papéis recém-resolvidos explicitamente pra `montarFilaEsteira`/`iniciar`, senão a primeira corrida largava com os 4 de fábrica numa corrida com o fetch da config (papel desativado rodava). O **canvas visual** de mapeamento papel→contexto (§4.6c) fica registrado como evolução — a semântica já existe via configuração; o canvas seria só outra forma de editá-la.
7. **Fase G — rastreabilidade**: horário por resposta, se necessário (§7).

Cada fase ganha sua própria especificação de detalhe antes de codar (§6.1 já estabelecido no projeto) — esta spec é só a arquitetura, não uma licença pra implementar tudo de uma vez.

## 10. Verificação

**Fases A-C validadas com Playwright contra o modelo Qwen3-4B real** (cenário "Mensageria RabbitMQ", 6 itens): `gerador open`, "Derivar Quebra" disparou a esteira sozinha — handoff visual "PO → Arquiteto → Especialista técnico → QA" com "PO" destacado, ficha reorganizada em seções por papel ("PO"/"ARQUITETO"), campos ainda sem resposta mostrando "PO gerando…". Depois dos 6 itens do PO completarem (todos passaram de "rascunho" pra "revisar"), o handoff avançou pra "Arquiteto" de verdade (`aria-current="step"` migrou), confirmando que o eixo "papel × todos os itens" funciona como desenhado — não é só um item processado, é o PAPEL inteiro. Conteúdo gerado real e contextual, não genérico: história "Como um membro do time de antifraude, quero ser notificado assim que um pagamento for aprovado, para que possamos monitorar e auditar as transações..." e critérios citando `srv-pagamentos-aprovacao`, DLQ, timeout de 5 segundos, retries — nomes reais do diagrama, não placeholder. 24 pips renderizados na lista (4 papéis × 6 itens), confirmando o indicador visual "por onde o item já passou". Fases E-G continuam não implementadas (roteiro §9).

Fora dessa validação real (que substitui/complementa a revisão de spec pra fases já codadas), verificação de fases futuras continua sendo a revisão desta spec pelo usuário antes de cada uma começar, mesma disciplina do SPEC-23 original.

**Fase D validada com Playwright contra o `gerador open` real, com o modelo Qwen3-4B já instalado na máquina do usuário e a esteira rodando ao vivo** (cenário "Mensageria RabbitMQ", 4 nós, 6 itens): clique no último nó do diagrama compacto (`srv-antifraude`) reduziu a lista de 6 para 1 item (o único derivado daquele nó); os outros 3 nós ficaram visivelmente esmaecidos no SVG, o nó filtrado manteve opacidade plena. Segundo clique no mesmo nó restaurou os 6 itens. Confirmado que o filtro funciona corretamente COM a esteira de agentes rodando em paralelo (não é um modo exclusivo) — a fase bar de handoff e o filtro por nó convivem na mesma tela sem conflito, exatamente como desenhado.

**Fase E validada com Playwright contra o `gerador open` real, modelo Qwen3-4B rodando ao vivo** (cenário "Mensageria RabbitMQ"): screenshot do header confirma os 4 ticks numerados (`①②③④`), PO com anel girando (ativo) e os demais como número apagado (pendente); aresta entre `srv-pagamentos-...` e `pagamentos.even...` (os dois nós envolvidos no item em processamento) destacada com traço azul tracejado, nó ativo com borda azul. Pip verde preenchido no item concluído confirma o indicador funcionando junto com a animação. `confirmacaoObrigatoria` validado via testes automatizados (CLI: GET default `true`, PUT/GET roundtrip; web: hook aplica `confirmado: true` quando `false`, `ReviewScreen` end-to-end com `onResponderItem` mockado) — não validado manualmente em modo `false` nesta rodada (fica registrado como verificação pendente pra próxima sessão de teste do usuário).

**Quinta rodada (lote) validada com Playwright contra o `gerador open` real, modelo Qwen3-4B ao vivo** (cenário "Integração interna entre serviços", 2 nós, 4 itens): a esteira completou com **exatamente 4 chamadas** a `/ia/pipeline/:papel` — uma por papel, cada uma com os 4 itens no corpo (`["n1::setup","n1::ep0","n2::ep0","e1::http"]`) — onde antes seriam 16. Streaming aninhado visível (texto da história digitando com caret; auto-follow migrando de item DENTRO do lote conforme o modelo avançava, faixa "itens 1–4 de 4 · 02"); handoff com tick verde e token "PO → Arquiteto" após o primeiro lote, com os 4 itens passando de rascunho→revisar de uma vez (respostas do JSON aninhado distribuídas corretamente). **Confirmar**: clique no botão de uma história sugerida SEM digitar nada virou ✓ verde + texto fixo (era no-op silencioso). **Animações**: com a esteira terminada, 0 cometas no SVG e aresta estática, mantendo só o destaque estático do nó selecionado.

**Fase F validada com Playwright contra o `gerador open` real, modelo Qwen3-4B ao vivo** (cenário "Integração interna", 4 itens; `config/pipeline-agentes.json` com QA `ativo: false`, PO renomeado pra "PO do squad" com preâmbulo custom, e `confirmacaoObrigatoria: false`): a faixa renderizou exatamente 3 papéis com o nome custom; a esteira fez exatamente 3 chamadas — `["po", "arquiteto", "especialista"]`, nenhuma de QA; **8 campos do item 1 terminaram confirmados (✓, texto fixo) sem nenhum clique** — o que também fecha a verificação pendente do modo sem confirmação registrada na Fase E. Bônus observado: a história gerada citou a "defasagem de até 5 minutos" do saldo — restrição que só existe no épico realista da rodada anterior, provando o contexto do épico chegando no prompt de verdade.

## 11. Fora de escopo desta tela (herdado literalmente do comportamento anexado)

Edição de prompts/variáveis/ordem dos agentes (tela própria — Fase F) · edição do canvas principal (a tela de revisão só lê, nunca escreve no diagrama) · persistência e envio ao board.

## 12. Anexo — spec de comportamento fornecida pelo usuário (verbatim, referência de protótipo `gerador-itens-prototipo-v3.html`)

> Ver mensagem do usuário nesta rodada (JOURNEY.md §67) para o texto completo — omitido aqui por já estar mapeado seção a seção em §3-§7 acima. Resumo das 10 seções originais: (1) A esteira — 4 papéis, tabela entrada/saída/escreve-na-ficha; (2) Estado do item; (3) Sequência de geração — canvas/lista/ficha por fase; (4) Derivação por regras — `aplica()`, re-derivação preserva editado; (5) Edição direta — inline, marca "editado"; (6) Propostas — funil único, roteamento por conteúdo; (7) Canvas — somente leitura, filtro por nó; (8) Rastreabilidade; (9) Invariantes (5 itens); (10) Fora de escopo desta tela.
