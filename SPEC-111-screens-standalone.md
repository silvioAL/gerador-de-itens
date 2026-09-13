# SPEC-111 — Screens standalone e o caminho de app builder assistido

> **Status: DETALHADA na §6, com a SPEC-110 inteira (A–L) na main.** As
> decisões finas foram tomadas com as lições daquelas fatias na mão, como esta
> SPEC mandava — e a principal delas é que o standalone praticamente já existe:
> a medição contra o código mostrou que ele não precisa de motor, de rota nem
> de tabela. Ver §6. Registrada a pedido do usuário, e
> REVISADA por ele: *"eu acredito que deveria sim funcionar como appbuilder
> low code/no code, e que deveria funcionar com apoio do assistente"* — a
> fronteira antiga ("não é um app builder") caiu; virou o norte, por
> etapas.

## 1. De onde ela vem

A SPEC-110 decide (D14/fatia H) que screens moram na galeria e RODAM dentro
de fluxos (o stage da fatia B). Esta SPEC responde as duas perguntas
seguintes: a screen que vale sozinha (sem fiar um fluxo para usá-la), e até
onde a criação de screens vai — resposta do usuário: até **app builder**,
com o assistente ajudando a construir.

## 2. A promessa

1. **Standalone**: uma screen declarada pode ser aberta e usada direto da
   galeria e por **link mandável** (ex.: `#/tela/s/<id>` — toda porta é
   URL). Quem abre vê os blocos, preenche, e o acionador (bloco `acao`,
   110-D17) entrega a saída ao destino configurado.
2. **App builder, por etapas**: o conjunto de blocos da 110-C é o CHÃO, não
   o teto. A evolução declarada: mais blocos (tabela/lista de dados,
   imagem, seções), encadeamento tela→tela sem canvas (a aresta implícita),
   e — quando o uso pedir — layout além da pilha. Cada degrau entra por
   medição de uso, nunca por especulação.
3. **Com apoio do assistente**: criar e editar screens (e fluxos) por
   CONVERSA — *"faz uma tela de aprovação de despesa com valor, motivo e
   botão de aprovar"* → o assistente propõe a `TelaDeclarada` (e a fiação,
   se pedida) como PROPOSTA aplicável, no molde do que a casa já faz (o
   assistente ✦ propõe diagramas na mesa; `SugerirComIa` propõe papéis):
   **nada é aplicado sozinho** — a pessoa vê, ajusta e aceita. O preview do
   editor (110-C) é onde a proposta aparece viva.

## 3. O desenho provável (validar contra a 110 implementada)

- **Standalone = fluxo implícito de um nó.** Rodar a screen cria uma
  execução cujo plano é só o nó de tela — reusando TUDO da 110-B
  (`aguardando-tela`, renderizador, continuar/retornar, histórico).
  Nenhum motor novo. Se a 110-B mudar esse contrato, esta SPEC muda junto.
- **O destino da saída é da screen**: `aoAvancar` na `TelaDeclarada`
  apontando um componente de efeito (os mesmos do canvas: `pdca-feedback`,
  `config-propor-ajuste`, um conector do catálogo…) — **ou "disparar um
  fluxo"** (110 D1: o gatilho `screen`): a screen vira a porta de entrada
  do fluxo, com a saída dela como dado inicial. São as duas pontas do
  mesmo fio — o fluxo declara "começo por screen" (o gatilho no canvas), e
  a screen declara "ao avançar, disparo o fluxo X". Sem destino, o
  Avançar grava só o histórico — e a tela DIZ isso, não finge entrega.
- **O assistente-construtor** reusa a infraestrutura existente de proposta
  (conversa → JSON estruturado → prévia → aplicar): a saída é o documento
  `TelaDeclarada`/`Fluxo` validado pela MESMA validação de escrita
  (SPEC-35) antes de qualquer prévia — proposta que não valida volta ao
  assistente com o erro nomeado, não à pessoa. Dublê determinístico do
  gateway falso cobre os E2E, como sempre.
- **O caso de estreia é o PDCA**: a screen de feedback (exemplo vivo da
  110-C/F) aberta por link mandável, sem fluxo.
- **Permissão**: quem pode ABRIR uma screen standalone é decisão desta SPEC
  (por time? por papel? link público NÃO — sessão continua obrigatória),
  tomada com o RBAC real na mesa.

## 4. Fronteiras (revisadas)

- ~~"Não é um app builder"~~ — **caiu por decisão do usuário**; é o norte,
  atingido por degraus medidos (§2.2). O primeiro degrau continua sendo os
  blocos da 110-C.
- Não fura as invariantes: efeitos passam pelos componentes nomeados
  (110 D11/D13) — screen standalone e proposta do assistente não ganham
  poderes que o fluxo não tem; aplicar proposta passa pela validação de
  escrita SEMPRE.
- Sem link público/anônimo nesta SPEC.
- O assistente PROPÕE, a pessoa aplica — a régua de toda IA da casa (§5.5,
  SPEC-39) vale aqui sem exceção.

## 5. Quando

Depois da SPEC-110 fatias B, C e H mergeadas — o standalone e o
assistente-construtor podem vir em fatias separadas (o standalone é menor;
o assistente-construtor pede medição da infra de proposta da conversa
antes de detalhar). Configurações nas devidas bases e apresentação no
"Como usar" seguem as regras D18/D19 da 110.

## 6. O detalhamento (feito com a SPEC-110 A–L na main)

### 6.1 A medição que mudou o tamanho da fatia

Antes de desenhar, medi contra a main `8ffe8e7`:

| Peça de que o standalone precisa | Onde já está |
|---|---|
| `TelaDeclarada` com `texto`/`dado`/`campo`/`acao` | `aplicacao/src/config/telas.ts` (110-C) |
| Renderizador de blocos + trava do obrigatório | `web/src/fluxo/RenderizadorDaTela.tsx` |
| Execução que PARA numa tela e sobrevive a F5 | `aguardando-tela` (110-B) |
| Avançar / Retornar, com a saída da tela | `POST /fluxos/execucoes/:id/continuar` e `.../retornar` |
| Endereço mandável da tela em curso | `#/tela/<execucaoId>` |
| Recorte por time e cadeado na porta | §402 |
| Card da tela, com ícone e nome | galeria (110-H) |

**Conclusão: o standalone não precisa de motor, nem de rota, nem de tabela.**
O que falta é um FLUXO — e ele pode ser derivado, como a esteira e a jornada
já são.

### 6.2 D1 — o fluxo implícito de um nó, DERIVADO

Cada tela declarada deriva um fluxo de um nó só (`tela-standalone:<id>`),
`origem: "fabrica"`, marcado `implicito: true`. Abrir a tela sozinha é
EXECUTAR esse fluxo pelo endpoint que já existe: ele para na tela no primeiro
nó, e daí em diante é a mecânica da 110-B inteira, sem nada novo.

Três consequências que valem por si:

- **a permissão vem de graça e é a certa**: `POST /fluxos/:id/executar` já exige
  nível `operar` no time (`exigirNivel`), e o stage já tem o cadeado na porta
  (§402). Abrir uma tela é criar execução — é operar;
- **o histórico vem de graça**: cada abertura é uma linha em `fluxo_execucoes`,
  com quem abriu e quando, recortada por time;
- **o link mandável vem de graça**: `#/tela/<execucaoId>` continua sendo o
  endereço da execução em curso. Quem manda o link manda a SESSÃO de trabalho,
  não a tela em branco.

O implícito **não aparece na seção de fluxos da galeria**: o card da tela já
está lá, e mostrar os dois seria a mesma coisa duas vezes — a queixa M9 da
SPEC-110, repetida noutro lugar.

### 6.3 D2 — o gesto e o endereço

O card da tela na galeria ganha **"abrir →"** ao lado de editar (hoje o card
inteiro leva ao editor). O endereço de abrir é `#/tela/s/<telaId>`: ele CRIA a
execução e redireciona para `#/tela/<execucaoId>`. Dois endereços porque são
duas coisas — "abra uma nova" e "continue esta".

### 6.4 D3 — permissão (a pergunta que a §3 deixou aberta)

**Sessão obrigatória, e a pessoa tem de pertencer ao time da tela.** Herdado do
`exigirNivel` do executar e do `exigirTime` do stage, sem regra nova. Link
público continua fora (§4), e afrouxar aqui reabriria exatamente o vazamento
que a §402 acabou de fechar.

### 6.5 D4 — v1 sem destino: o Avançar grava, e a tela DIZ isso

A §3 prevê `aoAvancar` apontando um componente de efeito ou disparando um
fluxo. Isso é a fatia B desta SPEC. Na fatia A, avançar **registra a resposta no
histórico da execução** — e a tela avisa antes, com todas as letras, que é só
isso que vai acontecer. É o que a própria §3 manda: *"Sem destino, o Avançar
grava só o histórico — e a tela DIZ isso, não finge entrega."*

### 6.6 As fatias

- **A — standalone** (esta): o fluxo implícito, o gesto na galeria, o endereço,
  o aviso de "sem destino". D18/D19 como sempre.
- **B — o destino do Avançar** (`aoAvancar`): componente de efeito ou o gatilho
  `screen` da 110-D1. Pede o par screen→fluxo desenhado com cuidado.
- **C — o assistente-construtor**: pede MEDIR a infra de proposta da conversa
  (o ✦ da mesa, o `SugerirComIa`) antes de detalhar — como a §5 já dizia.
