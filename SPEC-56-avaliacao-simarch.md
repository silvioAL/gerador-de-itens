# SPEC-56 — Avaliação do SimArch: o que vale trazer, e o que não

> **Status: avaliação, não decisão de construir.** Leitura do código de
> [`wendelmax/SimArch`](https://github.com/wendelmax/SimArch) (clone raso em
> 14/08/2026, commit `d868d5c`) contra o Gerador no estado atual. Nenhuma linha
> de produção muda por causa deste documento.

Pedido: *"avaliar esse projeto (…) acredito que podemos ter insights
interessantes para evoluir o nosso projeto quanto as simulações e
comportamentos, mapeamento de cenários, construção dos diagramas, configurações
e construção itens em si, obviamente precisamos manter nosso visual que está
incrível com animações lindas"*.

---

## 0. Restrição legal que decide o formato desta avaliação

**O SimArch não tem arquivo de licença.** Não há `LICENSE`, `COPYING` nem
`NOTICE` no repositório, e a API do GitHub devolve `licenseInfo: null`.

Sem licença, o padrão é **todos os direitos reservados**: o código está
publicamente legível, mas não é reutilizável. Isso não é formalidade — nosso
projeto é Apache-2.0 e depende de proveniência limpa para continuar sendo.

Consequência prática, e é ela que molda tudo abaixo: **avalio ideias, não
código.** Nada aqui propõe copiar arquivo, trecho ou tradução linha a linha.
Conceitos de arquitetura, vocabulário de domínio e decisões de produto não são
protegidos por copyright, e é só disso que este documento trata. Se algum dia a
vontade for reusar código de lá, o caminho é pedir uma licença ao autor.

---

## 1. Resumo executivo

O SimArch responde uma pergunta que o Gerador **não** responde, e vice-versa:

| | SimArch | Gerador |
|---|---|---|
| Pergunta | *"esta arquitetura aguenta?"* | *"o que precisa ser construído?"* |
| Mecanismo | simulação estocástica de eventos | derivação determinística |
| Saída | métricas, relatório de impacto, ADR | itens de backlog com dependências |
| Prova | um número que depende de um `seed` | uma função pura de (diagrama, config) |

São **complementares**, e é por isso que a leitura vale. Mas a tentação óbvia —
"vamos ter simulação também" — é a pior ideia do documento, e explico em §4.

O que vale trazer não é o motor: é o **vocabulário de domínio** que o SimArch
tem e nós não. Cinco ideias, em ordem de retorno sobre esforço:

1. **Políticas de resiliência como campo estruturado**, não texto livre (§3.1)
2. **Restrição paramétrica** — `métrica operador valor`, verificável (§3.2)
3. **Rastreabilidade requisito ↔ elemento, com gap analysis** (§3.3)
4. **Perfil de carga/contexto como objeto nomeado e reusável** (§3.4)
5. **ADR ligado ao nó, não solto num wiki** (§3.5)

A #1 é a de maior retorno porque ataca o **coração** do produto: a qualidade do
item derivado. As outras três primeiras não exigem simulação nenhuma.

---

## 2. O que o SimArch é, medido

Clone raso, `src/` com 82 arquivos de código:

```
src/SimArch.Domain/      entidades + value objects (o modelo)
src/SimArch.Simulation/  DiscreteEventSimulationEngine.cs — 228 linhas
src/SimArch.Decision/    DecisionEngine.cs — 102 linhas
src/SimArch.DSL/         YamlModelLoader — o modelo vem de YAML
src/SimArch.Api/         ASP.NET Core
src/SimArch.Web/client/  React + Vite + ReactFlow
src/SimArch.Export/      PDF / JSON / Mermaid / CSV
src/SimArch.Tests/       2 arquivos, ~9 testes
```

Stack: **.NET 10 + React/Vite + ReactFlow**, YARP de proxy, Docker/GHCR.
Repositório sem estrelas, CI só de publicação de imagem (`docker-publish.yml`),
sem job de teste.

### 2.1 O modelo de domínio (é aqui que está o valor)

`ServiceDefinition` carrega, por serviço, **políticas tipadas**:

```
Sla · ScalingPolicy · RetryPolicy · CircuitBreakerPolicy
TimeoutPolicy · BulkheadPolicy · QueuePolicy · FallbackServiceId
Provider · Component · CostPerHour · CostPerMonth · Currency
```

Mais quatro entidades que nós não temos equivalente:
`Requirement`, `TraceabilityLink`, `ArchitecturalDecisionRecord` (com opções,
status, `SupersededBy`, emendas) e `ParametricConstraint`.

### 2.2 O motor de simulação, sem cerimônia

Li o `DiscreteEventSimulationEngine` inteiro. O que ele faz:

- laço de **passo fixo** (`simTime += 1/taxa`) até a duração acabar — apesar do
  nome, não há fila de eventos ordenada por tempo;
- por requisição, percorre os passos do fluxo aplicando circuit breaker, fila
  com capacidade (backpressure), fallback e injeção de falha aleatória;
- `Random(options.Seed)` — a corrida é reprodutível dado o seed.

Duas limitações que valem registro, porque afetam quanto crédito dar aos
números: **só o primeiro fluxo é simulado** (`model.Flows[0]`), e as latências
saem de configuração declarada, não de medição. É um simulador de *forma da
arquitetura*, não de desempenho real — o que, aliás, é coerente com o slogan
("você testa decisões"). O `DecisionEngine` é sobretudo um coletor: transforma
políticas declaradas em itens de relatório (`"Timeout 300ms"`, `"Fallback to
wallet"`) e avalia as restrições paramétricas contra as métricas da corrida.

---

## 3. As cinco ideias que valem, e como cada uma cai no nosso mecanismo

### 3.1 Políticas de resiliência como campo estruturado — **maior retorno**

**Lá:** `RetryPolicy { max, backoffMs, exponential }`,
`CircuitBreakerPolicy { failureThreshold, openDurationMs, successThresholdInHalfOpen }`,
`QueuePolicy { capacity }`, `BulkheadPolicy { maxConcurrency }`,
`Sla { maxLatencyMs, availability }` — tudo tipado, no YAML e no modelo.

**Aqui:** as mesmas ideias existem, mas como **item de checklist e texto
livre**. `regras.json` pergunta "definiu política de retry?" e a resposta é uma
frase. O CONTEXTO-E-ARQUITETURA §5.2 já lista isso como dívida aberta:
*"Campos estruturados (lista/sub-formulário) — `stages` de um Camunda,
`motores` de um FICO ainda são texto livre"*.

**Por que é o maior retorno:** nosso produto não vale pelo desenho, vale pelo
**item derivado**. Com retry como texto, `derivar()` só consegue produzir
*"definir política de retry"* — um item que devolve a pergunta pra quem a fez.
Com retry estruturado, produz *"configurar retry 3× com backoff exponencial de
100ms e DLQ após esgotar"*, e o critério de aceite em Gherkin sai junto, com os
números dentro. A diferença entre um backlog que lembra o que decidir e um
backlog que **carrega a decisão**.

**Custo:** é extensão de `config/diagrama.json` + o tipo de campo estruturado
que a SPEC-18 começou. Não toca o engine no sentido que a SPEC-03 adverte —
é config, que é exatamente onde essas coisas devem morar.

**Cuidado:** o catálogo deles é fechado em C#. O nosso tem que continuar
config-driven, senão viramos a ferramenta que sabe o que é "rabbit" — o erro
que o §4 do CONTEXTO nomeia.

### 3.2 Restrição paramétrica — `métrica operador valor`

**Lá:** `ParametricConstraint { Id, Metric, Operator, Value, AdrId }`, com
`Metric` no formato `"servico:p95LatencyMs"` e operadores `lt|le|eq|ge|gt|ne`.
O `DecisionEngine` resolve a métrica contra o resultado da simulação e devolve
`passed: true|false`.

**Aqui:** nossa prontidão é binária e sobre **preenchimento** — campo cheio ou
vazio, semáforo. Não existe "este número precisa ser menor que aquele".

**O que trazer sem simulação nenhuma:** a restrição paramétrica é valiosa
mesmo sem nada para avaliá-la contra, porque ela vira **critério de aceite
verificável**. Hoje geramos Gherkin em prosa. Uma restrição declarada
(`p95 < 200ms`, `throughput ≥ 1000/s`) é o mesmo Gherkin com o número no lugar
certo — e, mais importante, é **rastreável**: o item derivado sabe qual
restrição ele existe para satisfazer.

Isso encaixa direto na proveniência: uma restrição é um valor `manual`, decidido
por alguém, e o item que nasce dela carrega a origem.

**Custo:** baixo. É um tipo de campo novo e uma regra de derivação.

### 3.3 Rastreabilidade requisito ↔ elemento, com gap analysis

**Lá:** `Requirement { Id, Text, Priority, Type, StandardRef }` e
`TraceabilityLink { RequirementId, LinkType, ElementType, ElementId }`. A
interface monta matriz de rastreabilidade e **gap analysis** — requisito sem
elemento que o satisfaça.

**Aqui:** temos proveniência (de onde veio o *valor*) e não temos
rastreabilidade (a que *propósito* o elemento serve). São eixos diferentes, e a
ausência do segundo é sentida: o item derivado sabe de qual nó nasceu, e não
sabe qual necessidade ele atende.

**Por que encaixa bem:** o gap analysis é **prontidão de outro tipo**, e nosso
semáforo já é o lugar natural para ela. Hoje o vermelho diz "falta preencher".
Podia dizer também "este requisito não tem nenhum componente que o atenda" — o
que é o tipo de buraco que só aparece na reunião de refinamento, tarde.

E se liga na SPEC-53 (contexto do produto): requisito é vocabulário de negócio,
que já tem dono no nosso modelo.

**Cuidado:** requisito **não pode virar texto solto**. A regra do §2 do
CONTEXTO — *"todo item nasce de um nó/aresta real, nunca de texto solto"* — tem
que valer aqui: um requisito sem link é um gap a mostrar, não um item a gerar.

### 3.4 Perfil de carga/contexto como objeto nomeado

**Lá:** quatro presets de 6 números cada — Normal, Pico, Black Friday, Falha
Regional (`durationSec`, `rate`, `failureRate`, `rampUpSec`, `seed`). Aplicáveis
ao modelo inteiro, e comparáveis A vs B.

**Aqui:** nossos "cenários prontos" são **diagramas de exemplo** — outra coisa
com o mesmo nome. Volume esperado, janela de pico e tolerância a falha, quando
existem, são campos de texto por nó.

**O que trazer:** o conceito de **perfil aplicado ao diagrama inteiro**, não a
carga simulada. "Este é um fluxo de Black Friday" deveria **mudar as perguntas
que o painel faz** e **os itens que a derivação produz** — DLQ deixa de ser
opcional, idempotência vira obrigatória, o checklist de volumetria muda de
régua. Isso é `when`/condição de visibilidade, mecanismo que o engine **já
tem**: hoje a condição olha campos do nó; passaria a olhar também o perfil do
diagrama.

É provavelmente a ideia mais barata da lista em relação ao que muda na
experiência — e a que mais se parece com algo que já queríamos.

### 3.5 ADR ligado ao nó

**Lá:** ADR de primeira classe, com `Options`, `Status`, `SupersededBy`,
`Amendments` e `LinkedConstraintIds`. Exportável em PDF.

**Aqui:** geramos a **especificação de solução** em markdown — o *o quê*
completo, sem o *por quê*. Quem lê o documento seis meses depois não descobre
por que a fila é Rabbit e não Kafka.

**O que trazer:** o ADR **preso ao elemento do diagrama** e à restrição (§3.2),
não um documento paralelo. Nosso gerador de especificação já monta um markdown
por quebra; ADRs ancorados em nós entrariam nele como seção, e a decisão viajaria
junto com o backlog que nasceu dela.

**Cuidado, e é o mesmo de sempre:** ADR é texto por natureza, e texto livre é
exatamente o que este projeto passa o tempo todo tentando não ter. A disciplina
que salva é a âncora: ADR **de um nó/aresta**, com opções e status — não uma
caixa de texto no topo da quebra.

### 3.6 Menções honrosas, com ressalva

- **FinOps (`CostPerHour`/`CostPerMonth` por serviço).** Barato de adicionar e
  faz a especificação carregar estimativa de custo. Ressalva honesta: custo de
  um nó desenhado é chute com casa decimal, e o nosso produto trata número sem
  origem como dívida. Se entrar, entra com proveniência e sem somar em silêncio.
- **Painel inferior com timeline/log ao vivo.** A esteira de agentes já tem
  visão ao vivo; um painel inferior com a linha do tempo da derivação é um
  padrão de UI que combina com o que temos. É UI, não mecanismo.
- **Equivalência entre nuvens (`cloudMapping`).** Não copiar: a implementação
  deles é "pega o primeiro componente da mesma categoria", e nosso equivalente
  (perfis de stack, SPEC-38/42/43) já é mais sério.

---

## 4. O que **não** trazer: o motor de simulação

Esta é a recomendação que mais contraria a intuição do pedido, então vai com o
argumento inteiro.

**1. Colide com a tese do produto.** O CONTEXTO §2 diz, sobre o Gerador:
*"Nenhuma atividade de backlog nasce de um LLM interpretando uma descrição
solta. Atividades só existem como saída determinística de `derivar()`."* A razão
não é preferência estética — é que **valor sem origem confiável contamina a
decisão**, e o produto inteiro (proveniência, semáforo, "falhar alto") é
construído contra isso. Um simulador produz números que dependem de latências
declaradas por chute e de um `seed`. Colocar esses números ao lado de um item
derivado deterministicamente é convidar a confundir os dois.

**2. O que ele mede não é o que perguntamos.** A simulação responde "aguenta
500 req/s?". Nosso usuário está perguntando "o que preciso escrever de código
antes da sprint começar?". Um p95 simulado não muda nenhum item do backlog — a
menos que vire restrição paramétrica, que é justamente a ideia que §3.2 propõe
trazer **sem** o motor.

**3. O motor de lá não é forte o bastante para justificar o transplante.** 228
linhas, simula **só o primeiro fluxo**, laço de passo fixo em vez de fila de
eventos, 9 testes no projeto inteiro. Não é demérito — é um projeto jovem, sem
estrelas, e a ideia é boa. Mas não é um ativo pronto a ser incorporado; seria
reescrever, e reescrever um motor estocástico ao lado de um determinístico é
duplicar a superfície do produto para responder uma pergunta que ninguém nos
fez ainda.

**4. Não pode ser copiado mesmo.** §0.

**Se um dia a simulação for querida**, o caminho barato existe e não precisa de
motor: **derivar as consequências deterministicamente**. Com as políticas
estruturadas de §3.1, dá pra dizer, sem `Random` nenhum, que uma cadeia de três
serviços com timeout de 300ms cada e retry 3× tem pior caso de 2,7s e estoura
o SLA de 1s declarado no nó de entrada. Isso é aritmética sobre o diagrama —
função pura, do mesmo tipo que `derivar()` — e responde à mesma classe de
pergunta com uma resposta que **se sustenta em auditoria**. É simulação de
pior caso, não de amostra.

---

## 5. O visual: manter, e o porquê técnico

Ambos usam **React + ReactFlow**, então a comparação é justa. O pedido de manter
o nosso está certo e não é só gosto: nossa camada visual carrega **mecanismo** —
o semáforo de prontidão por nó, a proveniência por campo, a animação da esteira
de agentes e a conversa como interface são o produto se explicando enquanto a
pessoa trabalha. O SimArch tem uma UI competente de painéis retráteis e um
catálogo de ícones de nuvem; nada ali substitui o que já temos, e trocar
qualquer parte custaria mais do que rende.

O único empréstimo de UI que vale considerar é o **painel inferior de linha do
tempo** (§3.6) — aditivo, não substitutivo.

---

## 6. Recomendação

Ordem sugerida, se e quando houver apetite. Cada fase é útil sozinha e nenhuma
depende de simulação:

| # | O quê | Onde toca | Retorno |
|---|---|---|---|
| 1 | **Políticas de resiliência estruturadas** (§3.1) | `config/diagrama.json` + campo estruturado da SPEC-18 | **alto** — melhora o item derivado, que é o produto |
| 2 | **Perfil do diagrama** (Black Friday, interno, batch noturno) mudando perguntas e regras (§3.4) | condições `when` que o engine já avalia | **alto** — muda a experiência com mecanismo existente |
| 3 | **Restrição paramétrica** (§3.2) | tipo de campo + derivação de critério de aceite | médio-alto |
| 4 | **Requisito + rastreabilidade + gap analysis** (§3.3) | modelo + prontidão | médio-alto |
| 5 | **ADR ancorado no nó** (§3.5) | especificação de solução | médio |
| — | ~~Motor de simulação~~ | — | **não** (§4) |
| — | Pior caso determinístico como alternativa (§4, fim) | engine, função pura | a avaliar depois de 1 e 3 |

**Se for uma só, que seja a #1.** É a que ataca o coração — a qualidade do item
— e é pré-requisito natural das #3 e da simulação de pior caso.

---

## 7. O que esta avaliação não respondeu

1. **Se o usuário do Gerador quer restrição paramétrica.** Trouxe a ideia porque
   ela encaixa no mecanismo, não porque alguém pediu. Antes de construir, vale
   uma pergunta a quem usa — é barato perguntar e caro construir.
2. **Quanto de `regras.json` viraria campo estruturado.** Estimar isso exige ler
   as regras de cada tech e decidir uma a uma; é trabalho de spec própria, não
   de avaliação.
3. **Se o autor do SimArch licenciaria o projeto.** Não perguntei. Se a resposta
   for sim, §0 muda e a conversa sobre reuso pode existir — mas nenhuma
   recomendação deste documento depende disso.

---

## 8. Fontes

- [wendelmax/SimArch](https://github.com/wendelmax/SimArch) — clone raso em
  14/08/2026, commit `d868d5c`. Sem arquivo de licença (§0).
- Arquivos lidos: `README.md`, `src/SimArch.Simulation/DiscreteEventSimulationEngine.cs`,
  `src/SimArch.Decision/DecisionEngine.cs`, `src/SimArch.Domain/Entities/*`,
  `src/SimArch.Domain/ValueObjects/*`, `src/SimArch.DSL/`,
  `src/SimArch.Web/client/src/data/{cloudCatalog,cloudMapping,simulationPresets}.ts`,
  `samples/*.yaml`, `docs/`.
- Deste repositório: `CONTEXTO-E-ARQUITETURA.md` (§2, §4, §5.2), `SPEC-18`
  (campo tipo lista), `SPEC-38/42/43` (stacks), `SPEC-53` (contexto do produto).
