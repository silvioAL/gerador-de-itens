# SPEC-56 — Como a mesa de projeto evolui (o SimArch como espelho)

> **Status: avaliação, não decisão de construir.** Nenhuma linha de produção
> muda por causa deste documento.
>
> **Revisão de 14/08/2026 (§223 → §224).** A primeira versão respondeu a
> pergunta errada — gastou o documento decidindo "copiar ou não copiar o motor
> de simulação", quando o pedido era **como a mesa de projeto evolui**.
> Reescrita: o SimArch entra como espelho, não como catálogo de peças. O
> usuário também já cravou a premissa que a v1 levou páginas pra chegar —
> *"praticamente tudo pode ser feito com cálculo aritmético"* — e é dela que
> este texto parte, não para ela.

Pedido, na segunda passada: *"faltou um pouco de abstração (…) a ideia seria
evoluir a mesa de projeto de forma geral (…) apenas não temos englobado algumas
dessas questões"*, seguido da lista de funcionalidades do SimArch.

---

## 1. A tese

**Hoje a mesa de projeto modela COMPONENTES. O que falta é o PERCURSO e o
NÚMERO.**

O modelo é `Diagrama { nodes, edges }` (`engine/src/model/types.ts`). Um `No`
tem tipo, campos e proveniência; uma `Aresta` liga dois nós e também pode ter
campos. É um **grafo de coisas**, e é ótimo naquilo: derivar itens por nó e por
conexão funciona, e é o produto.

Mas quase tudo na lista que você mandou não é sobre coisas — é sobre
**caminhos** e sobre **grandezas que andam por eles**. Um trigger é o começo de
um caminho. Um fallback é uma bifurcação de um caminho. Latência, volume e
custo são grandezas que se acumulam ao longo de um caminho. Cenário é trocar as
grandezas na entrada do caminho. A vs B é rodar o mesmo caminho em dois
desenhos. Conflito arquitetural é uma regra sobre a forma do caminho.

Por isso a lista parece um monte de features soltas e não é: são **duas
primitivas ausentes e seis consequências delas**.

E é também por isso que sua intuição está certa: com as duas primitivas no
lugar, tudo o mais é **aritmética sobre o diagrama** — função pura de
`(diagrama, config, contexto)`, exatamente a família do `derivar()`. Não é uma
segunda epistemologia entrando no produto; é a mesma, com um tipo de saída a
mais.

---

## 2. O mapa: as 12 funcionalidades → 8 primitivas

| Funcionalidade do SimArch | Primitiva por trás | Temos hoje? |
|---|---|---|
| Diagrama com componentes cloud (AWS/Azure/GCP/Oracle) | **P7** dialeto de provedor | Parcial — temos techs e stacks, sem eixo de provedor |
| Triggers (user traffic, scheduler, webhook, evento, erro) | **P1** percurso (a origem dele) | **Não** — `job` é tipo de nó, mas não há "o que dispara este fluxo" |
| Fluxos — passos com fallback e injeção de falha | **P1** percurso | **Não** — arestas são pares, não caminho ordenado |
| Requisitos e rastreabilidade, gap analysis | **P3** para quê | **Não** |
| ADRs | **P4** por quê | **Não** — geramos o *o quê*, nunca o *porquê* |
| FinOps — custo/hora/mês, consolidado | **P2** número com unidade | **Não** — `number` existe como entrada, nada soma |
| Engine de eventos discretos (CB, timeout, retry, bulkhead, fila) | **P2** + **P1** | Existe como *checklist*, não como valor |
| Controles (duração, taxa, ramp-up, falha) | **P5** modo de operação | **Não** |
| Cenários prontos (Normal, Pico, Black Friday, Falha regional) | **P5** modo de operação | **Não** — nossos "cenários" são diagramas de exemplo, homônimo |
| Comparação A vs B, outra nuvem | **P6** variante | **Não** |
| Painéis retráteis (esq / dir / inferior) | interface | Parcial — esquerdo e direito sim, inferior não |
| Validação de conflitos arquiteturais | **P8** regra sobre a topologia | **Não** — nossos conflitos são do grafo de *atividades*, não do desenho |

Oito primitivas. Duas são fundação (P1, P2); quatro só existem em cima delas
(P5, P6, P8 e o FinOps); duas são ortogonais e baratas (P3, P4); uma é config
(P7).

---

## 3. P1 — O percurso

**O que é:** um caminho nomeado, com **origem** (o que dispara), **passos
ordenados** e **alternativa** (para onde vai se o passo falhar). No SimArch:
`FlowDefinition { Steps: [{ from, to, onFailure }] }`.

**O que temos:** `Aresta { source, target, type, spec }`. Dá pra reconstruir
caminhos percorrendo o grafo, mas ninguém declara *qual* caminho importa, nem
qual é o começo, nem qual ramo é o plano B. Um `fallback` hoje é uma aresta
igual às outras.

**Por que é a primeira:** sem percurso não existe "ao longo de" — e sem "ao
longo de" não há soma de latência, propagação de volume, custo de jornada, nem
regra do tipo "todo caminho que chega no banco passa por cache". P1 é o eixo em
que P2 vira útil.

**O que muda na derivação, que é o que interessa:** hoje derivamos por nó.
Com percurso, derivamos também **por jornada**: "o fluxo de checkout não tem
alternativa para a falha do serviço de pagamento" é um item de backlog real,
que hoje ninguém gera porque ninguém sabe que existe um fluxo de checkout.

**Cuidado nosso:** percurso não pode virar um desenho paralelo ao diagrama.
Ele tem que ser **seleção sobre as arestas que já existem** — senão viram duas
verdades divergentes, que é o erro que a SPEC-31 pagou caro pra matar.

---

## 4. P2 — O número com unidade (e a aritmética que ele libera)

**Achado medido:** `TipoCampo` já inclui `"number"`
(`engine/src/config/types.ts`), e **nenhum cálculo no engine consome esse
número como número**. Ele é preenchido, validado e renderizado; nunca somado,
nunca comparado. Hoje um `number` é um texto que só aceita dígitos.

**O que falta:** unidade (`ms`, `req/s`, `R$/mês`, `%`, `MB`) e a regra de
composição — se soma ao longo do caminho, se é máximo, se é média ponderada
pelo volume.

**É aqui que a sua premissa se paga.** Com P1 + P2, sem `Random` nenhum e sem
motor nenhum, o engine passa a poder afirmar:

| Cálculo | Como | O item que ele gera |
|---|---|---|
| **Orçamento de latência** | soma dos `timeout` ao longo do caminho, com retries multiplicando, contra o SLA declarado na origem | *"o pior caso do checkout é 2,7s e o SLA da entrada é 1s — reduzir retry do gateway para 1 ou baixar o timeout de pagamento para 250ms"* |
| **Propagação de volume** | taxa na origem × fan-out de cada passo | *"a fila recebe 3× o volume da entrada: dimensionar partições e definir política de DLQ"* |
| **Custo consolidado (FinOps)** | soma do custo por nó, e por caminho | *"o caminho de fallback custa 4× o principal — decidir se ele é permanente ou emergencial"* |
| **Restrição paramétrica** | `p95 < 200ms` declarado, avaliado contra o cálculo acima | critério de aceite em Gherkin **com o número dentro**, e rastreável |
| **Conflito aritmético** | o clássico: retry 3× sob um timeout de chamador menor que 3× o timeout do chamado | *"o retry nunca completa: o chamador desiste antes da segunda tentativa"* |

Repare no padrão: **cada cálculo termina num item de backlog**, não num
gráfico. É essa a diferença entre o que o SimArch faz com número (relatório de
decisão) e o que nós faríamos (trabalho a fazer). E é o que mantém a coerência
com o §2 do CONTEXTO: nada nasce de interpretação, tudo nasce de função pura.

**Pior caso, não média.** A aritmética que serve aqui é a determinística —
somar tetos declarados. Pior caso responde "isto pode estourar?" com uma conta
que qualquer pessoa refaz no papel, e auditável é requisito nosso, não luxo.

Duas ressalvas honestas, que a **§12.1** desenvolve em vez de esconder:
pior caso **grita lobo** (somar tetos em oito saltos dá um número que quase
nunca acontece), e há três casos — cauda de cadeia, fan-out e probabilidade de
completar no orçamento — em que ele não é apenas grosseiro, é **errado**. Nesses
casos amostrar responde melhor. O que decide se isso vale aqui não é
matemática, é proveniência: ver §12.1.3.

---

## 5. P3 — O para quê (requisito, rastreabilidade, gap analysis)

**O que é:** `Requirement { id, texto, prioridade, tipo }` +
`TraceabilityLink { requisito → elemento }`, e a matriz que mostra requisito
sem elemento.

**O que temos:** proveniência — de onde veio **o valor**. Não temos o outro
eixo: a que **propósito** o elemento serve. São perguntas diferentes e as duas
importam; hoje só respondemos uma.

**Onde encaixa sem inventar mecanismo:** o gap analysis é **prontidão de outro
tipo**. Nosso semáforo hoje diz "falta preencher". Passaria a dizer também
"este requisito não tem componente que o atenda" — que é o buraco que aparece
tarde, na reunião de refinamento, quando já custa caro.

**A regra que segura a porta:** requisito sem link é **gap a mostrar**, nunca
item a gerar. O §2 do CONTEXTO — *"todo item nasce de um nó/aresta real, nunca
de texto solto"* — continua valendo, e é exatamente ele que impede o requisito
de virar uma caixa de texto que gera backlog do nada.

---

## 6. P4 — O porquê (ADR)

**O que é:** decisão registrada, com opções consideradas, status, quem aprovou,
o que ela substitui.

**O que temos:** a especificação de solução em markdown — o *o quê* completo.
Quem abre daqui a seis meses não descobre por que a fila é Rabbit e não Kafka;
descobre só que é Rabbit.

**A âncora que faz isso caber aqui:** ADR **de um nó ou de uma aresta**, não um
documento paralelo. Ancorado, ele entra na especificação gerada como seção, e a
decisão viaja junto com o backlog que nasceu dela. Solto, é wiki — e wiki
desatualiza sem ninguém perceber, que é o problema que este produto existe para
não ter.

**Conexão que vale notar:** ADR tem `opções`. P6 (A vs B) é justamente
**avaliar opções com números**. Os dois são a mesma feature vista de dois
ângulos — e implementar um pensando no outro sai mais barato que os dois
separados.

---

## 7. P5 — O modo de operação (o que os "cenários" deles realmente são)

**Homônimo perigoso.** Nossos "cenários prontos" são **diagramas de exemplo**
para carregar na mesa. Os deles são **perfis de operação**: seis números
(duração, taxa, ramp-up, taxa de falha, seed) aplicados ao modelo inteiro.

**O que trazer, e não é carga simulada:** um perfil nomeado do diagrama —
"tráfego de Black Friday", "batch noturno", "interno de baixo volume" — que
**muda as perguntas do painel e os itens derivados**. Sob Black Friday, DLQ
deixa de ser opcional, idempotência vira obrigatória, a régua de volumetria
muda.

**Custo quase zero, e é o ponto:** isso é `when`/condição de visibilidade, que
o engine **já avalia**. Hoje a condição olha campos do nó; passaria a olhar
também o perfil do diagrama. Um eixo novo numa máquina que já existe.

E, com P1+P2, o perfil também é o **conjunto de entrada da aritmética**: trocar
de "normal" para "pico" é trocar a taxa na origem e refazer as contas.

---

## 8. P6 — A variante (A vs B)

**O que é:** dois desenhos da mesma decisão, comparados lado a lado.

**O que temos:** nada. Uma quebra é um diagrama.

**Por que vale mesmo sem simulação:** com P2, comparar A e B é comparar duas
tabelas de números calculados — pior caso de latência, custo, número de pontos
sem alternativa. E com P4, a comparação **é** o corpo do ADR: as opções
consideradas, com a conta de cada uma.

**Cuidado de modelagem:** variante não pode ser "copiar a quebra e editar", ou
as duas divergem e ninguém sabe qual venceu. Tem que ser **uma quebra com duas
variantes** e uma decisão registrada de qual foi adotada — de novo, o mesmo
princípio de fonte única.

---

## 9. P7 — O dialeto de provedor

**O que é:** o mesmo componente com nome de cada nuvem (fila = SQS = Service
Bus = Pub/Sub), e o mapeamento entre elas.

**O que temos:** techs e perfis de stack (SPEC-38/42/43) — o eixo existe, só
não tem a dimensão "provedor".

**Honestidade sobre o que copiar:** o mapeamento deles é ingênuo — "pega o
primeiro componente da mesma categoria" (`cloudMapping.ts`). Nosso mecanismo de
stack já é mais sério. O que vale é a **ideia de eixo**: saber que a fila é SQS
e não RabbitMQ muda as perguntas do painel (visibility timeout vs prefetch,
DLQ nativa vs configurada), e isso é config, não engine.

**Menor prioridade da lista** — é o que mais parece impressionante numa demo e
o que menos muda o item derivado.

---

## 10. P8 — Regra sobre a topologia (validação de conflito arquitetural)

**Achado medido:** temos `detectarConflitos()`
(`engine/src/dependency/dependencias.ts`), e ele detecta três coisas —
`ALVO_INEXISTENTE`, `INDEPENDENT_COM_DEPENDENCIA`, `ENABLER_E_DEPENDENT`.
Todas sobre o **grafo de atividades derivadas**. Nenhuma sobre o **desenho**.

**O que falta:** regra que olha a forma da arquitetura. Fila sem consumidor.
Cache sem TTL declarado. Serviço chamando serviço externo sem timeout. Caminho
sem alternativa até um recurso de terceiro. Retry sob timeout curto demais (o
conflito aritmético de §4).

**Por que é consequência e não fundação:** as regras mais valiosas precisam de
P1 (é sobre caminho) e de P2 (é sobre número). Com as duas, P8 é config —
`regras.json` ganhando um tipo de regra que olha topologia em vez de campo.

**E encaixa no que já fazemos bem:** "falhar alto, nunca em silêncio" é
princípio declarado do projeto. Conflito arquitetural é o mesmo princípio
aplicado ao desenho, e não ao arquivo de configuração.

---

## 11. Interface

O que a lista deles tem e nós não: **painel inferior** (timeline/log).
Esquerdo (menu) e direito (propriedades) já existem.

O painel inferior é o lugar natural para duas coisas que hoje não têm casa fixa
na mesa: a **linha do tempo da esteira de agentes** (que existe, mas na tela de
revisão) e a **explicação da conta** — "por que o pior caso é 2,7s", passo a
passo, com os números que entraram. Sem esse "porquê" visível, a aritmética de
§4 vira mais um número que a pessoa não sabe de onde veio, que é precisamente o
que este produto combate.

Sobre o resto do visual: **manter o nosso, e não por gosto**. Os dois projetos
usam React + ReactFlow, então a comparação é justa — e a nossa camada visual
carrega mecanismo (semáforo por nó, proveniência por campo, esteira animada,
conversa como interface). Ela é o produto se explicando enquanto a pessoa
trabalha, não enfeite.

---

## 12. O que não trazer

**O motor de simulação como ele é lá** — e como você já chegou nisso sozinho, fica o registro
curto: 228 linhas, simula **só o primeiro fluxo** (`model.Flows[0]`), laço de
passo fixo apesar do nome "DiscreteEvent", 9 testes no projeto inteiro. Mais
importante que a imaturidade: número que depende de um `seed` e de latência
chutada, exibido ao lado de item derivado deterministicamente, convida a
confundir os dois. A aritmética de pior caso (§4) responde à mesma classe de
pergunta com uma conta que se refaz no papel. Isso **não** fecha a porta para
amostragem em geral — só para transplantar aquele motor. Onde amostrar ganha, e
sob que condição, está na §12.1.

**Restrição legal, curta e real:** o repositório **não tem arquivo de licença**
(sem `LICENSE`; a API do GitHub devolve `licenseInfo: null`). O padrão então é
todos os direitos reservados. Nada aqui propõe copiar código — conceito de
domínio e decisão de produto não são protegidos, e é só disso que este
documento trata. Somos Apache-2.0 e dependemos de proveniência limpa.

---

## 12.1 Monte Carlo: onde ele ganha da aritmética, e o portão que decide

Pergunta do usuário depois de ler a §4: *"seria útil rodar algo como Monte
Carlo com esses dados? seria uma engine diferente da que existe no projeto"*.

Resposta curta: **sim, ganha em três casos concretos — e o que decide se vale é
proveniência, não matemática.**

### 12.1.1 Primeiro, admitir a fraqueza do que a §4 propõe

A aritmética de pior caso tem um defeito que eu não nomeei: **ela grita lobo**.
Somar tetos declarados ao longo de oito saltos de 300ms dá 2,4s — um número que
por construção quase nunca acontece, porque exigiria que todos os saltos
estourassem o teto na mesma requisição. Um alerta que aparece em todo caminho
com mais de três nós é um alerta que as pessoas aprendem a ignorar, e aí o
mecanismo inteiro perde valor.

Pior caso é honesto e é barato. Mas é uma régua grosseira, e vale dizer isso em
voz alta antes de recomendá-la.

### 12.1.2 Os três casos em que Monte Carlo responde o que aritmética nenhuma responde

1. **Cauda de uma cadeia.** O que se quer saber não é o pior caso nem a média —
   é o p99 da soma. Somar percentis está errado (p99 de uma soma ≠ soma dos
   p99), e a conta analítica exige convolução de distribuições. Amostrar é
   honestamente mais simples do que resolver.

2. **Fan-out — e este é o caso forte.** Um nó que chama N serviços em paralelo
   espera pelo **máximo**, não pela soma. Com cada chamada tendo p99 de 100ms, a
   chance de nenhuma das N passar de 100ms é `0,99^N`: com N=10 são ~90%, com
   N=100 caem para ~37% — ou seja, **63% das requisições pegam pelo menos um
   salto lento**. É o resultado clássico de *tail at scale*, ele muda decisão de
   arquitetura de verdade (agregar, hedge, reduzir o leque), e **nem o pior caso
   nem a média o enxergam**: o pior caso diz "300ms" e a média diz "40ms", e as
   duas estão erradas sobre a experiência real.

3. **Probabilidade de sucesso dentro do orçamento.** Com retry, backoff e
   timeout interagindo, "qual fração das requisições completa dentro de 1s?" é
   pergunta inerentemente probabilística. Dá pra fazer no papel em casos
   simples; deixa de dar assim que houver dois retries e um fallback.

Nos três, **a aritmética não é conservadora — é errada**, e isso é diferente de
ser grosseira.

### 12.1.3 O portão: é pergunta de proveniência, não de matemática

Monte Carlo não cria informação. Ele **compõe** as distribuições que você deu, e
a qualidade do resultado é inteiramente a qualidade da entrada. Alimentado com
chute, ele devolve o chute com intervalo de confiança em volta — a **aparência**
de rigor sem nenhum ganho de conhecimento. É exatamente a falsa precisão contra
a qual a proveniência deste projeto foi construída.

E aqui está a parte boa: **nós já temos o mecanismo para decidir isso.**
`Origem = "manual" | "extraido" | "inferido" | "sugerido"`, com `evidencia` em
cima do `extraido` (`engine/src/model/types.ts`). A regra escreve sozinha, e é
a mesma disciplina do §6.4 do CONTEXTO:

> **Distribuição construída sobre valor `manual` não produz número que o
> produto apresente como achado.** Onde a entrada é chute, o produto diz "não
> tenho medição para este trecho" — não inventa uma curva.

Isso divide o diagrama em dois territórios, e a divisão é útil por si só:

| Nó | Entrada típica | O que o produto pode afirmar |
|---|---|---|
| `status: existente` com observabilidade | p50/p99 reais, `origem: extraido` | Monte Carlo legítimo |
| `status: novo` | timeout e SLA **decididos**, `origem: manual` | pior caso, e só |

Repare que isso é coerente com o que a ferramenta é: para o que ainda vai ser
construído, o número é uma **decisão** (um teto que alguém escolheu honrar), e
pior caso é a régua certa. Para o que já existe, o número pode ser uma
**medição**, e aí a distribuição é real.

Um efeito colateral bom: "este trecho não tem medição" vira um pendência
visível — mais um tipo de prontidão, no espírito do gap analysis da §5.

### 12.1.4 O custo real não é o código

O amostrador é pequeno: percorrer o caminho N vezes acumulando sorteios é uns
poucos milhares de linhas menos do que parece — TS puro, zero I/O, ao lado do
`derive/`. Os dois custos verdadeiros são outros:

- **Pedir distribuição a uma pessoa é muito mais difícil que pedir um timeout.**
  Ninguém sabe responder "qual a distribuição de latência do seu serviço".
  Mitigação concreta: pedir **dois números que a pessoa tem no dashboard**
  (p50 e p99) e ajustar uma log-normal a partir deles. Duas perguntas
  respondíveis em vez de uma impossível.
- **Não confundir os dois tipos de resposta na tela.** Uma afirmação derivada
  ("este nó precisa decidir DLQ") é verdadeira por regra. Uma afirmação de Monte
  Carlo ("p99 de 340ms") é uma estimativa sobre o mundo, que pode estar errada.
  Se as duas aparecerem com a mesma tipografia, a segunda pega emprestada a
  autoridade da primeira — e é assim que uma ferramenta de disciplina vira uma
  máquina de confiança injustificada.

### 12.1.5 "É uma engine diferente?"

Sim e não, e a distinção importa:

- **Como código, não é.** Monte Carlo com `seed` explícito é determinístico:
  mesma entrada + mesma semente = mesma saída, reprodutível em teste e em
  auditoria. Cabe como função pura ao lado do `derivar()`, sem I/O, sem quebrar
  nenhuma fronteira que o `packages/engine` defende.
- **Como epistemologia, é.** `derivar()` produz **fatos sobre o desenho**;
  Monte Carlo produz **estimativas sobre a realidade**. É uma segunda classe de
  saída, e a única coisa que ela exige do produto é aparecer rotulada como tal —
  com quantos nós entraram com medição e quantos não, do mesmo jeito que hoje um
  campo mostra de onde veio o valor.

Nada disso é o motor do SimArch: lá o número sai de latência declarada e vira
relatório. Aqui a regra é a de sempre — **todo achado termina num item de
backlog**. "p99 estoura o SLA em 3% das amostras" não é item. *"O leque de 12
chamadas paralelas faz o p99 do caminho ser 4× o de cada chamada — avaliar
agregação ou hedge"* é.

### 12.1.6 Recomendação

**Depois de P1+P2, não em vez.** Monte Carlo precisa do percurso e dos números
de qualquer forma, e sem eles não há o que amostrar. A ordem que faz sentido:

1. percurso + número + pior caso (§13, passos 1–3) — barato, e já entrega;
2. medir quantos nós de quebras reais chegam com `origem: extraido`. **Se forem
   poucos, Monte Carlo não tem o que compor e a resposta vira "não vale".** Essa
   medição é a que decide, e ela é barata;
3. se houver dado, começar pelo **fan-out** — é onde a aritmética erra mais feio
   e onde o resultado muda decisão de arquitetura.

---

## 13. Ordem, com as dependências explícitas

```
P1 percurso ──┬─► P5 modo de operação (troca as entradas do cálculo)
              ├─► P8 conflito de topologia
P2 número ────┴─► FinOps · orçamento de latência · restrição paramétrica
                     └─► P6 variante A vs B ──► P4 ADR (as opções, com conta)

P3 requisito/gap ─── ortogonal, não depende de nada acima
P7 provedor ──────── config, a qualquer momento
```

| # | Passo | Depende de | Retorno |
|---|---|---|---|
| 1 | **P1 percurso** — fluxo nomeado sobre as arestas existentes, com origem e alternativa | — | **alto**: destrava tudo |
| 2 | **P2 número com unidade e regra de composição** | — | **alto**: destrava a aritmética |
| 3 | **Orçamento de latência + conflito aritmético** (o primeiro cálculo de ponta a ponta) | P1+P2 | **alto**: é a prova de que a tese funciona, num caso só |
| 4 | **P3 requisito + gap analysis** | — | médio-alto, e independente |
| 5 | **P5 perfil de operação** | P1+P2 | médio-alto por muito pouco código |
| 6 | **P8 regras de topologia** | P1+P2 | médio-alto, incremental |
| 7 | **FinOps** | P2 | médio |
| 8 | **P6 variante + P4 ADR** juntos | P2 | médio |
| 9 | **P7 dialeto de provedor** | — | baixo |
| ? | **Monte Carlo** (§12.1) | P1+P2 **e** medição de quanto dado chega como `extraido` | a decidir por medição, não por gosto |
| — | Painel inferior com a explicação da conta | passo 3 | acompanha o 3 |

**Se for um só passo, que sejam os passos 1–3 juntos, num caminho de exemplo.**
Percurso, número e um cálculo que termina em item derivado — é o menor recorte
que prova ou derruba a tese inteira, e cabe numa spec própria.

---

## 14. Achados colaterais no nosso próprio código

Coisas que apareceram enquanto eu media o "o que temos", e que valem
independentemente do SimArch:

1. **Correção da v1 deste documento.** Escrevi que campo estruturado era dívida
   aberta, citando o CONTEXTO §5.2. Está desatualizado: `TipoCampo` já é
   `text | textarea | number | boolean | select | lista`, com `itemSpec` —
   a SPEC-18 entregou. O que falta em §4 não é a lista, é a **unidade e a regra
   de composição** do número.
2. **`validateConfig` não valida o `type` do campo.** O validador confere
   `when.field`, referências de `{{template}}` e tipo de nó destino — e nunca o
   `type`. Um `"type": "lixo"` passa. É a mesma classe de falha que o comentário
   do `RECURSOS` no servidor chama de *"falha ABERTA e em silêncio"*.
3. **`config/diagrama.schema.json` está defasado e desligado.** Ele declara
   `"type": { "enum": ["text","number","boolean","select"] }` — faltam
   `textarea` e `lista`, que o engine aceita e que o
   `config/diagrama.example.json` **usa**. E nenhum código o referencia: é
   tooling de editor, então hoje ele desinforma quem escreve config à mão.

Os dois últimos são pequenos e reais; nenhum é urgente, ambos são do tipo que o
projeto normalmente não deixa passar.

---

## 15. O que este documento não respondeu

1. **Se o usuário do Gerador quer percurso.** A tese de §1 é minha leitura, não
   um pedido observado. O passo 1–3 de §13 existe justamente para testá-la
   barato em vez de assumir.
2. **Como percurso convive com quebras grandes.** Um diagrama de 30 nós tem
   quantos fluxos que importam? Se a resposta for "muitos", a UI de declarar
   fluxo vira o gargalo, e isso muda o desenho.
3. **De onde vêm os números.** Timeout declarado é decisão; latência de um
   serviço existente é medição que não temos. Pior caso funciona com o
   primeiro; qualquer coisa além disso precisa responder de onde vem o dado —
   e proveniência é justamente o que não se improvisa aqui.

---

## 16. Fontes

- [wendelmax/SimArch](https://github.com/wendelmax/SimArch) — clone raso em
  14/08/2026, commit `d868d5c`. Sem arquivo de licença (§12).
  Lidos: `README.md`, `src/SimArch.Simulation/DiscreteEventSimulationEngine.cs`,
  `src/SimArch.Decision/DecisionEngine.cs`, `src/SimArch.Domain/{Entities,ValueObjects}/*`,
  `src/SimArch.DSL/`, `src/SimArch.Web/client/src/data/*.ts`, `samples/*.yaml`.
- Deste repositório, verificados e não presumidos:
  `engine/src/model/types.ts` (não há fluxo), `engine/src/config/types.ts`
  (`TipoCampo`), `engine/src/config/validator.ts` (não valida `type`),
  `engine/src/dependency/dependencias.ts` (`detectarConflitos` é sobre
  atividades), `config/diagrama.schema.json` (defasado).
- `CONTEXTO-E-ARQUITETURA.md` §2, §4, §5.2 · `SPEC-18` · `SPEC-38/42/43` ·
  `SPEC-53`.
