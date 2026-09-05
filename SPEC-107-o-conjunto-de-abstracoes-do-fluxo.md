# SPEC-107 — O conjunto de abstrações do fluxo: o que é nó, e o que viaja

> **Origem:** o usuário, revisando o plano do "nó documento" (SPEC-106 C):
>
> > *"mas documento seria realmente um nó? existe cenário onde existirá uma
> > integração e o retorno poderá ser um documento que o response passará para
> > um agente. precisamos planejar o set de itens que representa a abstração
> > correta para os fins que vamos trabalhar/possíveis"*

## 0. A medição: o cenário dele já funciona — sem nó documento

Conector de leitura (`Documento de contexto`) → `conteudo` → mapeamento →
agente. Roda hoje, ponta a ponta (E2E da SPEC-105 D). **O documento entrou no
fluxo como DADO, não como nó** — e é essa a observação que decide a SPEC.

## 1. A tese: nó é o que AGE; documento é o que VIAJA

| Conceito | O que é | Onde mora |
|---|---|---|
| **Nó** | uma capacidade que executa | `nos[]` |
| **Aresta + mapeamento** | o dado fluindo, campo a campo | `arestas[]` |
| **Documento** | uma FORMA de dado (texto/markdown + metadados) | payload — nunca nó |

"Nó documento" repetiria o erro que o §368 acabou de pagar: uma implementação
contextual específica onde cabia dado numa superfície genérica.

## 2. O conjunto proposto (fechado, cresce por decisão)

1. **`conector`** — o adaptador de I/O. Lê, escreve ou ambos; o CONTRATO
   (`entrada`/`saida`) diz qual. Já existe (SPEC-105 A). Componentes na
   paleta = operações + chamada externa (§368).
2. **`agente`** — transforma texto com IA (papel da esteira como adaptador).
   Já existe.
3. **`mesa`** *(a fatia E da 105 — "a própria mesa de projetos pode ser um
   componente", o usuário)* — a demanda como NÓ, nas duas direções da 105
   §4.3: **fonte** (`saida`: `desenho`, `itens`, `markdown`, `volumetria`,
   `necessidades`) e **destino** (`entrada`: `desenho` — o importado virando
   proposta, com a confirmação humana de sempre). É o que faltava para
   "publicar o documento" e "importar por link" virarem fiação.
4. **`transformacao`** *(reservado, sem executor ainda)* — pura, sem IA
   (extrair campo, concatenar). Entra quando houver executor que a honre
   (§346: tipo oferecido sem executor é meia-integração).
5. **`motor`** *(pedido do usuário: "um componente pode ser o próprio
   motor")* — o `derivar()` como componente: entrada `desenho`, saída
   `itens`/`avisos`/`conformidade`. Determinístico por natureza — mesmo
   desenho, mesmos itens, sempre.

### 2.1 O motor no fluxo × a tese do §6 — a decisão que só o usuário fecha

A SPEC-105 §6 sustentou: *"a derivação continua determinística e continua fora
do fluxo"* — porque dois times com fiações diferentes produzindo itens
diferentes DO MESMO desenho quebraria a régua do produto. Expor o motor como
componente é revisitar isso, e há dois desenhos honestos:

- **(a) O motor só aceita o desenho vindo do nó `demanda`** (preserva a tese):
  o fluxo decide QUANDO derivar e o que fazer com o resultado, nunca O QUE
  entra na derivação. Flexibilidade: encadear derivação → agente → publicação
  numa fiação só.
- **(b) O motor aceita qualquer `desenho` mapeado** (revoga a tese §6): um
  conector pode trazer um desenho de fora e derivá-lo — flexibilidade máxima,
  e o rastro com hash (§9.5) vira a ÚNICA âncora de reprodutibilidade.
  Requer reescrever a régua do produto em voz alta.

**Recomendação: (a) na primeira leva** — entrega o encadeamento sem pagar a
revogação; (b) fica a um passo, documentado, quando um caso real pedir.

**E o tipo de dado ganha um nome:** `"documento"` entra em
`TIPOS_DE_CAMPO_DO_CONECTOR` (texto com semântica de markdown + metadados
`titulo`/`link`/`atualizadoEm`). É o que permite, depois, validar
compatibilidade de mapeamento (saída `documento` → entrada `documento`) e
renderizar preview no rastro — sem nenhum nó novo.

## 2.2 A generalização pedida: **as engines como PEÇAS** (avaliação)

> *"vamos transformar as engines em 'peças', abertas a depender da
> governança, desenháveis no canvas com componentes visualmente iguais aos da
> mesa de projeto"* — o usuário.

**A avaliação: o modelo já comporta isso, e barato.** Um conector é "endereço
com forma declarada"; uma **peça** é "função do motor com forma declarada" — o
MESMO contrato (`entrada`/`saida` em `CampoDoConector`), trocando o transporte
(chamada em processo, não HTTP). O nó vira UMA coisa só: *capacidade com
contrato*, com quatro adaptadores — HTTP (conector), papel+LLM (agente),
função do engine (peça), demanda (fonte).

**As candidatas a peça já existem, puras e testadas:** `derivar` (a
derivação unificada no canvas), **`ensaio`** (`simularLentidao` +
`resiliencia`: entrada `desenho`+`cenario`, saída `leitura` — a bancada de
ensaios como peça, pedido explícito), `validateConfig`,
`resolverDependencias`, `conformidade`/`topologia`,
`gerarEspecificacaoEntrega`, `lerDesenho`. O
catálogo de peças nasce como os conectores de fábrica: **derivado de um
registro no código com o contrato como dado** — peça nova entra por decisão
(lista fechada, §242), nunca por acidente.

**Governança:** cada peça declara o recurso RBAC que a abre (`derivar` no
nível `operar`, como hoje; peças que tocam configuração, curadas) — a
máquina de `exigirPermissao`/curadoria já existe e vira atributo do registro.

**Visual igual à mesa:** paridade de LINGUAGEM, não de superfície. O
`NodeCard` da mesa já é dirigido por `DiagramaConfig`; o fluxo ganha um
`DiagramaConfig` PRÓPRIO gerado do catálogo (peças/conectores/agentes com
cores e ícones) e renderiza com o MESMO cartão. As telas continuam separadas
(a régua da 105 §1 fica); o que unifica é o vocabulário visual. Risco a
vigiar: os dois grafos ficarem indistinguíveis — mitigação: paleta de cores
própria e o cabeçalho dizendo o que se desenha.

## 3. O que esta SPEC RECUSA

- **Nó `documento`** — a SPEC-106 C fica emendada: o que era "documento como
  nó" vira `demanda` (fonte) + o tipo de dado `documento`.
- **Tipos de nó por caso de uso** ("nó JMX", "nó Confluence") — caso de uso é
  fiação + adaptador, nunca tipo.
- **Executor de `transformacao` antes do caso real** (§242).

## 4. Fatias

- **A — o registro de PEÇAS + as duas primeiras** (`derivar`, `ensaio`):
  contrato como dado, governança como atributo, executor em processo.
  Prova: `mesa.desenho → derivar → agente → publicação` e
  `mesa.desenho → ensaio → agente` rodam ponta a ponta.
- **B — o nó `mesa`** (fonte primeiro; destino com confirmação depois).
- **C — a UX da mesa no fluxo**: `NodeCard` + `DiagramaConfig` próprio gerado
  do catálogo — *"a UX deve ser incrível como a da mesa"* é critério de
  aceite, não enfeite: cartões, cores por família (peça/conector/agente/mesa),
  ícones e o mesmo cuidado de tema.
- **D — o tipo de dado `documento`** no contrato e preview no rastro.
- **E — validação de compatibilidade de mapeamento** por tipo (aviso primeiro).

## 5. Perguntas para o usuário

1. O nó `demanda` aponta a demanda ATIVA ou recebe `demandaId` como parâmetro?
   (Recomendação: ativa na primeira leva — é onde a jornada está.)
2. `transformacao` espera caso real, certo?
3. O conjunto acima cobre "os fins possíveis" que você enxerga, ou falta uma
   capacidade (ex.: espera/aprovação humana como nó — hoje coberta por
   `pausarDepois`)?
4. **Motor no fluxo: (a) ou (b) da §2.1?** É a decisão que define se a tese do
   §6 fica ou é reescrita.
