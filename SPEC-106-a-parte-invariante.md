# SPEC-106 — A parte invariante: onde a ferramenta se configura e se observa

> **Origem:** o usuário, olhando a tela de fluxo recém-nascida (SPEC-105 C+D)
> e o menu que a cerca:
>
> > *"isso precisa ser bem desenhado, acredito que exista uma parte do sistema
> > que é invariante, então por ali você poderá configurar a esteira, os
> > conectores com apis, a importação, e a exportação, e tela de visualização
> > do que é gerado no stage ou ainda o markdown antes de subir, ou configurar
> > para ver o resultado de um agente antes de rodar o próximo, mapear os
> > outputs como as variáveis, etc"*
>
> E, minutos depois, sobre um sintoma concreto do problema:
>
> > *"documento de desenho no menu também está muito estranho, fica vazio,
> > desconectado da jornada, como vamos trabalhar com as integrações pode nem
> > fazer sentido, e sim apenas armazenar o link no sistema"*
>
> Referências dadas pelo usuário: **n8n** (o canvas como lugar de trabalho) e
> **LangChain** (o pipeline como composição declarada).

---

## 0. A medição: o que existe hoje, e por que o menu parece maior que o produto

### 0.1 As superfícies que falam de "como a ferramenta trabalha"

| Superfície | O que faz | Onde mora |
|---|---|---|
| Mesa de projeto | desenha O SISTEMA do usuário | `#/` |
| **Fluxos de integração** | desenha O ENCANAMENTO (SPEC-105 C) | `#/fluxo` |
| Como está montada (mapa) | LÊ o encanamento implícito (esteira, regras, PDCA) | `#/sistema` |
| Documento de desenho | monta/exporta o artefato da demanda | `#/documento` |
| Config → Pipeline de IA | a esteira como LISTA ordenada | `#/config/pipeline` |
| Config → Exportação | os DESTINOS do gateway | `#/config/exportacao` |
| Config → Conectores | o CATÁLOGO com forma (SPEC-105 A) | `#/config/conectores` |
| Revisão (esteira rodando) | executa papéis item a item, com `acumuladas` | dentro da demanda |

**Oito lugares descrevem três ideias**: o que a ferramenta sabe chamar, em que
ordem ela trabalha, e o que sai no fim. A SPEC-105 acrescentou a forma certa
(grafo + catálogo) SEM remover as formas antigas — de propósito (§7 dela:
*"apagar a esteira antes de o fluxo cobrir o caso dela"* foi recusado). O preço
é o que o usuário viu: **duas gerações do mesmo conceito convivendo no menu**.

### 0.2 O sintoma medido: o Documento de desenho

- Abre **vazio** quando a demanda não derivou nada — tela inteira para dizer
  "nada ainda" (o usuário: *"fica vazio, desconectado da jornada"*).
- A saída real dele já é **a publicação via gateway** (`linkExterno` da
  SPEC-81) — o mesmo verbo que um conector de `documento` executa hoje pelo
  fluxo. Com fluxos, o documento tende a ser **um NÓ produtor de artefato**
  (markdown → destino), e o que o produto precisa GUARDAR é o link do que
  subiu, com o hash de que fiação o produziu (o rastro da SPEC-105 D já
  guarda metade disso).
- O que a tela tem de insubstituível hoje: a MONTAGEM do markdown (seções,
  variantes, itens) — isso é *produção de artefato*, não *destino*.

### 0.3 O que a SPEC-105 já entregou desta visão

| Pedido do usuário (§origem) | Estado |
|---|---|
| "configurar os conectores com apis" | **existe** — catálogo (A) |
| "mapear os outputs como as variáveis" | **existe** — `mapeamento` na aresta (C) |
| "ver o resultado de um agente antes de rodar o próximo" | **existe** — `ateNo` / "Executar até aqui" (§364) |
| "configurar a esteira" (pelo grafo) | **não** — a esteira segue lista (`pipeline-agentes`) |
| "a importação e a exportação" (pelo grafo) | **parcial** — dá para fiar conectores, mas as jornadas de importar/exportar não passam pelo fluxo |
| "visualização do que é gerado no stage / markdown antes de subir" | **não** — a saída de um nó aparece no rastro, mas não há um STAGE nomeado nem preview de artefato |

---

## 1. A tese: UMA parte invariante, TRÊS papéis

O que o usuário chama de "parte invariante" é o pedaço da ferramenta que não
muda com a demanda — o maquinário. A proposta é que ele tenha **um endereço
só**, com três papéis que hoje estão espalhados:

1. **Catálogo** — o que a ferramenta sabe chamar (conectores, papéis/agentes).
   Organizacional, curado (SPEC-105 §9.1).
2. **Fiação** — em que ordem e o que alimenta o quê (os fluxos; o canvas é a
   tela principal desse papel, não uma aba).
3. **Observação** — o que saiu: o *stage* de cada execução (saída por nó, o
   markdown/artefato ANTES de subir, o link DEPOIS de subir, o rastro com
   hash).

O **mapa do sistema** (`#/sistema`) é o embrião do papel 3 — ele já lê a
esteira e o PDCA; falta ler os fluxos e as execuções.

## 2. O destino de cada superfície de hoje

| Superfície | Proposta | Por quê |
|---|---|---|
| Config → Pipeline de IA | **fica**, como editor do CATÁLOGO de papéis; a ORDEM migra para o fluxo semeado (SPEC-105 F) | papel ≠ fiação: renomear/promptar um papel é catálogo; encadear é fluxo |
| Config → Exportação | **absorvida pelo catálogo de Conectores** ao fim da migração: destino é conector com operação conhecida | dois lugares para "endereço que a empresa chama" é a §0.1 de novo |
| Documento de desenho | **vira nó produtor + registro de link**: a montagem do markdown continua (é produção), o "subir" vira conector no fluxo, e a demanda guarda o link do que subiu | é o pedido literal do usuário ("apenas armazenar o link"); a tela vazia some porque deixa de ser um destino de menu |
| Revisão/esteira | **continua**, movida pelo fluxo semeado quando F provar resultado idêntico (SPEC-105 §8) | a recusa da 105 §7 segue valendo |
| Como está montada | **cresce**: ganha a vista de fluxos + últimas execuções (o stage) | é o papel 3 nascendo de quem já lê |
| Fluxos de integração | **é o canvas do papel 2** — a tela principal do maquinário | referência n8n |

## 3. O que esta SPEC RECUSA

- **Remover item de menu antes de a substituição provar que cobre o caso** — a
  régua da SPEC-105 §7, agora para telas. Cada absorção da tabela acima tem
  uma prova associada, e o item só sai com ela verde.
- **Um "modo n8n" para tudo.** A mesa de projeto NÃO entra na parte
  invariante: ela é da demanda. A fronteira da 105 §1 (dois grafos) continua.
- **Gatilhos** — continuam sendo a fatia G da 105, decisão do usuário.
- **Redesenhar a navegação inteira numa rodada.** O menu enxuga por
  subtração provada, não por reforma.

## 4. Fatias

- **A — o stage no rastro.** A execução ganha um lugar de OBSERVAÇÃO: cada nó
  com saída inspecionável, o artefato de um nó `agente` renderizado como
  markdown (preview "antes de subir"), e o link do que subiu guardado na
  execução. **Prova:** executar o fluxo de publicação e abrir o markdown do
  agente ANTES de o conector de escrita rodar (`ateNo` já dá o corte).
- **B — Exportação → Conectores.** A aba de Exportação passa a editar OS
  MESMOS registros que o catálogo mostra (um lugar de verdade); quando a
  paridade estiver provada, o item de menu sai. **Prova:** os quatro E2E de
  exportação/publicação/ADR/documento-externo passam sem tocar na aba antiga.
- **C — o documento como nó + link na demanda.** Um nó `documento` produz o
  markdown da demanda dentro do fluxo; publicar guarda `linkExterno` na
  demanda; a tela do documento deixa de ser item de menu e vira acesso pela
  demanda (onde há contexto, nunca vazia). **Prova:** o E2E do documento passa
  entrando pela demanda; nenhum caminho novo abre tela vazia.
- **D — a esteira semeada** (= SPEC-105 F, herdada). **Prova:** resultado
  idêntico item a item.
- **E — o mapa lê os fluxos.** `#/sistema` mostra fluxos + últimas execuções.
  **Prova:** um fluxo que falhou ontem aparece com o nó vermelho e o porquê.

> **Corte:** A e E são observação pura (risco baixo, valor imediato). B é a
> primeira absorção de menu, com prova mecânica. C é a que responde o
> incômodo do usuário e mexe em jornada — pede ele acordado. D herda a prova
> mais dura.

## 5. Perguntas em aberto

1. **O nó `documento` produz a partir de quê?** Da derivação da demanda ativa
   (determinística, fora do fluxo — §6 da 105) ou de qualquer entrada mapeada?
   A primeira preserva a tese; a segunda é um template engine. Recomendação: a
   primeira.
2. **O link armazenado mora onde?** Na demanda (junto de `linkExterno` que a
   publicação já devolve) ou no rastro da execução? Recomendação: nos dois —
   a demanda aponta o atual, o rastro guarda a história.
3. **"Stage" vira palavra da interface?** O usuário a usou; o vocabulário da
   casa (memória: o rótulo nomeia a origem) sugere algo como "saída da
   execução". Decidir com tela na mão.

## 6. Para quem implementar

- SPEC-105 §§1, 6, 7, 9 — as fronteiras que esta SPEC herda inteiras.
- `packages/web/src/fluxo/FluxoScreen.tsx` — o canvas; o rastro por nó é o
  embrião do stage (fatia A).
- `packages/server/src/routes/fluxos.ts` + `fluxo_execucoes` — onde o link do
  que subiu se pendura (fatia A/C).
- `packages/web/src/documento/DocumentoScreen.tsx` — o que é produção (fica)
  e o que é destino (vira conector) na fatia C.
- `packages/web/src/config/ExportacaoTab.tsx` + `ConectoresTab.tsx` — a
  unificação da fatia B.
- `packages/aplicacao/src/sistema/mapaDoSistema.ts` — a fatia E soma
  `fluxos`/`execucoes` à `EntradaDoMapa`.
