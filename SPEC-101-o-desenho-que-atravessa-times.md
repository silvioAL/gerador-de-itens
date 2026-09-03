# SPEC-101 — O desenho que atravessa times

> **Origem:** o usuário, depois de fechar as cinco frentes do §346–350:
>
> > *"é comum que um desenho envolva vários times. Acho que o sistema ainda atrela
> > muitas coisas: uma solução que vem via documento pode compreender o desenho de
> > escopo que será trabalhado em múltiplos times. Precisamos fazer uma avaliação
> > de como lidar com isso."*
>
> E a liberdade que muda o tamanho da resposta:
>
> > *"nós ainda não estamos rodando esse produto em produção, temos liberdade de
> > ajustar modelo."*

---

## 0. A medição: onde o time está preso no modelo

Varredura em `packages/server/src/db/schema.ts`:

| Tabela | Como o time entra | Cardinalidade |
|---|---|---|
| **`quebras`** | `time: text("time")` | **um só** ← o problema |
| `usuario_time` | `(email, timeId, nivel)` | N:N ✅ |
| **`produto_time`** | `(produtoId, timeId)` | **N:N ✅** |
| `config_documentos` | `timeId` com default `__global__` | um, com herança |
| `campos_no` / `campos_aresta` | idem | um, com herança |
| `solicitacoes_ajuste`, `pdca_feedback` | `timeId` nullable (null = organização) | um ou nenhum |
| `usuario_papel.escopoTimeId`, `time_papel` | escopo do RBAC | um |
| `stacks` | `organizacao_id`, **sem time** | organizacional (SPEC-43) |

### 0.1 O achado que orienta a solução

**O produto já atravessa times** — `produto_time` é N:N, e a SPEC-53 justificou:
*"produto não é do time; um time atende vários, um produto atravessa times"*.

**A quebra não.** `quebras.time` é uma coluna de texto, singular, nullable.

> É a mesma falha de abstração que a SPEC-42 já desfez uma vez, entre **time** e
> **stack**: o modelo fundia a identidade organizacional com uma escolha que não
> é dela. Aqui ela sobrevive num lugar diferente — **o desenho**.

### 0.2 E há um segundo eixo, que é o que dói de verdade

Tornar `quebras.time` uma lista resolveria *quem vê*. **Não resolve o que o
usuário descreveu**, porque um desenho multi-time não é um desenho que vários
times **olham** — é um desenho cujas **partes pertencem a times diferentes**.

O serviço de pagamentos é do time A; a fila que ele publica é do time B; a tela
que consome é do time C. Hoje o produto sabe **de quem é a quebra** e não sabe
**de quem é cada pedaço** — e é o pedaço que vira item de trabalho, entra num
backlog e tem dono.

---

## 1. As três perguntas que precisam de resposta separada

Misturá-las é o que faz "suporte a multi-time" parecer uma coisa só e virar três
meses de trabalho.

| # | Pergunta | Onde ela morde |
|---|---|---|
| **1** | **Quem enxerga e edita** este desenho? | RBAC, listagem, `?timeId=` |
| **2** | **De quem é cada parte** do desenho? | derivação, itens, exportação |
| **3** | **Qual configuração vale** para cada parte? | padrões por componente, regras, checklists |

A **2** é a que o usuário descreveu, e é a de maior valor. A **1** é pré-requisito
barato. A **3** é a mais difícil, e a §4 argumenta que **provavelmente não deve
ser resolvida**.

---

## 2. Pergunta 1 — quem enxerga: de coluna para lista

`quebras.time` vira uma relação `quebra_time`, no mesmo molde de `produto_time` —
que já existe, já funciona, e já tem tela.

**O que isso destrava:** a demanda aparece para os três times, todos editam, e o
`GET /quebras` deixa de filtrar por igualdade de string.

**O que precisa de cuidado:**

- **Um time é o dono.** Sem isso, ninguém responde pela demanda e a lista de
  "minhas demandas" vira a lista de todas. `quebra_time` carrega `papel: dono |
  participante`.
- **O RBAC hoje resolve permissão com um `timeId`.** Com vários, a pergunta *"esta
  pessoa pode operar aqui?"* passa a ser *"em algum dos times da quebra"* — e é
  uma mudança em `exigirPermissao`, não na tela.
- **Migração é trivial** porque não há produção: cada `quebras.time` vira uma
  linha com `papel: dono`.

---

## 3. Pergunta 2 — de quem é cada parte: **o eixo que importa**

É o que o usuário descreveu, e o que o produto não sabe.

### 3.1 O time vai no NÓ, não na quebra

Um `No` ganha `timeId?`. Ausente = o time dono da quebra — assim um desenho de um
time só continua igual, sem campo novo para preencher.

**A consequência é a que dá valor a tudo:**

| Hoje | Com o time no nó |
|---|---|
| a derivação produz itens de uma quebra | **produz itens COM dono** |
| a exportação manda tudo para um destino | **manda a parte de cada time para o destino dele** |
| o documento é do time | **o documento diz o que cada time precisa fazer** |

> E a conexão entre dois nós de times diferentes deixa de ser uma aresta comum:
> **é um contrato entre times**, e é o item de trabalho mais caro de qualquer
> entrega. O produto passa a poder apontá-lo — hoje ele não tem como saber que
> aquela seta atravessa uma fronteira organizacional.

### 3.2 Isso não é campo novo: é o que a `Atividade` já quase tem

`derivar()` já carrega `origem.nodeId` em cada item. Se o nó tem time, **o item
herda o dono sem nenhuma inferência** — a informação viaja pelo caminho que já
existe.

### 3.3 O que fica possível, e hoje não é

- **Exportar para dois trackers na mesma derivação** — a SPEC-81 já permite vários
  destinos por operação, e faltava justamente **saber qual item vai para qual**.
- **Contar o trabalho por time** dentro da mesma demanda.
- **Marcar a dependência entre times** — `resolverDependencias` já ordena; com
  dono, ela passa a dizer *"o time B só começa depois do time A"*, que é a
  informação que atrasa entrega de verdade.

---

## 4. Pergunta 3 — qual configuração vale: **cuidado aqui**

Se o nó do time B está numa quebra do time A, **as regras de qual time cobram
aquele nó?**

Parece natural responder *"as do time dono do nó"*. **É a resposta mais perigosa
desta SPEC**, e vale dizer por quê:

- A configuração já tem herança `time → global`, e sobrepor por nó criaria uma
  **terceira** camada de resolução, atravessada com as outras duas.
- O mesmo desenho passaria a produzir itens diferentes conforme o time do nó — e
  **o determinismo é a tese do produto** (*"o mesmo desenho produz sempre os
  mesmos itens"*). Não quebraria a letra (o desenho inclui o time), mas quebraria
  a leitura que a página vende.
- E a régua de contexto já existe e é mais fina: `contextos` casa por
  **tecnologia e contexto**, não por dono.

> **Recomendação: não resolver a 3 nesta rodada.** A configuração continua a do
> time dono da **quebra**, e o time do **nó** serve para *roteamento e
> responsabilidade*, não para escolher régua. Se aparecer o caso real — *"o time
> B exige DLQ e o A não"* —, ele volta como pedido, com evidência.
>
> É a mesma disciplina do §242: não inventar mecanismo antes de o problema
> aparecer com nome.

---

## 5. O que esta SPEC RECUSA

- **Resolver as três perguntas juntas.** É o que faz "multi-time" virar projeto.
- **Regra por time do nó** (§4).
- **Deixar a quebra sem dono.** Vários responsáveis é nenhum responsável.
- **Time obrigatório no nó.** Ausente herda o dono; um desenho de um time só não
  ganha trabalho novo.
- **Inferir o time pelo nome do componente** (`srv-pagamentos` → time de
  pagamentos). Parece esperto e erra em silêncio.
- **Migração cerimoniosa.** Não há produção; cada `quebras.time` vira uma linha e
  o assunto acaba.

---

## 6. Fatias

- **A — `quebra_time`, no molde de `produto_time`.** Com `papel: dono |
  participante`. **Prova:** a demanda aparece para os participantes; o dono é
  único; e o `GET /quebras` deixa de filtrar por string.
- **B — o RBAC entende vários times.** *"Pode operar em algum dos times da
  quebra."* **Prova:** participante opera; quem não é de nenhum leva 403.
- **C — `No.timeId`, opcional.** **Prova:** ausente herda o dono; o desenho de um
  time só não muda em nada.
- **D — o item herda o dono do nó.** **Prova:** `derivar()` devolve itens com
  time; a chave continua estável.
- **E — a conexão entre times aparece marcada.** **Prova:** aresta entre nós de
  times diferentes vira apontamento próprio, com os dois lados nomeados.
- **F — exportar cada parte para o destino do seu time.** **Prova:** dois
  destinos, dois conjuntos de itens, falha por item preservada.

> **Corte:** **A+B** (quem vê), **C+D** (de quem é), **E+F** (o que isso destrava).
> A e B sozinhas já resolvem o incômodo mais visível; C e D são onde está o valor.

---

## 7. Perguntas em aberto

1. **A demanda multi-time nasce de um documento** (SPEC-100 §4). Quando o
   documento importado descreve escopo de três times, **quem decide o recorte?**
   Recomendação: a pessoa, com a IA propondo — é julgamento, e julgamento não se
   delega (SPEC-80 §2).
2. **Um item pode ter dois donos?** Um contrato entre A e B é trabalho dos dois.
   Recomendação: **um dono e um interessado**, porque backlog não tem dois donos —
   mas a dependência fica registrada (§3.3).
3. **O que acontece quando um time sai da quebra?** Os itens dele já exportados
   continuam lá fora. Recomendação: sair não apaga rastro; o vínculo fica
   `encerrado`, com data.
4. **A volumetria é do produto ou da parte?** O volume entra uma vez e o motor
   distribui (SPEC-70). Com times diferentes, a régua de saturação é de quem?
   **Não medimos**, e é o tipo de pergunta que só aparece com uso real.

---

## 8. Para quem implementar

- `packages/server/src/db/schema.ts` — `quebras.time`, `produto_time` (o molde), e
  as tabelas com `timeId + __global__`.
- `packages/server/src/auth/permissoes.ts` — `exigirPermissao` e o escopo por
  time; a fatia B mexe aqui.
- `packages/engine/src/model/types.ts` — `No`, e onde `timeId` entra.
- `packages/engine/src/derive/derivar.ts` — `origem.nodeId`, por onde o dono
  viaja até o item sem inferência.
- `packages/aplicacao/src/config/normalizacao.ts` — `destinosDaOperacao`, que já
  devolve **lista**: a fatia F depende disso e ele já está pronto.
- `SPEC-42` e `SPEC-53` — as duas vezes em que uma falha de abstração parecida foi
  desfeita (time × stack, produto × time).
- `SPEC-100 §4` — a jornada que traz o documento de fora, e de onde a demanda
  multi-time costuma nascer.
