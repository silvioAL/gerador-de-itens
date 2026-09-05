# SPEC-105 — O fluxo como grafo: conectores, pipeline e dados

> **Origem:** o usuário, depois de cinco rodadas seguidas de conserto pontual em
> integrações:
>
> > *"chega dessas coisas específicas, isso está me incomodando muito, preciso de
> > uma spec que atenda a seguinte demanda: o sistema deve funcionar de forma
> > aberta como lang chain visual com grafos, e com suporte visual a plugar
> > conectores, para isso precisamos unificar features como importação,
> > exportação, e pipeline de IA para um desenho semelhante ao do n8n"*
>
> E o refinamento que define o escopo — **ele divide a SPEC**:
>
> > *"note que precisa ser dividido, assim resolvemos, tem o que é do pipeline, e
> > imports com destinos mapeados, como para a própria mesa de projetos, ou as
> > outras funções que estávamos falando quando importação e exportação, mas mais
> > dinâmico, possível configurar chamadas externas, como por exemplo para
> > consultar dados de volumetria dos projetos, e conectar essa resposta ao
> > agente que roda em seguida para por exemplo ele criar jmx de testes jmeter"*

---

## 0. A medição: por que toda integração custa uma rodada inteira

### 0.1 Existem TRÊS mecanismos, e eles não se conhecem

| # | Mecanismo | Forma | Onde mora |
|---|---|---|---|
| **1** | **Destinos do gateway** | `DestinoDoGateway { id, operacao, endpoint, rotulo, cabecalhos, metodo, envelope, espaco }` | `config/exportador` |
| **2** | **Esteira de agentes** | `PapelConfigurado { id, nome, descricao, grupo, preambulo, ativo, contextos }` | `config/pipeline-agentes` |
| **3** | **Regras/campos/conexões** | documentos por chave | `config_documentos` |

São três modelos de dados, três telas, três formas de configurar. Nenhum deles
sabe que os outros existem.

### 0.2 O gargalo, nomeado

**`operacao` é uma LISTA FECHADA** (`OPERACOES_DO_GATEWAY`). Acrescentar uma
integração exige, hoje:

1. entrada na lista fechada (decisão declarada — e isso é bom);
2. uma **porta** em `packages/aplicacao/src/portas/`;
3. um **adaptador** em `packages/server/src/adaptadores/gatewayDoTime.ts`;
4. uma **rota** no servidor;
5. uma **afordância** na tela;
6. um **endpoint no dublê**, senão ninguém consegue exercitar;
7. testes em cada camada.

**Sete lugares. Por integração.**

> Isto não é hipótese: é o que as últimas rodadas mediram.
> O **§349** acrescentou `documentoExterno` — e entregou 1, 2, 3 e parte do 5,
> **esquecendo a rota**; a capacidade ficou inalcançável e ninguém notou por dias
> (§356). O **§358** removeu `arquiteturaDeNegocio` e teve de tocar **16
> arquivos**. O **§355** descobriu que o dublê servia 1 de 5 operações, o que
> tornava 4 passos da jornada impossíveis de exercitar.

**O custo de uma integração nova é uma rodada inteira, e o modo de falhar é o
silêncio** — porque nada obriga as sete peças a existirem juntas.

### 0.3 O produto JÁ É um editor de grafos

Isto é o que torna o pedido viável em vez de utópico:

| Peça que já existe | O que faz |
|---|---|
| `Canvas.tsx` + React Flow | arrastar nós, ligar arestas, mover, salvar |
| `nodeTypes` / `edgeTypes` em `diagrama.json` | **vocabulário dirigido por configuração** |
| `edgeRules` | que conexão nasce ao ligar A em B |
| `validateConfig` | recusa vocabulário incoerente |
| `camposNo` / `camposAresta` | **campos por tipo, editáveis sem código** |
| `resolverDependencias` | ordenação topológica, com ciclos detectados |
| `mapaDoSistema` | uma vista de leitura da própria ferramenta |

> **A máquina de grafo existe e é boa.** Ela só nunca foi apontada para o
> encanamento da própria ferramenta — apenas para o desenho que o usuário faz.

### 0.4 E o dado JÁ flui entre agentes, só que implicitamente

`useEsteiraDeAgentes` carrega `acumuladas: Map<string, RespostaAnteriorIa[]>`: a
saída de um papel **já** entra no prompt do seguinte. Mas:

- a **ordem é a ordem do array** (`PAPEIS_PIPELINE`), não um grafo;
- não há aresta, então não há como ramificar, paralelizar ou pular;
- não há como **um passo que não é agente** (uma chamada HTTP) entrar no meio.

**O fluxo de dados existe. Falta poder desenhá-lo.**

---

## 1. O risco que decide o desenho: **dois grafos no mesmo produto**

A mesa de projeto desenha **a arquitetura que o time vai construir**. Este SPEC
propõe desenhar **o encanamento da ferramenta**. São dois grafos com significados
completamente diferentes.

> Se os dois compartilharem tela, paleta ou vocabulário, a pessoa perde a régua
> mais importante do produto: *"o que estou desenhando é o meu sistema ou a minha
> automação?"*

**Decisão: são telas separadas, com paletas separadas e persistência separada.**
O que se reusa é o **motor** (React Flow, o carregamento de vocabulário por
config, a ordenação topológica, a validação) — nunca a superfície.

Reusar o motor é o que torna a fatia A pequena. Reusar a tela é o que
destruiria o produto.

---

## 2. A divisão que o usuário pediu

Ele foi explícito: *"precisa ser dividido"*. São **três camadas**, e cada uma
resolve um problema diferente.

| Camada | Pergunta | Analogia |
|---|---|---|
| **I — Conector** | *o que sei falar com o mundo?* | o "node" do n8n, como **catálogo** |
| **II — Fluxo** | *em que ordem, e o que alimenta o quê?* | o canvas do n8n |
| **III — Gatilho** | *quando isso roda, e sobre o quê?* | o "trigger" do n8n |

A **I** é o que mata o gargalo da §0.2. A **II** é o que o usuário desenhou com o
exemplo do JMeter. A **III** é o que decide se isso vira automação ou continua
sendo botão.

---

## 3. Camada I — o CONECTOR como dado

### 3.1 O que muda

`operacao: OperacaoDoGateway` (lista fechada, 4 valores) **morre**. No lugar:

```ts
interface Conector {
  id: string;                    // "volumetria-do-projeto"
  nome: string;                  // "Volumetria (Dynatrace)"
  descricao?: string;
  /** Como chamar. Já existe hoje em `DestinoResolvido` — reusa inteiro. */
  endpoint: string;
  metodo: MetodoDoGateway;
  cabecalhos: Record<string, string>;
  envelope: string;
  /** O que MANDAR: de onde sai cada campo do corpo. */
  entrada: CampoDoConector[];
  /** O que VOLTA: como ler a resposta. */
  saida: CampoDoConector[];
}

interface CampoDoConector {
  chave: string;                 // "projetoId"
  rotulo: string;
  tipo: "texto" | "numero" | "lista" | "objeto";
  /** JSONPath-ish. Sem isto o produto não sabe LER o que voltou. */
  caminho?: string;              // "$.dados.rps"
  obrigatorio?: boolean;
}
```

### 3.2 Por que `entrada`/`saida` são o coração

**É o que permite a camada II.** Sem declarar o que sai de um conector, não há
como ligá-lo a outro nó — a aresta não teria o que carregar. É exatamente por
isso que hoje não dá para encaixar uma chamada HTTP no meio da esteira.

> É o mesmo raciocínio que `camposNo` já aplica ao diagrama: **a forma de um tipo
> é dado, não código.** Um conector é um "tipo de nó" do outro grafo.

### 3.3 O que isto elimina

Os sete lugares da §0.2 viram **um**: uma linha de configuração. Sem porta, sem
adaptador, sem rota, sem tela nova, sem endpoint de dublê, sem release.

E as quatro operações de hoje viram **conectores de fábrica** — `itens`,
`documento`, `adr`, `documentoExterno` nascem como registros semeados, não como
código. Migração trivial: cada `DestinoDoGateway` vira um `Conector` com a
`entrada`/`saida` que o adaptador correspondente já implementa hoje.

### 3.4 O que NÃO muda, e é deliberado

**O produto continua não implementando MCP, Jira ou Confluence.** Um conector é
um endereço HTTP com forma declarada; quem traduz continua sendo o gateway. Esta
SPEC **amplia** a fronteira do §348, não a move.

---

## 4. Camada II — o FLUXO como grafo

### 4.1 O modelo

```ts
interface Fluxo {
  id: string;
  nome: string;
  nos: NoDoFluxo[];
  arestas: ArestaDoFluxo[];
}

interface NoDoFluxo {
  id: string;
  tipo: "conector" | "agente" | "transformacao" | "saida";
  /** id do Conector (tipo "conector") ou do PapelConfigurado (tipo "agente"). */
  refId: string;
  posicao: { x: number; y: number };
  /** Valores fixos dos campos de entrada que não vêm de aresta. */
  parametros: Record<string, unknown>;
}

interface ArestaDoFluxo {
  de: string;                    // id do nó de origem
  para: string;                  // id do nó de destino
  /** DE qual campo de saída PARA qual campo de entrada. */
  mapeamento: { saida: string; entrada: string }[];
}
```

**`mapeamento` é o que faz isto ser um fluxo de dados e não um fluxograma.** Uma
aresta sem mapeamento é decoração; com ele, a resposta de um conector vira a
entrada de um agente.

### 4.2 O exemplo do usuário, ponta a ponta

> *"consultar dados de volumetria dos projetos, e conectar essa resposta ao
> agente que roda em seguida para ele criar jmx de testes jmeter"*

```
┌──────────────────────┐      ┌─────────────────────┐      ┌──────────────────┐
│ CONECTOR             │      │ AGENTE              │      │ CONECTOR         │
│ Volumetria           │─────▶│ Gerador de JMX      │─────▶│ Commit no repo   │
│ saida: rps, pico,    │ rps  │ entrada: volumetria,│ jmx  │ entrada: arquivo │
│        usuarios      │ pico │          desenho    │      │                  │
└──────────────────────┘      └─────────────────────┘      └──────────────────┘
                                        ▲
                                        │ nos, arestas
                              ┌─────────┴──────────┐
                              │ A MESA DE PROJETO  │
                              │ (o desenho aberto) │
                              └────────────────────┘
```

Três coisas que este desenho torna possíveis e hoje não são:

1. **Um passo que não é agente no meio da esteira** — a chamada de volumetria.
2. **A saída de um chamando o outro** — `rps` vira parâmetro do prompt.
3. **A mesa de projeto como FONTE**, não só como destino. É o *"imports com
   destinos mapeados, como para a própria mesa de projetos"* do pedido.

### 4.3 A mesa de projeto é um nó

Este é o ponto que o usuário levantou e que muda a arquitetura: **o desenho
aberto precisa ser endereçável dentro do fluxo**, nos dois sentidos.

| Direção | Nó | Exemplo |
|---|---|---|
| **fonte** | `mesa → saida: { nos, arestas, volumetria, necessidades }` | o agente do JMX lê o desenho |
| **destino** | `mesa ← entrada: { nos, arestas }` | o documento importado vira desenho (§356) |

> Isto **unifica o §356**: "ler documento por link → virar desenho" deixa de ser
> uma rota especial e vira `conector(documento) → agente(propor diagrama) →
> mesa`. Três nós de um fluxo semeado, em vez de código dedicado.

### 4.4 A ordenação já existe

`resolverDependencias` faz ordenação topológica com detecção de ciclo, e é
testado. **O executor do fluxo reusa a mesma função.** Um ciclo no fluxo é o
mesmo erro que um ciclo no desenho, e deve dar a mesma mensagem.

---

## 5. Camada III — o GATILHO

Sem isto, o fluxo é um botão com passos. Com isto, vira automação.

```ts
type Gatilho =
  | { tipo: "manual" }                                   // um botão, como hoje
  | { tipo: "evento"; quando: EventoDoProduto }          // "ao derivar", "ao salvar"
  | { tipo: "agendado"; cron: string };
```

**Recomendação: só `manual` na primeira fatia.** `evento` e `agendado` fazem o
produto passar a agir sozinho, e isso muda a natureza do que ele é — de
ferramenta para orquestrador. É decisão do usuário, não consequência técnica.

---

## 6. A tensão que esta SPEC precisa resolver: **determinismo**

A tese do produto é *"o mesmo desenho produz sempre os mesmos itens"*. Ela
sustentou a recusa de regra por time do nó (SPEC-101 §4) e de vocabulário de
conexão por time (SPEC-102 §5.3).

**Um fluxo livremente cabeado ameaça isso**: dois times com fluxos diferentes
produzem itens diferentes do mesmo desenho.

### 6.1 A resposta, e ela é a mesma da SPEC-102

**A derivação continua determinística e continua fora do fluxo.**

| O que | Onde roda | Determinístico? |
|---|---|---|
| `derivar()` — desenho → itens | motor, sempre | **sim, e não muda** |
| Esteira de agentes — itens → texto | fluxo | não, e nunca foi |
| Conectores — dados de fora | fluxo | não, e nunca foi |

O fluxo governa **o que é enriquecimento**, jamais **o que é derivação**. É a
mesma fronteira que já existe entre `derivar()` e a esteira — só que agora ela
fica **declarada** em vez de implícita na arquitetura.

> Se alguém um dia quiser que o fluxo altere a derivação, isso é outra SPEC, e
> começa por revogar a tese.

---

## 7. O que esta SPEC RECUSA

- **Um canvas só para os dois grafos** (§1). É a recusa mais importante.
- **Virar n8n.** Não haverá branch condicional, loop, retry-policy por nó, sub-fluxo
  nem versionamento de fluxo na primeira leva. Cada um é uma SPEC.
- **O fluxo mexer na derivação** (§6).
- **Implementar conectores específicos.** Jira, Confluence e Dynatrace continuam
  do outro lado do gateway. O produto ganha o **vocabulário** para descrevê-los.
- **Migrar as quatro operações antes de o grafo existir.** Elas viram conectores
  de fábrica quando houver onde plugá-los, não antes.
- **Executar fluxo no navegador.** Segredo de conector é da organização; um
  `cabecalhos` com token que chega ao browser vaza. **O executor é do servidor.**
- **Apagar a esteira atual antes de o fluxo cobrir o caso dela.** A esteira de
  quatro papéis vira um fluxo semeado — e só some quando o semeado provar que
  faz o mesmo.

---

## 8. Fatias

Ordenadas por **o que destrava o quê**, não por tamanho.

- **A — o Conector como dado.** `Conector` com `entrada`/`saida`, CRUD, e as
  quatro operações de hoje viram registros semeados. Sem grafo ainda: o que
  existe hoje passa a funcionar por configuração.
  **Prova:** um conector novo entra **sem tocar em código**, e as quatro
  integrações atuais continuam funcionando byte a byte.

- **B — o executor de um passo, no servidor.** Chamar um conector com parâmetros
  e ler a saída pelo `caminho`.
  **Prova:** `POST /conectores/:id/executar` devolve a saída mapeada; segredo
  nunca sai do servidor.

- **C — o grafo, sem execução.** Tela nova (paleta própria, §1), reusando React
  Flow e `resolverDependencias`. Desenhar, ligar, mapear campos, salvar.
  **Prova:** um fluxo com ciclo é recusado com a mesma mensagem do desenho.

- **D — a execução do fluxo.** Ordenação topológica, saída de um alimentando a
  entrada do outro, rastro por nó.
  **Prova:** o exemplo do JMeter (§4.2) roda ponta a ponta contra o dublê.

- **E — a mesa como nó** (§4.3), nas duas direções.
  **Prova:** o §356 vira um fluxo semeado e a rota dedicada morre — sem o E2E
  dele mudar.

- **F — a esteira vira fluxo.** Os quatro papéis nascem como fluxo semeado.
  **Prova:** o resultado é idêntico ao de hoje, item a item.

- **G — gatilhos** (§5), se o usuário quiser.

> **Corte:** **A+B** já pagam a SPEC sozinhas — matam o gargalo das sete peças
> sem nenhuma tela nova. **C+D** entregam o pedido visual. **E+F** são a
> unificação. **G** é outra conversa.

---

## 9. As decisões (§361)

> Estavam em aberto na primeira escrita. O usuário precisou deixar a
> implementação rodar sem acompanhar, e **pergunta aberta vira chute quando não
> há quem responda**. Decididas aqui, cada uma com o precedente que a sustenta —
> e todas revogáveis com evidência.

### 9.1 Quem pode editar, e quem pode EXECUTAR

**Três recursos, não um.** Editar e executar são poderes diferentes: um fluxo com
conector de escrita **age no mundo** — abre issue, escreve na wiki, comita
arquivo. Quem desenha não é necessariamente quem dispara.

| Recurso | O quê | Escopo |
|---|---|---|
| `conectores` | o catálogo: que endereços a organização sabe falar | organizacional, **curado** |
| `fluxos` | a fiação: em que ordem, alimentando o quê | do time |
| `fluxos.executar` | disparar um fluxo | do time, nível `operar` |

**Precedente:** `exigirEdicaoCurada` já inverte o owner-bypass para catálogos
(SPEC-28) — cadastrar conector é curadoria de catálogo, não trabalho do dia.
Desenhar fluxo é trabalho do dia, como criar quebra.

> **A separação `executar` é a que não pode faltar.** Sem ela, ver um fluxo é
> poder dispará-lo, e o produto ganha um botão que age no mundo sem portão
> próprio. É o defeito da §0.2 da SPEC-97 (escopo vindo do corpo) repetido numa
> superfície nova.

### 9.2 Escopo: conector é da organização, fluxo é do time

Direto da SPEC-102 §5.3: *"esta chamada não atravessa a rede"* é fato da
arquitetura. Aqui o análogo é *"a empresa fala com este endereço"* — fato da
infraestrutura, não preferência de time. Como as `stacks` (SPEC-43), que perderam
o vínculo por time na 0026.

O **fluxo**, não: dois times podem enriquecer de formas diferentes sem que isso
torne o desenho ambíguo, porque **fluxo não deriva** (§6).

### 9.3 Falha no meio: **para o ramo, preserva o resto, nunca substitui**

Três regras, e a terceira é a que importa:

1. **O nó que falha para**, e os que dependem dele não rodam.
2. **Os ramos independentes seguem** — a ordenação topológica já sabe quem
   depende de quem, e derrubar tudo perderia trabalho bom.
3. **Entrada ausente NUNCA vira default.** Se um agente esperava `rps` e o
   conector falhou, ele **não roda**. Substituir por vazio ou por um valor
   plausível é como a invenção entra — a mesma régua do §349 §6 (*"200 com
   conteúdo vazio é o mesmo que não achar"*), que o §356 provou com o §248.

**Precedente:** a SPEC-49 já respondeu falha parcial por item, e o publicador de
documento já estoura em vez de publicar pela metade. É a mesma disciplina, agora
por nó.

O rastro grava **por nó**: o que rodou, o que falhou e por quê. Sem isso, um
fluxo de sete nós que falha no terceiro é indiagnosticável.

### 9.4 `caminho`: subconjunto declarado, não JSONPath inteiro

Só `$.a.b[0]` — campo, aninhamento e índice. **Sem** wildcard, filtro ou
expressão.

**Por quê:** JSONPath completo é uma dependência nova e uma superfície de erro
grande; pior, é uma expressão que a pessoa **não consegue depurar na tela**. Uma
limitação visível é melhor que um poder que falha em silêncio. Cresce quando
doer, com o caso na mão — §242.

### 9.5 Versionamento: fora, mas o rastro guarda a impressão digital

Fluxo versionado fica para outra SPEC. **Mas cada execução grava o hash do fluxo
que rodou.**

Custa uma coluna e responde a pergunta que só aparece depois: *"este item saiu de
qual fiação?"*. Sem o hash, um fluxo editado torna todo rastro anterior ambíguo —
e ambiguidade de rastro é o que o §312 corrigiu no `atualizadoEm`.

### 9.6 Tela do catálogo: lista simples

Sem busca, sem categoria, com a contagem no título — o molde das abas que já
existem. Construir busca para três conectores é especulação; a aba diz quantos
são, e quando o número incomodar, ele terá aparecido com nome.

### 9.7 O que continua em aberto, e é do usuário

Nenhuma destas trava implementação:

1. **Gatilhos** (§5) — `evento` e `agendado` mudam a natureza do produto, de
   ferramenta para orquestrador. **Decisão de produto, não técnica.**
2. **O fluxo pode escrever na mesa sem confirmação?** A §4.3 propõe a mesa como
   destino. Hoje toda escrita vinda de fora passa por confirmação humana
   (*"importar não é aceitar"*). Manter isso é o default seguro; afrouxar é
   escolha.
3. **Conector com credencial** — hoje `cabecalhos` guarda token em
   `config_documentos`, em claro. A SPEC-54 já mandou credencial de IA para o
   cofre. Conector de escrita provavelmente merece o mesmo, e isso é **rodada
   própria**.

---

## 10. Perguntas que a implementação vai levantar

1. **Quem pode editar fluxo?** É poder de execução, não de configuração — um
   fluxo com conector de escrita age no mundo. Recomendação: recurso RBAC
   próprio, e a SPEC-97 §2 (piso organizacional) provavelmente se aplica.
   **Não medimos.**
2. **Fluxo é por time, por produto ou organizacional?** Pelo argumento da
   SPEC-102 §5.3, o **catálogo de conectores** é organizacional (é infraestrutura
   da empresa). O **fluxo** parece ser do time. Merece medição própria.
3. **O que acontece quando um conector falha no meio?** Parar, pular, seguir com
   o que tem? A SPEC-49 já respondeu para itens (falha parcial por item). Para
   fluxo, **não medimos**.
4. **`caminho` é JSONPath completo ou um subconjunto?** JSONPath inteiro é uma
   dependência e uma superfície de erro. Recomendação: subconjunto declarado
   (`$.a.b[0]`), e crescer quando doer.
5. **Fluxo versionado?** Um fluxo que muda depois de gerar itens torna o rastro
   ambíguo. Recomendação: fora da primeira leva, mas o `id` já nasce estável.
6. **Quantos conectores a organização terá?** Com 3, uma lista basta. Com 30, a
   tela precisa de busca e categoria. **Não medimos.**

---

## 11. Para quem implementar

**Leia antes:**
- `packages/aplicacao/src/config/normalizacao.ts` — `DestinoDoGateway`,
  `OPERACOES_DO_GATEWAY` (o gargalo) e `destinosDaOperacao`.
- `packages/server/src/adaptadores/gatewayDoTime.ts` — os quatro adaptadores que
  viram conectores de fábrica; cada um documenta o contrato que a `entrada`/
  `saida` do conector precisa expressar.
- `packages/engine/src/**/resolverDependencias` — a ordenação topológica que a
  fatia D reusa.
- `packages/web/src/canvas/Canvas.tsx` e `config/loadConfig.ts` — o motor de
  grafo e o carregamento de vocabulário por configuração.
- `packages/web/src/review/useEsteiraDeAgentes.ts` e `lotesDaEsteira.ts` — a
  esteira atual e o `acumuladas`, que é o fluxo de dados implícito da §0.4.
- `packages/aplicacao/src/sistema/mapaDoSistema.ts` — a vista de leitura da
  própria ferramenta; parente próximo desta tela.

**SPECs que decidem coisas que esta herda:**
- **SPEC-102 §5.3** — o que é organizacional e o que é do time, e por quê.
- **SPEC-101 §4** e **SPEC-102 §5.3** — o argumento do determinismo (§6).
- **§348** — a fronteira do gateway: o produto não implementa ferramenta de
  terceiro. Esta SPEC amplia, não move.
- **SPEC-97** — governança; a fatia A desta cruza com a §2 daquela.
- **§349/§356/§358** — a evidência de que o modelo atual custa uma rodada por
  integração, e falha em silêncio.

**Régua de aceite da SPEC inteira:** acrescentar uma integração nova passa a ser
**uma linha de configuração**, e não sete arquivos. Se ao final da fatia A ainda
for preciso escrever código para plugar um endereço novo, a fatia não terminou.
