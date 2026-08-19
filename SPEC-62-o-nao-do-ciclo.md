# SPEC-62 — O "não" do ciclo, e a entrada que pulava o Check

> **Origem:** *"na parte de sugestões não sei se é a massa ou o que, ali no ciclo
> pdca, mas só aparece direto para aprovar antes de conseguir ver o pdca (não
> gerei nenhuma nova), e se rejeito simplesmente some para sempre"*.

Reproduzido contra a stack real antes de escrever isto. Não é massa: **não
existe seed de solicitação nenhuma** neste produto. O que aparece foi criado
pelo próprio caminho de entrada do PDCA.

---

## 1. O pedido nasce no fim do ciclo

O balão da entrevista (`App.tsx`), para quem não é owner, faz isto quando a
pessoa digita e clica *"Pedir ajuste"*:

```ts
void apiPdca.criarAjuste({ descricao: texto, timeId: timeAtivo })
```

Sem `operacao`, sem `feedbackId`, e **sem gravar feedback nenhum**. O texto
entra direto como solicitação `pendente`. A tela do ciclo então diz, ao mesmo
tempo:

```
O que disseram (0 sem tratar) — Ninguém deixou feedback ainda.
Solicitações de ajuste (1 aguardando decisão) — [Aprovar] [Recusar]
```

> **O ciclo tem quatro tempos e a entrada pulava dois.** O que a pessoa diz é
> *Check*. Virar mudança é *Plan*. Decidir é *Act*. Escrever direto na fila de
> decisão é entregar o *Act* sem que o *Check* tenha existido.

### A régua

> **Tudo que uma pessoa DIZ entra pelo mesmo lugar: "O que disseram".**
> Solicitação não se escreve à mão — ela nasce de um feedback, no estúdio, com
> prévia do efeito.

Não é purismo de fluxo. É o que faz o pedido chegar a quem decide **com de onde
veio e o que vai acontecer** — que é a coisa inteira que a SPEC-45 construiu e
que este caminho contornava.

## 2. Quem decide decide no escuro

O card do pedido mostra `descricao`, `solicitante · recurso · estado`. Não
mostra:

- **quando** foi pedido. Um pedido de três semanas atrás é visualmente idêntico
  a um de hoje — foi por isso que a origem diz *"não gerei nenhuma nova"*;
- **de que feedback nasceu** (o dado existe: `pdca_feedback.solicitacao_id`);
- **o efeito**, que o estúdio calcula e mostra a quem PROPÕE e some para quem
  DECIDE — ou seja, exatamente ao contrário de quem precisa dele.

E pedido sem `operacao` oferece **"Aprovar"** prometendo o fechamento do ciclo,
enquanto `POST /ajustes/:id/aplicar` responde *"este pedido é só texto — abra a
configuração e edite à mão"*. O botão promete o *Act* e entrega um bilhete.

## 3. Os dois "não" são becos

| O "não" | O que acontece hoje | O problema |
|---|---|---|
| **Recusar** um pedido | vira `rejeitada` e fica na lista, com o mesmo estilo do pendente | nenhuma ação, nenhum motivo, e o servidor devolve `409` para qualquer nova decisão — nem pela API há volta |
| **Descartar** um feedback | vira `descartado` e vai para dentro do `<details>` fechado do histórico | **some da tela** (medido: `visível: false`) e não tem como voltar a "sem tratar" |

O produto já sabe fazer isto direito em todo o resto: a decisão substituída da
SPEC-57 **não se apaga** (`substituidaPor`), a exceção de padrão carrega
`motivo`, a necessidade órfã continua aparecendo (§57). O ciclo de melhoria é o
único lugar onde o "não" é mudo e definitivo.

> **Um "não" que não diz por quê e não pode ser revisto não é decisão: é
> descarte.** E descarte silencioso é o que ensina o time a parar de responder.

## 4. O placar mente quando o pedido é recusado

`viraramAjuste` conta feedbacks com estado `virou-ajuste` e o placar os anuncia
como *"viraram mudança na configuração"*. Um feedback cuja solicitação foi
**recusada** entra nessa conta. O placar do §276 nasceu para responder "o que
isto mudou"; contando recusa como mudança, ele responde errado.

## 5. O que muda

### 5.1 A entrada (`App.tsx`)

O balão grava **feedback**, não solicitação. O texto passa a dizer o caminho
real: *"o que você escrever entra no ciclo do time; quem configura transforma em
ajuste, vendo o efeito antes"*. O M15 (*"tem N feedbacks esperando"*) que já
existe passa a acender por este caminho — hoje ele nunca acendia por aqui,
porque nenhum feedback era criado.

**A promessa não encolhe.** Continuar dizendo "eu encaminho pra aprovação de
quem configura" continua verdade — muda a porta, não o destino.

### 5.2 O card de quem decide (`PdcaTab`)

Ganha, antes dos botões:

- **quando** e **de quem** (`criadoEm` no formato curto);
- **a origem**: o texto do feedback que gerou o pedido, ou a marca explícita de
  que ele veio como texto solto;
- **o efeito**: o mesmo diff da prévia do estúdio para operação de regras, e a
  descrição de `descreverOperacao` para pipeline e ficha. Pedido **sem
  operação** diz, em vez disso, que aprovar registra a decisão e a mudança é à
  mão — o botão para de prometer o que não faz.

### 5.3 O "não" com motivo e com volta

- `POST /ajustes/:id/decidir` aceita `motivo` quando `aprovar: false`. Coluna
  nova `motivo_da_decisao`;
- `POST /ajustes/:id/reconsiderar` devolve a `pendente` — só de `rejeitada` ou
  `invalida`, com o mesmo gate de permissão da decisão. **O motivo e quem
  recusou ficam gravados**: reconsiderar não apaga o "não" anterior, ele
  continua no card como história (mesma disciplina de `substituidaPor`);
- `POST /pdca/feedback/:id/reabrir` devolve o feedback a `novo`, e o histórico
  ganha o botão.

### 5.4 O placar honesto

"Virou mudança" passa a significar **solicitação `aplicada`**. As outras
aparecem pelo que são: esperando decisão, recusada, ou aprovada e ainda não
aplicada. Cada estado é uma pergunta diferente para uma pessoa diferente, e
somá-los era o que fazia o placar responder errado.

## 6. O que NÃO muda

- **`criarAjuste` continua aceitando pedido sem `feedbackId`.** A API é usada
  por outros caminhos e barrar ali quebraria o pedido de quem chega por
  deep-link sem permissão (SPEC-51). O que muda é quem a chama pelo balão;
- **`invalida` não vira reconsiderável por acaso.** Ela é reconsiderável de
  propósito: a configuração mudou, a pessoa reavalia sobre o estado novo — que
  é literalmente o que a mensagem de 409 manda fazer, e hoje não havia como;
- **o teto e o corte do histórico (§276) ficam.** O que faltava lá não era
  espaço: era o caminho de volta.

## 7. Ordem de implementação

1. **servidor** — coluna, motivo, `reconsiderar`, `reabrir`. É a base das duas
   telas e não quebra nada sozinha;
2. **o card de quem decide** — origem, data e efeito;
3. **a entrada** — o balão passa a gravar feedback. Por último porque é a que
   muda o comportamento observável de quem já usa.
