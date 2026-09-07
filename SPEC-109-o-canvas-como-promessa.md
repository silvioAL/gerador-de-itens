# SPEC-109 — O canvas como promessa: a volta da fábrica, o vocabulário genérico e as telas que sobram

## 1. De onde ela vem

A SPEC-107 completou as cinco mortes: exportar, publicar, importar, ensaios e
revisão viraram fiação. O usuário abriu o produto no dia seguinte e a promessa
não estava na tela ("acho que ainda está distante do correto em alguns
pontos"). As queixas, nas palavras dele:

1. "não consigo mover e arrastar os itens com a mesma fluidez";
2. "ainda existem itens no menu e telas como pipeline de IA";
3. "a maior parte dos componentes em fluxo de integrações parece não estar
   como nome genérico e configurável (ainda existe a tela de especificação da
   solução, a proposta é que também fosse substituída)";
4. "ainda existe a tela de 'como está montada', por vezes parece ter coisas
   repetidas";
5. "em como funciona não explica como usar";
6. "a massa que está por default em fluxos de integração parece ter coisas
   faltantes … só os agentes da esteira, e sem nenhum prompt";
7. "o vocabulário poderia ser de integração externa → agente → artefato".

## 2. As medições (o que o código e o banco REALMENTE dizem)

Cada queixa foi medida antes desta SPEC existir. Nenhuma é impressão.

### 2.1 A massa capenga é uma cópia congelada — e não tem volta

`config_documentos` (chave `fluxos`, time-silvio) guarda uma esteira declarada
salva em **2026-09-05** — antes da G5a: 4 nós agente, arestas `texto→po`, sem
nó de demanda, sem fila, sem grava. `fluxosEmVigor`
(`packages/aplicacao/src/config/fluxos.ts:395`) faz o declarado vencer a
fábrica no mesmo id — regra certa (SPEC-70 §4) — mas o único caminho que a
tela oferece é para DENTRO da cópia (`editar uma cópia`,
`FluxoScreen.tsx:659`); não existe "voltar à derivada". Um clique congela o
fluxo na forma daquele dia, para sempre, e a fábrica pode evoluir dez SPECs
que o time nunca vê.

O "sem nenhum prompt" é a segunda metade: `EditorDoPapel`
(`FluxoScreen.tsx:1198`) mostra o `preambulo` GRAVADO, que é vazio quando o
papel usa o default — o efetivo (`preambuloEfetivo`, que a aba Pipeline de IA
calcula) não aparece no nó. O campo vazio lê como "este agente não tem
prompt", que é falso.

### 2.2 O arrasto não é fluido porque o grafo é controlado sem devolução

`ReactFlow` no `FluxoScreen.tsx:709` recebe `nodes` de um `useMemo` sobre o
fluxo e NÃO tem `onNodesChange`: durante o arrasto nenhuma mudança de posição
é aplicada — o nó fica parado sob o mouse e teleporta no `onNodeDragStop`. A
mesa de projeto (Canvas.tsx) aplica as mudanças e por isso é fluida; a
diferença entre as duas superfícies é exatamente a que o usuário sentiu.
Fluxo de fábrica nem arrasta (`nodesDraggable={editavel}`, e `editavel` exige
`origem === "declarado"`).

### 2.3 O vocabulário fala por operação, não por família

A paleta lista um botão por operação do gateway ("+ Envio de itens",
"+ Publicação de documento", "+ Decisões registradas (ADR)", "+ Documento de
contexto") — instâncias, não componentes, apesar do §368 dizer o contrário. Os
rótulos de família (`vocabularioDoFluxo.ts:36`) dizem "Conector" e "Projeto"
onde o usuário pediu "Integração externa" e a mesa. O card do nó mostra a
FAMÍLIA grande e o nome pequeno; o nome que a pessoa cadastrou é o que
deveria mandar (regra da casa: o rótulo ecoa o nome cadastrado).

### 2.4 Duas telas contam a mesma história

`SistemaScreen` ("Como está montada", SPEC-59) nasceu quando não havia canvas
de fluxos: era A vista que reunia esteira, regras e PDCA. A SPEC-105/107
construiu a vista de verdade — executável — e a SistemaScreen virou a segunda
narração do mesmo encanamento, com dados que o canvas não tem (estado
ativo/desligado/falhou do papel, última execução, ligar/desligar, reordenar).
A aba "Pipeline de IA" tem o mesmo problema em menor grau: o `EditorDoPapel`
do nó grava no MESMO documento (§369) — a aba é a porta antiga da mesma
edição. A aba "Especificação de solução" edita o template do artefato que a
fiação publica, sem porta nenhuma no canvas.

### 2.5 "Como funciona" descreve, não ensina

`JourneyModal` aba "jornada" conta O QUE o produto é (a jornada, os
cenários, os tours) — não COMO usá-lo (cadastrar credencial, desenhar,
derivar, rodar a esteira, confirmar, exportar). A queixa é literal: "em como
funciona não explica como usar".

## 3. O que esta SPEC promete

O canvas de fluxos é A tela da ferramenta — como o n8n é a tela do n8n — e
tudo que narra ou edita o encanamento por fora dele morre ou vira porta dele.
O vocabulário do canvas é genérico e configurável: **integração externa →
agente → artefato**, com o nome cadastrado mandando no card. A massa default
volta a ser a da fábrica, viva, e nunca mais congela sem caminho de volta.

## 4. As fatias, na ordem

- **A — a volta da fábrica + arrasto fluido** (defeitos primeiro):
  1. Fluxo declarado que sombreia um id de fábrica ganha aviso + botão
     "voltar à derivada" (apaga a cópia; a fábrica volta a valer na hora).
  2. `onNodesChange`/`applyNodeChanges` com estado local no FluxoScreen;
     write-back no dragStop como hoje. Arrasto igual ao da mesa.
  3. `EditorDoPapel` mostra o preâmbulo EFETIVO (preview/placeholder) quando
     o gravado é vazio — "sem prompt" deixa de ser mentira visual.
  - Prova real: exercitar o "voltar à derivada" na esteira congelada do
    time-silvio contra a stack local; a esteira completa (demanda → papéis →
    grava) reaparece com as arestas de fila.
- **B — vocabulário genérico e configurável**: famílias renomeadas
  (Integração externa; a mesa), paleta colapsada por família (a operação se
  escolhe no painel do nó), card com o nome cadastrado em destaque.
- **C — morte da SistemaScreen e da aba Pipeline de IA**: menu perde "Como
  está montada"; `#/sistema` redireciona para `#/fluxo`; estado do papel,
  última execução, ligar/desligar e reordenar migram para o painel do nó
  agente. "Pipeline de IA" sai do menu; o deep-link avisa e aponta o canvas.
- **D — Especificação de solução como propriedade do artefato**: o template
  vira edição no painel do nó de publicação; a aba sai do menu; deep-link
  continua.
- **E — "Como funciona" ensina a usar**: a aba jornada vira manual de uso
  passo a passo apontando os tours.

Cada fatia fecha com o rito da casa: branch, quatro portões, E2E sozinho,
visual nos dois temas contra a stack real, JOURNEY, graphify, PR, CI, merge,
rebuild.

## 5. O que esta SPEC NÃO faz

- Integrações reais (Teams, Jira paginado, Postgres/Mongo) — SPEC-108.
- Merge por campo na quebra (corrida §250) — dívida declarada no §385.
- O RBAC do dono de exportador/tokens — dívida antiga, fora daqui.
