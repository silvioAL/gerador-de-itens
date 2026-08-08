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
| `po` | diagrama (nós/arestas), contexto do épico | história de usuário, critérios de aceite (lista) | `respostasItens[chave]["_historiaUsuario"]`, novo campo lista `criteriosAceite[]` (§5) |
| `arquiteto` | itens do PO, arestas do diagrama | contrato (nó vinculado, request, response, erros), dependências | novo campo `contrato` por item (§5) |
| `especialista` | contratos, `RegrasConfig` (tabela já existente) | requisitos de refinamento (checklist técnico/volumetria) | `respostasItens[chave]["${tech}::${texto}"]` — **mecanismo já existente, sem mudança** |
| `qa` | critérios do PO, contrato do Arquiteto, requisitos do Especialista | regras de teste + cenários Gherkin | novo campo `regrasTeste[]`/`cenarioFeature` por item (§5) |

Cada papel só começa quando o anterior terminou **todos os itens** — não é uma restrição nova de código, é a ordem de iteração do orquestrador (§6).

### 4.2 Contrato e cenários de teste ganham modelo de dados novo — não cabem em `ValorSpec`

```ts
// packages/engine/src/model/types.ts — extensão de Atividade ou de Quebra.respostasItens
export interface ContratoItem {
  noVinculado?: string;           // nodeId
  request?: string;               // texto livre ou JSON — decidir em Fase A
  response?: string;
  erros?: string;
  dependencias?: string;
  origem: Origem;
  confirmado?: boolean;
}
export interface RegraTeste { tipo: string; validacao: string; dev: boolean; hlg: boolean; origem: Origem; confirmado?: boolean }
export interface CenarioFeature { conteudo: string; origem: Origem; confirmado?: boolean }
```

Decisão a confirmar em Fase A (não fechada nesta spec): esses três campos vivem em `Quebra.respostasItens[chave]` sob chaves fixas novas (`_contrato`, `_regrasTeste`, `_cenarioFeature`, valor serializado como JSON dentro de `ValorSpec.valor: unknown`, que já é `unknown`-typed) — **reaproveita 100% do mecanismo de persistência/round-trip/"nada sugerido conta até confirmado"** — versus um campo novo top-level em `Atividade`. A primeira opção é consistente com a disciplina "reusar `respostasItens` antes de inventar campo novo" já seguida em 1d-ii; only motivo pra campo novo seria se a UI precisar editar sub-campos individualmente (ex.: só o `response` sem tocar `request`) de um jeito que um `ValorSpec` único não suporta bem — decisão de UI, adiada pra Fase A/C quando o formulário de edição for desenhado.

### 4.3 Estado do item é derivado, não persistido — generaliza `statusDoItem()` já existente

```
rascunho ──(edição humana | proposta aplicada)──▶ em revisão ──(0 requisitos pendentes)──▶ refinado
```

`statusDoItem()` (`ReviewScreen.tsx`) já implementa essa régua pros placeholders de 1d-ii (`respostaConfirmada()` = `origem === "manual" || confirmado === true`). Generalização necessária: incluir os novos campos (`contrato`/`regrasTeste`/`cenarioFeature`) na lista de "placeholders" que contam pro status — mesma função, lista maior de entrada.

### 4.4 Funil único de proposta — generaliza a disciplina "nada sugerido conta até confirmado" pra um fluxo de 2 passos visíveis

```
proposta ──▶ [Aprovar] ──▶ confirmação ("altera N pontos de ITEM-XX") ──▶ [Confirmar] ──▶ aplicada
```

Hoje (1d-ii) uma sugestão já fica `origem: "sugerido", confirmado: false` até o usuário confirmar — a mecânica de fundo já existe. O que falta é a **UI de dois passos visíveis** (Aprovar ≠ escrever, Confirmar escreve) e o **roteamento por conteúdo** de um pedido em chat livre pro papel certo (tabela §12.6) — isso substitui e absorve a sub-fase 1e ("funil unificado de proposta") já registrada em SPEC-23 §6.5, que fica formalmente encerrada por esta spec.

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

## 7. Rastreabilidade

Cada resposta (`ValorSpec`) já carrega `origem`. Falta: (a) `evidencia` populado com `"papel · tech · contexto"` quando aplicável, (b) horário — `ValorSpec` não tem timestamp hoje; precisa de campo novo opcional (`geradoEm?: string`, ISO) se a rastreabilidade "com horário" (§12.8) for exigida literalmente; decisão adiada pra quando essa fase for implementada (pode ser dispensável se o "consolidado de edições humanas" bastar sem timestamp por campo).

## 8. Fora de escopo, deliberado

- Edição de prompts/variáveis/ordem dos agentes fora da Fase F — cada fase anterior usa o pipeline default fixo (mas já modelado como dados, não hardcoded no código, pra Fase F não exigir reescrever o motor).
- Persistência/envio ao board (Jira/Linear/etc.) — fora de escopo desta tela, como já é hoje.
- Multi-modelo (um papel usando um LLM diferente de outro) — o pipeline roda inteiro sobre o mesmo `MotorChat` já carregado; suporte a modelo por papel fica registrado como possível extensão futura, não desenhado agora.
- Paralelismo entre papéis ou entre itens — mantém a disciplina "nunca paralelo" de 1c/1d/1d-ii; se o tempo total da esteira (4x mais chamadas que 1d-ii) virar fricção real, otimização de desempenho é problema a resolver depois de medir, não a especular agora.

## 9. Roteiro faseado (registrado nesta spec, não implementado nesta rodada)

1. **Fase A — modelo de dados**: `ContratoItem`/`RegraTeste`/`CenarioFeature` no engine (decisão de §4.2 fechada), `statusDoItem()` generalizado, sem UI/rota nova ainda.
2. **Fase B — cli**: rota(s) por papel (`POST /ia/pipeline/:papel` ou 4 rotas nomeadas — decidir em Fase B se o schema por papel justifica rotas separadas ou um parâmetro só muda o prompt), reaproveitando `completarComSchema`/schema dinâmico já existente.
3. **Fase C — orquestração web**: `useGeracaoAoVivo` reescrito pro eixo "papel × todos os itens" (§6), fase bar com handoff visual, pips por item.
4. **Fase D — canvas com filtro**: extensão de `DiagramaCompacto` (§4.5).
5. **Fase E — funil unificado de proposta**: UI de 2 passos (Aprovar/Confirmar) + roteamento de chat livre por conteúdo (§4.4) — encerra formalmente a 1e do SPEC-23.
6. **Fase F — configurabilidade**: aba nova em `ConfigScreen` pra editar prompts/ordem, canvas de mapeamento papel→contexto (§4.6).
7. **Fase G — rastreabilidade**: horário por resposta, se necessário (§7).

Cada fase ganha sua própria especificação de detalhe antes de codar (§6.1 já estabelecido no projeto) — esta spec é só a arquitetura, não uma licença pra implementar tudo de uma vez.

## 10. Verificação

Sem código nesta rodada — verificação é a revisão desta spec pelo usuário antes de Fase A começar, mesma disciplina do SPEC-23 original.

## 11. Fora de escopo desta tela (herdado literalmente do comportamento anexado)

Edição de prompts/variáveis/ordem dos agentes (tela própria — Fase F) · edição do canvas principal (a tela de revisão só lê, nunca escreve no diagrama) · persistência e envio ao board.

## 12. Anexo — spec de comportamento fornecida pelo usuário (verbatim, referência de protótipo `gerador-itens-prototipo-v3.html`)

> Ver mensagem do usuário nesta rodada (JOURNEY.md §67) para o texto completo — omitido aqui por já estar mapeado seção a seção em §3-§7 acima. Resumo das 10 seções originais: (1) A esteira — 4 papéis, tabela entrada/saída/escreve-na-ficha; (2) Estado do item; (3) Sequência de geração — canvas/lista/ficha por fase; (4) Derivação por regras — `aplica()`, re-derivação preserva editado; (5) Edição direta — inline, marca "editado"; (6) Propostas — funil único, roteamento por conteúdo; (7) Canvas — somente leitura, filtro por nó; (8) Rastreabilidade; (9) Invariantes (5 itens); (10) Fora de escopo desta tela.
