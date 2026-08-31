# SPEC-94 — A maturidade medida, o método de quebra e o valor dito com mecanismo

> **Origem:** o usuário, no meio da rodada §341, olhando a landing recém-virada
> apresentação:
>
> > *"uma das coisas que sinto falta em termos de explicação é: qual é o método
> > de quebra em histórias e tasks, como ele funciona? porque existe? outra
> > questão é: como esse sistema pode agregar valor a organização?"*
> >
> > *"e outra questão mais a parte é que eu tenho a percepção de que é necessário
> > ter algum grau de maturidade estabelecida para usar o sistema. Acho que o que
> > quebra nas empresas hoje é que existe um certo acesso a IA, mas as vezes não
> > existe a camada perene de processos consolidada. Existem níveis de maturidade
> > de processo: para empresas onde existe mais maturidade, passar a integrar IA
> > nos processos pode ser rápido, um passo relativamente curto e óbvio; para
> > empresas que tem baixo grau de maturidade dos processos pode ser diferente
> > (inclusive seria importante ter algum diagrama de apoio, com animações para
> > explicar isso). E isso precisa conversar com o resto no story telling,
> > precisa ser muito bem mapeado no sistema."*
> >
> > *"inclusive vc pode pegar isso que disse e avaliar, amadurecer, pesquisar
> > vocabulário de mercado que descreva isso"*
>
> **Decisão de escopo tomada com o usuário na mesma conversa:** SPEC própria, e a
> maturidade entra como **diagnóstico — o produto mede a maturidade do time** —
> não apenas como narrativa na landing.
>
> ## Revisão do §343 — o eixo que faltava
>
> Antes de implementar, o usuário pediu para amadurecer:
>
> > *"a avaliação de maturidade, acho que talvez até tenhamos algo, mas ao menos
> > nas páginas iniciais sequer é mencionado, e precisa ser amadurecido antes de
> > qualquer coisa. **Não é PDCA sem análise crítica muito bem estruturada**,
> > eventualmente no dash, com fluxo mapeado. Sinto que precisamos evoluir isso."*
>
> A frase do meio reorganizou esta SPEC inteira, e a medição lhe deu razão: **o
> PDCA do produto não tem a etapa de análise** (§3). Sem ela, a escala de
> maturidade seria um retrato — e maturidade não é um estado a que se chega, é um
> mecanismo que se mantém.
>
> Três respostas curtas às outras observações:
>
> - **"talvez até tenhamos algo":** sim, **e apontado para o outro lado** (§2.4).
>   `prontidao.ts` mede se a *demanda* está completa; nada mede se a *camada* está.
>   É o mesmo cálculo sobre outro objeto — o que barateia muito a fatia A.
> - **"nas páginas iniciais sequer é mencionado":** correto. O §342 deixou a
>   maturidade fora do site de propósito, porque ela dependia desta SPEC. O §8
>   trata de quando e como ela entra.
> - **"eventualmente no dash, com fluxo mapeado":** §4.6 — e ele não redesenha
>   nada: é o fluxo que já existe (`OFluxoDoProcesso`) com número em cima.
>
> E, nas mensagens seguintes, três correções que reorganizaram de novo:
>
> > *"quando falo de PDCA, precisamos pensar mais alto nível: as melhorias, e o
> > set de métricas que você propôs — junto com o qualitativo com coleta
> > estruturada, que precisa ser estruturado."* · *"o da configuração faz parte,
> > precisamos de métricas dele."*
>
> Isso trocou o eixo do §3: **são dois PDCAs aninhados**, o de configuração é uma
> das **fontes** do de melhoria, e ele precisa de métricas próprias — que são
> **calculáveis hoje**, sem canal externo (§4.4.1).
>
> > *"as páginas iniciais deixam passar que o sistema também entrega valor ao
> > padronizar as quebras: se diversos times usarem, ficam nivelados, o que é um
> > ganho de governança."*
>
> Conferido, e ele tem razão: **não está na tabela canônica de ganhos** do
> `CONCEITO.md`, e o site herdou o buraco. É o §6.1 — e o mecanismo é estrutural,
> não treinamento.

---

## 0. O que esta SPEC faz, em uma frase

Transforma a intuição do usuário — *"é preciso maturidade de processo para usar
isto"* — em **um conceito de primeira classe do produto, medido a partir do que já
está preenchido**, com **a análise crítica que hoje falta ao PDCA** como o motor
que o faz andar; e usa isso para responder às outras duas perguntas que ele fez:
qual é o método de quebra, e o que a organização ganha.

---

## 1. O vocabulário de mercado, pesquisado

O usuário pediu para pesquisar. O que existe, e o que vale adotar.

### 1.1 A intuição dele é a tese do mercado em 2026

> *"o que quebra nas empresas hoje é que existe um certo acesso a IA, mas às
> vezes não existe a camada perene de processos consolidada"*

O **CMMI Institute** lançou em 2026 o **CMMI AIM** (AI Maturity) com esta
justificativa, publicada:

> *"AI investment and adoption are accelerating faster than governance maturity
> in most organizations, with many enterprises lacking repeatable processes,
> accountability, data discipline and performance controls needed for mature
> AI."*

E a literatura de avaliação empresarial de 2026 é convergente:

> *"Most enterprise AI failures are not model failures, but data, governance,
> architecture, and operational maturity failures."*

Os números que circulam: acesso do trabalhador a IA cresceu ~50% em 2025, e
**apenas ~34%** das organizações dizem ter repensado o negócio em torno dela;
**~12%** dos CEOs relatam ROI real. **É exatamente a lacuna que o usuário
descreveu**, e é onde este produto se posiciona.

> **Régua da SPEC-83 aplicada a esta seção:** estes números são de terceiros e
> **não vão para a landing como se fossem nossos**. Se algum aparecer na página,
> aparece com a fonte e a data, e sujeito a envelhecer — ver §5.

### 1.2 Os modelos que existem

| Modelo | O que é | O que nos serve |
|---|---|---|
| **CMMI** (5 níveis: *Initial · Managed · Defined · Quantitatively Managed · Optimizing*) | o padrão de fato de maturidade de processo, desde os anos 90 | **a escada**, e o vocabulário que um arquiteto de organização grande já conhece |
| **CMMI AIM** (2026) | CMMI com conteúdo de IA em ~50% das 31 áreas de prática | a validação de que a lacuna existe e tem nome |
| **MITRE AI Maturity Model** | prontidão para adotar IA + impacto estratégico | a ideia de avaliar **por dimensão**, não com uma nota só |
| **CMU SEI + Accenture** | modelo de adoção de IA em **8 dimensões** | idem, com credibilidade de quem construiu o CMMI |

### 1.3 A distinção que vale mais que os modelos

O mercado separa três coisas que costumam virar uma só:

- **Readiness (prontidão)** — as pré-condições para o *primeiro* uso existem?
- **Adoption (adoção)** — as pessoas estão mudando como trabalham?
- **Maturity (maturidade)** — isso produz resultado **repetível e medível**?

> *"Maturity measures whether AI can be deployed safely, repeatably, and
> profitably at scale; readiness measures whether the preconditions for a first
> deployment are already in place."*

**Esta SPEC trata de maturidade, e mede prontidão como um subproduto.** É a
distinção que responde à pergunta do usuário sobre o passo curto e o caminho
longo: quem é maduro já tem as pré-condições, e o passo é curto **porque a
prontidão já está paga**.

### 1.4 O nome, e a colisão que ele precisa evitar

**"Níveis" está ocupado.** `packages/server/src/auth/niveis.ts` define
`Nivel` como *nível de acesso* — visualizar · operar · administrar (SPEC-38).
Reusar a palavra faria duas coisas diferentes com o mesmo nome no mesmo
vocabulário, que é o defeito do §263 na sua forma mais barata de evitar.

Varredura em `packages/*/src`: `patamar` **0 ocorrências**, `maturidade` **0**,
`grau` **12** (ocupado).

**Decisão: `Patamar` para o degrau, `maturidade` para o conceito.**

---

## 2. A tese: maturidade **medida**, não declarada

Aqui está a diferença que faz esta SPEC valer a pena, e ela é a tese do produto
aplicada a si mesmo.

**Todo modelo de maturidade do mercado é um questionário.** CMMI é *appraisal*:
caro, manual, periódico, e respondido por quem está sendo avaliado. Um
questionário de maturidade dentro deste produto seria **auto-declaração** — e
auto-declaração é exatamente o que a camada de apontamentos existe para
substituir (`CONCEITO.md`: *"o que o motor calcula e não guarda como verdade"*).

> **O produto já sabe.** Ele tem 13 áreas de configuração, e o que está preenchido
> nelas **é a evidência**. Uma régua com número é evidência mais forte que um
> parágrafo de wiki, e uma régua com `checagem` que roda é mais forte que uma
> régua com número. **O motor não precisa perguntar; ele precisa olhar.**

E há uma fronteira que este produto **já** desenha, e que é literalmente o degrau
CMMI 3 → 4. Do `CONCEITO.md`, no vocabulário:

> **Governança executável** — regra que **roda**, em vez de regra que está
> documentada · *a diferença entre `Requisito` com e sem `checagem`*

Essa distinção não foi inventada para esta SPEC. Ela está no código desde a
SPEC-20, e ninguém tinha notado que **ela é uma escala de maturidade**.

### 2.1 Os cinco patamares

Cada um sai de um dado que o produto **já tem**, e a coluna da direita é a
obrigação: sem ela, o patamar é adjetivo.

| # | Patamar | O que significa | Como o motor sabe | CMMI |
|---|---|---|---|---|
| 1 | **Tácito** | a regra existe na cabeça das pessoas | as áreas de configuração estão vazias | 1 — *Initial* |
| 2 | **Escrito** | existe wiki, PDF, documento — texto que ninguém consulta na hora de decidir | há contexto de produto preenchido, mas nenhum tipo/padrão estruturado | 2 — *Managed* |
| 3 | **Estruturado** | a regra virou **dado**: tipos de componente, campos obrigatórios, templates, checklists | há `NodeTypeConfig`/`RegrasConfig`/`checklistProcesso` povoados | 3 — *Defined* |
| 4 | **Executável** | a regra **roda**: réguas com número, checagens que produzem apontamento e derivam item | há `Requisito` **com** `checagem`, e tokens de design system | 3 consolidado, **tocando** o 4 |
| 5 | **Evoluído** | a régua muda a partir do uso, **e dá para provar que melhorou** | ⚠️ **não é medível hoje** — ver §2.3 | 5 — *Optimizing* |

### 2.2.1 ⚠️ Correção: o mapeamento para CMMI 4 e 5 era otimista

A primeira escrita desta SPEC alinhou o patamar 4 com *Quantitatively Managed* e o
5 com *Optimizing*. **O usuário apontou o buraco** — *"o sistema ainda conta com
pouca coisa relacionada a métricas"* — e a medição lhe deu razão (§2.3).

- **Patamar 4 não é CMMI 4.** Régua com número é **conformidade contra um alvo**;
  CMMI 4 pede *baseline de performance do processo* e previsibilidade
  estatística — *"nossa taxa é 2,3 ± 0,4"*. São coisas diferentes, e o produto só
  tem a primeira.
- **Patamar 5 não é medível hoje.** O produto tem o **mecanismo** da otimização
  (o PDCA da SPEC-39) sem a **evidência** dela. "A regra mudou" é um evento
  registrado; "a mudança melhorou" precisa de linha de base, e não há nenhuma.

Isso responde a pergunta em aberto §7.5 antes de a fatia A começar: **sim, o
patamar 5 é uma casa vazia — e por falta de infraestrutura, não por falta de
uso.**

> **A escada não é uma nota, e isso é decisão.** O MITRE e o CMU/Accenture avaliam
> por dimensão justamente porque uma organização é nível 4 em teste e nível 1 em
> arquitetura ao mesmo tempo. **O patamar é por área de configuração**, e o do
> time é o mínimo — não a média. Média esconde o buraco, e o buraco é o produto.

### 2.2 O que isso responde da pergunta do usuário

> *"para empresas onde existe mais maturidade, passar a integrar IA nos processos
> pode ser rápido, um passo relativamente curto e óbvio; para empresas que tem
> baixo grau de maturidade dos processos pode ser diferente"*

Com a escada acima, isso deixa de ser intuição e vira uma frase com mecanismo:

- **Quem está no patamar 3 ou 4** já tem a regra em forma consultável. O trabalho
  é **importar e ligar** — e o passo é curto porque a prontidão já foi paga.
- **Quem está no 1 ou 2** não tem onde a IA se apoiar. Acelerar ali é *"acelerar
  na direção errada com boa redação"* (a frase já está no `CONCEITO.md`).

E aqui está a parte comercialmente honesta, que a landing **precisa** dizer:

> **Para quem está no 1 ou 2, este produto não é o atalho — é o lugar onde a
> camada nasce.** O caminho é mais longo, e ele existe: cada área preenchida sobe
> um patamar, e o produto mostra qual é o próximo. Vender "passo curto" para quem
> está no patamar 1 é a promessa falsa que a SPEC-76 impediu na prosa, agora na
> forma de um modelo de maturidade.

### 2.3 O que existe de métrica, medido — e o que falta para o topo da escada

> Pergunta do usuário: *"quanto ao nível 4 que vc citou de CMMI, o que
> precisaríamos ter para chegar no nível 5? entendo que o sistema ainda conta com
> pouca coisa relacionada a métricas."*

Medido contra o repositório, e não de memória:

| O que existe | O que faz | O que **não** faz |
|---|---|---|
| `engine/src/remedicao/remedicao.ts` | roda o motor duas vezes — *como está* × *como ficaria* | é **prospectivo e em memória** (funções puras, sem I/O): responde *"o que acontece **se** eu aceitar"*, nunca *"o que aconteceu **depois** que aceitei"* |
| `quebras.diagrama` (jsonb) | guarda o estado corrente | não é snapshot datado — salvar **sobrescreve**, e o histórico se perde |
| `auditoria` | `email · acao · recurso · timestamp` | guarda **ação**, nunca **valor de métrica** |
| `execucoes_ia` | histórico de chamadas, com `LIMITE_DE_HISTORICO` | é telemetria de IA, não medida de processo |
| `pdca_feedback`, `solicitacoes_ajuste` | o laço de decisão (SPEC-39) | ninguém mede o **efeito** do ajuste depois de aplicado |

**Nenhuma das 11 tabelas guarda série temporal de medição.** Nada no sistema sabe
que a prontidão do time era 0,72 em março.

#### O que precisaria existir, em ordem de dependência

1. **`medicoes` — a tabela que não existe.** `(time, quebra, indicador, valor,
   versão da config, timestamp)`. É a fundação: **sem série, nada abaixo é
   possível**, e é por isso que ela vem antes de qualquer tela.
2. **Baseline por indicador.** Média e variação num período. É o que transforma
   *"0,72"* em *"0,72, dentro da sua faixa de 0,65–0,80"* — e é literalmente o que
   separa CMMI 3 de CMMI 4.
3. **Remedição retrospectiva.** Hoje só existe a prospectiva. Provar que uma
   mudança melhorou exige comparar contra a linha de base **real**, depois do
   fato. É o mecanismo que falta para o patamar 5 deixar de ser casa vazia.
4. **Análise causal entre times** — *Causal Analysis and Resolution*, a prática
   que define o CMMI 5.

#### ⚠️ E aqui há um ganho sem mecanismo, dentro do documento canônico

O `CONCEITO.md` promete, na seção *"Por que é um ciclo, e não uma esteira"*:

> *"Se cinco times violam o mesmo padrão, o padrão está errado, não os times."*

**Procurei o código que computa isso. Não existe.** `violacoesEmAberto()` é por
quebra, e nada no engine nem no server agrega violações entre times.

É a régua da SPEC-83 §2 — *todo ganho tem mecanismo* — sendo violada **pelo
próprio arquivo que a estabelece**, e passou porque nenhuma trava lê o
`CONCEITO.md`. A frase descreve exatamente a prática que define o CMMI 5, e é
promessa até alguém a construir.

**Duas saídas, e as duas são honestas:** construir a agregação (fatia própria,
depende do item 1), ou marcar a frase como direção declarada. Enquanto nenhuma
das duas acontecer, ela é o tipo de coisa que esta SPEC existe para não deixar
passar.

### 2.4 "Talvez até tenhamos algo" — sim, apontado para o outro lado

O produto **já sabe medir cobertura**. O que ele não faz é medir a cobertura
certa:

| O que existe | O que ele mede | O que falta |
|---|---|---|
| `engine/src/readiness/prontidao.ts` | **a demanda** está completa? campos preenchidos, necessidades respondidas | ninguém pergunta o mesmo da **camada** |
| `engine/src/revisao/coberturaConfigPadrao.test.ts` | é **teste**: a config de fábrica cobre os tipos do catálogo | não roda em produção, e não olha a config do time |
| `avaliarConformidade`, `violacoesEmAberto` | o desenho respeita as regras | não avalia se **há** regras |

> **A máquina existe e está virada para a demanda.** Maturidade é a mesma
> pergunta — *"o que falta preencher aqui?"* — feita sobre a camada perene em vez
> de sobre o desenho.
>
> Isso muda o custo da fatia A de "construir um avaliador" para "apontar o
> avaliador existente para outro objeto", e muda o risco: um mecanismo já provado
> em uso erra menos que um recém-escrito.

---

## 3. ⚠️ O achado desta revisão: **falta o PDCA de cima, e a etapa de análise**

> *"não é PDCA sem análise crítica muito bem estruturada"*
>
> *"quando falo de PDCA, precisamos pensar mais alto nível: as melhorias, e o set
> de métricas que você propôs — junto com o qualitativo com coleta estruturada,
> que precisa ser estruturado."*
>
> *"o da configuração faz parte, precisamos de métricas dele."*

### 3.0 São dois PDCAs, e só um existe

A primeira escrita desta revisão tratou o PDCA da SPEC-39 como *o* PDCA do
produto, e o usuário corrigiu o nível. **São dois ciclos aninhados**, e a
literatura de *Hoshin Kanri* chama isso de cascata: o de cima decide o que
melhorar, o de baixo executa, e os dois se alimentam.

| | **PDCA de configuração** (SPEC-39) | **PDCA de melhoria** — o que falta |
|---|---|---|
| Objeto | um campo, uma regra, um item de checklist | **o processo**: um handoff, uma prática, uma régua inteira |
| Gatilho | cadência de uso individual (a cada 5 usos) | **ritmo declarado** — a análise acontece a intervalos planejados |
| Entrada | *"sentiu falta ou sobra?"* | **métricas + qualitativo estruturado** (§4.3) |
| Saída | um ajuste na config | **decisões de melhoria**, com dono e prazo |
| Existe? | ✅ inteiro | ❌ nem o conceito |

> **O de baixo não é descartado — ele é uma das fontes do de cima**, e por isso
> precisa de métricas próprias (§4.4). Um pedido de ajuste é um sinal fraco
> sozinho e forte agregado: cinco times pedindo a mesma coisa não é cinco
> pedidos, é **um achado**.

O que segue neste §3 é sobre o ciclo de baixo — porque é o que existe, e é onde a
falta da etapa de análise se vê no código.

Medido contra a SPEC-39 e o código, o ciclo de melhoria do produto hoje é:

```
alguém SENTE algo  →  escreve um texto  →  vira solicitação
                   →  alguém APROVA     →  o ajuste é aplicado
```

E o gatilho é **cadência de uso individual**: *"a cada 5 usos do MESMO usuário"*,
contado em `pdca_usos`. Sai daí um balão perguntando *"sentiu falta ou sobra de
checklist, regra ou campo?"*.

**Isso é Plan → Do → Act.** O que existe entre o feedback e a decisão é a **prévia
do ajuste** (`config/previaDoAjuste.ts`), que mostra o que muda se aplicar — útil,
e é *simulação prospectiva*, não análise.

### 3.1 O que não existe, item a item

| Pergunta que uma análise faria | Existe? |
|---|---|
| **quantos** pediram a mesma coisa? | ❌ cada solicitação é lida sozinha |
| **cinco times** violaram o mesmo padrão? | ❌ `violacoesEmAberto()` é por quebra; nada agrega |
| o ajuste que aplicamos da última vez **funcionou**? | ❌ nada olha para trás |
| que exceções foram aceitas **pelo mesmo motivo**? | ❌ `ExcecaoDePadrao` tem motivo e autor, e ninguém os agrupa |
| quando foi a **última análise**, e o que ela decidiu? | ❌ não há o conceito |

O gatilho ser *uso individual* é a evidência mais clara: **ele mede que alguém
usou o produto cinco vezes, não que algo mereça ser discutido.** É coleta, não
análise — e coletar sem analisar é a forma mais cara de não melhorar, porque custa
a atenção de quem responde.

### 3.2 E isso derruba o patamar 5 por um segundo motivo

A §2.2.1 já tinha registrado que o patamar 5 é casa vazia por falta de série
temporal (SPEC-96). Agora há um motivo anterior a esse: **mesmo com os dados, não
haveria onde a análise acontecer.** Medir sem ritual de decisão produz painel;
não produz melhoria.

---

## 4. A análise crítica, estruturada — e "estruturada" tem definição

O usuário não pediu "mais análise": pediu análise **muito bem estruturada**. Isso
tem norma, e ela é útil porque diz **o que entra e o que sai**.

### 4.1 ISO 9001 §9.3 — análise crítica pela direção

A norma define *análise crítica* como a **determinação da pertinência, adequação e
eficácia de um objeto para atingir os objetivos**, feita **a intervalos
planejados** — e obriga:

| | O que a norma exige |
|---|---|
| **Entradas (9.3.2)** | as consequências das análises **anteriores**, mudanças de contexto, desempenho medido, disponibilidade de recursos |
| **Saídas (9.3.3)** | três decisões — **oportunidades de melhoria**, **mudanças necessárias no sistema**, **recursos** — e informação documentada **retida como evidência** |

**Três coisas aí valem ouro para esta SPEC**, e nenhuma exige inventar nada:

1. **"consequências das análises anteriores" é entrada obrigatória.** É o que
   fecha o laço: nenhuma análise começa do zero, e a de hoje precisa dizer o que
   aconteceu com o que a anterior decidiu. É exatamente o que falta no §3.1.
2. **A saída é decisão, não relatório.** Uma análise que termina em texto não
   terminou.
3. **A evidência é retida.** Que é o que este produto já faz com tudo:
   proveniência, decisão com o que foi recusado, trilha.

> **E isto é dado, como o resto.** As entradas e as saídas de uma análise crítica
> podem ser declaradas e conferidas do mesmo jeito que `Requisito` e `Checagem` —
> o produto inteiro é feito de estruturar o que costuma ser reunião.

### 4.2 Deming: é **Study**, não Check — e o produto pode fazer Study de verdade

Deming recusava a própria sigla PDCA. Em *The New Economics* (1993):

> *"I don't use check. Check is too closely associated with inspection."*

Para ele o ciclo é **PDSA**, e o **S** é de *Study*: **prever o resultado, estudar
o resultado real, comparar com a previsão, e revisar a teoria.** A diferença é que
*Check* pergunta "a mudança foi implementada?"; *Study* pergunta "**o que
aprendemos sobre a nossa teoria?**".

**Este produto está numa posição incomum para fazer Study de verdade**, e a razão
já está escrita na SPEC-96:

| Study exige | O produto tem |
|---|---|
| uma **teoria** explícita | **cada regra é uma hipótese**: *"seguir isto produz resultado melhor"* (SPEC-96 §5) |
| uma **previsão** registrada | `ItemDeTrabalho.pendencias` é uma previsão de clareza (SPEC-96 §4.1) |
| o **resultado real** | ❌ falta o canal — a porta de volta (SPEC-96 §6) |
| **revisar a teoria** | o PDCA aplica ajuste na regra (SPEC-39) |

Três de quatro existem. **O que falta é o mesmo que falta na SPEC-96**, o que é
uma boa notícia: as duas SPECs pedem a mesma peça, e ela paga as duas.

> **A escolha de nome desta SPEC:** o produto continua chamando o recurso de
> *PDCA*, porque é assim que ele já se chama no código, na tela e na SPEC-39.
> Renomear tudo para PDSA seria uma migração de vocabulário sem ganho para quem
> usa. **O que muda é a etapa que falta ganhar nome próprio — e ela se chama
> análise crítica**, que é o termo que o usuário usou e que a ISO define.

### 4.3 A análise que dá para fazer **antes** da porta de volta

Isto é o que torna a fatia viável cedo, e é o achado prático desta revisão.

O §3.1 lista cinco perguntas sem resposta. **Quatro delas não precisam de dado
externo nenhum** — só de agregação do que já está gravado:

| Pergunta | Do que ela sai, hoje |
|---|---|
| quantos pediram a mesma coisa? | `solicitacoes_ajuste`, agrupadas por recurso |
| que atrito se repete? | `pdca_feedback`, agrupado |
| que padrão vários times contrariam? | `ExcecaoDePadrao` + violações, agregadas por regra |
| o que a análise anterior decidiu, e o que aconteceu? | as próprias solicitações, com estado |

**Só a quinta** — *"o ajuste melhorou o resultado?"* — depende da SPEC-96.

> Ou seja: **a análise crítica pode nascer com 4/5 das perguntas respondidas**, e a
> quinta entra quando o canal existir. Isso paga em grande parte a promessa dos
> cinco times do `CONCEITO.md`, que hoje é ganho sem mecanismo.

### 4.4 As três entradas da análise, e uma delas já está gravada

> *"as melhorias, e o set de métricas que você propôs — junto com o qualitativo
> com coleta estruturada"* · *"o da configuração faz parte, precisamos de métricas
> dele"*

A análise crítica come de três fontes. Elas não se substituem, e é a terceira que
torna a primeira rodada possível:

| # | Entrada | Estado |
|---|---|---|
| 1 | **Métricas do fluxo de valor** — `%C&A` por handoff, lead/process time, clareza na chegada, a calibração (SPEC-96) | ❌ depende da porta de volta |
| 2 | **Qualitativo com coleta estruturada** — o atrito que nenhum tracker vê (SPEC-96 §6.4.1) | ⚠️ existe cru: `pdca_feedback` é **texto livre** |
| 3 | **Métricas do próprio PDCA de configuração** | ✅ **calculável hoje, sem canal nenhum** |

#### 4.4.1 O ciclo de baixo, medido — e o dado já está lá

`solicitacoes_ajuste` guarda `recurso`, `estado`, `criadoEm`, `decididoEm`,
`decididoPor`, o motivo da recusa e a `operacao` (a mudança como dado, SPEC-45).
`pdca_feedback` guarda `estado` (`novo | virou-ajuste | descartado`) e o vínculo
com a solicitação. **Disso sai um conjunto de métricas sem escrever nenhum
adaptador:**

| Métrica | Como sai | O que ela denuncia |
|---|---|---|
| **Tempo até a decisão** | `decididoEm − criadoEm` | pedido que apodrece é pedido que ensina a não pedir |
| **Taxa por estado** | contagem sobre `estado` | muita rejeição sem motivo escrito é decisão sem critério |
| **Taxa de invalidação** | `estado = invalida` | **a config muda mais rápido do que se decide** — o sinal mais interessante do conjunto |
| **Concentração por recurso** | `group by recurso` | **a regra que mais gera pedido é a regra que menos serve** — é a promessa dos cinco times, computável |
| **Conversão de sinal em ação** | `virou-ajuste ÷ total` de feedback | quanto do que se coleta vira alguma coisa |
| **Sinal que morre** | feedback em `novo` há muito tempo | **o desperdício mais caro**: o produto interrompe a pessoa a cada 3 usos para coletar o que ninguém lê |

> **A última linha é a que eu mais quero ver medida.** O produto pergunta *"o que
> faltou ou sobrou?"* a cada três gerações. Se a maior parte disso morre em `novo`,
> **estamos gastando a atenção de quem trabalha para alimentar um arquivo** — e a
> régua desta casa é que medida que ninguém contesta vira ruído. Essa vale contra
> nós.

**E ela mede o produto se avaliando com o próprio método**, que é a coerência que
o §327 e o §328 já cobraram em outras formas.

#### 4.4.2 A coleta qualitativa precisa ser estruturada — e o mínimo é pouco

Hoje `pdca_feedback.texto` é campo livre. Texto livre não agrega: não dá para
dizer *"onze pessoas relataram atrito no mesmo handoff"* sem alguém ler os onze.

O mínimo para virar medida — e nenhum destes é um formulário longo:

| Acrescentar | Por quê |
|---|---|
| **em que handoff** (do fluxo de valor já mapeado, SPEC-96 §1) | é a chave que junta o qualitativo ao quantitativo |
| **que tipo de carga** — extrínseca, intrínseca ou germane (SPEC-96 §4.0.1) | separa o que é nosso do que é de treino e contratação |
| uma escala curta, **e o texto continua** | número sem texto não diz o que fazer; texto sem número não agrega |

> **E entra marcado como declarado.** `ValorSpec.origem` já distingue declarado de
> derivado, e um dado qualitativo nunca se soma a um medido como se fossem do
> mesmo tipo. É a disciplina de proveniência do produto aplicada à própria
> melhoria.

### 4.5 O ritmo, e por que ele substitui o gatilho de uso

O gatilho atual — *"a cada 5 usos do mesmo usuário"* — mede que alguém usou o
produto, não que algo mereça ser discutido. Para o ciclo de cima, o *Hoshin* dá o
padrão: **revisões a intervalos declarados**, com escopos diferentes.

| Ritmo | O que se olha | Saída |
|---|---|---|
| **Curto** | os sinais que se movem rápido: fila de pedidos, sinal que morre, atrito repetido | ajustes, e o que sobe para o próximo |
| **Médio** | as prioridades de melhoria: os handoffs, as regras concentradoras, a calibração | **decisões de melhoria** com dono |
| **Longo** | a escada inteira: onde o time está, o que mudou desde a última | o próximo patamar, e o que ele exige |

**Os números ficam de fora desta SPEC de propósito.** *"Mensal, trimestral,
anual"* é o padrão do Hoshin e é bom ponto de partida, mas cadência é coisa que a
organização declara — e o produto já tem o lugar certo para isso: a cadência do
PDCA **já é documento de config editável** (`{cadenciaUsos, cadenciaFeedback}`).
Ela ganha um irmão, em vez de um número escrito no código.

> **O que não pode faltar, e é o que a ISO obriga:** a análise de hoje começa
> lendo **o que a anterior decidiu e o que aconteceu**. Sem isso não há ciclo — há
> uma sequência de reuniões.

---

### 4.6 O dashboard, com o fluxo mapeado

> *"eventualmente no dash, com fluxo mapeado"*

O lugar onde a análise crítica acontece. E ele tem uma vantagem que quase nenhum
painel tem: **o fluxo não precisa ser desenhado, porque já está desenhado.**

`OFluxoDoProcesso` mostra os 13 estágios em 6 fases, com a fronteira do sistema
marcada, e é dirigido por `ciclo.ts`. **O dashboard é essa peça com número em
cima** — cada handoff anotado com o que se sabe dele.

| Camada | O que aparece |
|---|---|
| **O fluxo** | a peça que já existe, sem redesenhar |
| **Sobre cada handoff** | o que houver: `%C&A`, atrito relatado, pedidos concentrados. **Handoff sem dado aparece sem dado** |
| **Ao lado** | a fila da análise: o que a anterior decidiu, o que venceu, o que espera |

> **A régua que decide o desenho:** *handoff sem medição aparece vazio, e não em
> cinza-otimista.* É a mesma disciplina do ciclo — estágio ausente aparece
> marcado. Um painel que preenche buraco com estimativa é a promessa falsa mais
> fácil de cometer, porque parece competência.

E é aqui que o **patamar** ganha sentido de tela: ele não é um selo no topo, é a
leitura do mesmo painel — *"a sua camada está estruturada aqui, executável ali, e
não medida acolá"*.

---

## 5. O método de quebra, explicado — e a tensão que ele tem

A segunda pergunta: *"qual é o método de quebra em histórias e tasks, como ele
funciona? porque existe?"*

### 5.1 O que o código faz hoje

`packages/engine/src/derive/derivar.ts` deriva **do modelo, por elemento do
desenho**:

- um nó `service` com status `novo` → uma História de *setup*;
- cada `endpoint` declarado nele → uma História própria, dependente do setup;
- arestas e integrações → itens de conexão, com os times envolvidos;
- violação de padrão → item, **exceto** as aceitas de propósito (§242 — gerar
  trabalho para o que alguém já decidiu é o jeito mais rápido de ensinar a
  ignorar o backlog);
- percurso **confirmado** → item (§249 — só os confirmados: derivar de um palpite
  do motor seria inventar trabalho).

Chave estável (`Atividade.chave`), tamanho, dependências legíveis e origem
(`origem.nodeId`). **Mesma quebra ⇒ mesma chave ⇒ mesmos itens.**

### 5.2 A tensão com o vocabulário de mercado, dita em voz alta

A literatura de *story splitting* — os padrões de **Richard Lawrence**, o
**vertical slicing** — é quase unânime: fatiar por camada ou por componente é o
**anti-padrão**; a fatia boa é vertical, atravessa as camadas e entrega valor
demonstrável ao usuário.

**Derivar por elemento do desenho é, na cara, fatiar por componente.** Ignorar
isso na landing seria escrever material de marketing que um agilista experiente
desmonta em trinta segundos.

A resposta honesta, e ela é boa:

1. **O que o motor deriva não é o corte final — é o inventário completo do que o
   desenho implica.** Nenhum item é esquecido, e cada um tem origem rastreável.
   Isso é o oposto do que um workshop de fatiamento entrega, e é complementar a
   ele.
2. **O corte vertical existe no produto, e tem nome: o percurso.** Um percurso
   confirmado atravessa os componentes ponta a ponta — é exatamente a fatia
   vertical, e ela **também** deriva item.
3. **A fatia vertical é julgamento, e julgamento é de gente.** É a mesma régua da
   SPEC-80: *"as seções que carregam julgamento não podem ser escritas pelo
   modelo"*. O motor entrega o material completo e rastreável; quem decide o
   recorte de entrega é o time.

> Esta é uma **lacuna consciente** no sentido da SPEC-69, e o lugar dela é a
> landing, não um rodapé: dizer *"derivamos tudo, e o corte de valor é seu"* é
> mais forte e mais verdadeiro que fingir vertical slicing automático.

### 5.3 O que a peça precisa mostrar

Um diagrama que vá **do desenho ao item**, marcando o que é do motor e o que é de
gente — e dirigido pelo mesmo dado, como as sete peças existentes. Um desenho de
exemplo entra, e sai a lista de itens **com a origem de cada um**.

---

## 6. O valor para a organização — e ele já está escrito

A terceira pergunta: *"como esse sistema pode agregar valor a organização?"*

**A resposta já existe e ninguém a mostrou na página.** O `CONCEITO.md` tem a
tabela *"Os ganhos, e o mecanismo de cada um"*, com sete linhas e a coluna da
direita obrigatória (SPEC-83 §2: *todo ganho tem mecanismo*).

O trabalho desta SPEC **não é escrever o valor — é desenhá-lo**, e cruzá-lo com o
patamar:

| Patamar | O ganho que aparece primeiro |
|---|---|
| 1–2 **Tácito/Escrito** | *"a demanda não começa do zero"* — a camada para de se recolar a cada vez |
| 3 **Estruturado** | *"está pronto?" deixa de ser opinião* — lacuna contável, o documento diz o número |
| 4 **Executável** | *"dá para usar IA onde há auditoria"* — nada que a IA propõe conta antes da confirmação |
| 5 **Evoluído** | *"a régua da casa não fossiliza"* — PDCA sobre a própria configuração |

Isso responde *"como agrega valor"* sem uma frase de folheto: **o valor é
diferente conforme de onde a organização parte**, e essa é a mesma ideia que o
usuário trouxe sobre o passo curto e o caminho longo.

### 6.1 ⚠️ O ganho que falta na tabela canônica: **times nivelados**

> *"as páginas iniciais que explicam os conceitos deixam passar que o sistema
> também entrega valor ao padronizar as quebras. Se diversos times usarem o
> sistema, ficam nivelados nesse sentido, o que é um ganho de governança."*

**Conferido: não está lá.** As sete linhas da tabela *"Os ganhos, e o mecanismo de
cada um"* do `CONCEITO.md` falam todas do **time consigo mesmo** — discordar sem
refazer, medida contestável, lacuna contável, proveniência, PDCA. **Nenhuma fala
de um time em relação a outro.**

E o site do §342 herdou o buraco, porque ele desenha o que o `CONCEITO.md` diz.

#### O mecanismo, e ele é estrutural — não é treinamento

| Peça | Por que produz nivelamento |
|---|---|
| **Derivação determinística** | mesmo desenho + mesma config ⇒ mesmos itens. Dois times com desenhos equivalentes produzem quebras com a **mesma estrutura**, sem combinar nada |
| **Catálogo de stacks é da ORGANIZAÇÃO** (SPEC-43) | `stacks {organizacao_id, tipo_no, …}`, **sem ponteiro de time**: quem usa um Serviço herda a mesma stack, em qualquer time |
| **Template do item é config** (SPEC-47) | o corpo do item sai do mesmo modelo |
| **Checklist por contexto** | a mesma tecnologia no mesmo contexto cobra a mesma coisa |

> **A consistência não vem de as pessoas seguirem um padrão — vem de o padrão ser
> o que produz o artefato.** É a diferença entre publicar um guia e gerar a partir
> dele, e é exatamente por isso que este ganho é forte: ele não depende de
> disciplina, adesão nem lembrança.

#### Isto tem nome, e é o degrau que a escada já tinha

No CMMI, a fronteira entre o nível 2 e o 3 **é precisamente esta**: *Managed* é
processo controlado **por projeto**; *Defined* é processo padronizado **na
organização**, adaptado por projeto. O ganho que o usuário apontou é o que faz um
time sair de "temos nosso jeito" para "temos o jeito da casa".

Isso encaixa na escada do §2.1 sem mudá-la, e **acrescenta a ela uma dimensão que
faltava**: os patamares mediam a profundidade da camada (tácito → executável) e
não mediam o **alcance** dela. Um time sozinho no patamar 4 e cinco times no
patamar 3 são situações diferentes, e a segunda vale mais para a organização.

#### E ele é mensurável — vira métrica, não adjetivo

**Variação entre times**: quanto as quebras de times diferentes divergem em
estrutura, dado o mesmo tipo de componente. Se a configuração é compartilhada, a
variação cai — e a queda é a evidência.

É medível com dado que já existe (as quebras e os itens derivados), **sem canal
externo**, e entra no set do §4.4 junto com as métricas do PDCA de configuração.

> **A régua de honestidade aqui é dura, e precisa ser dita:** nivelamento é ganho
> **e** é risco. Padronizar o que deve variar é o defeito clássico da governança
> corporativa — o mesmo que faz um time inventar um jeito paralelo para dar conta
> do trabalho. É por isso que o produto tem **exceção com motivo e autor**
> (`ExcecaoDePadrao`) e o PDCA para mudar a regra: **a saída não é burlar, é
> discordar de forma registrada.** Uma página que vender uniformidade sem dizer
> isso está vendendo o defeito.

#### O que fazer com isso

1. **A tabela do `CONCEITO.md` ganha a linha** — ele é a fonte canônica, e o site
   desenha o que ele diz. É a menor mudança com maior alcance desta seção.
2. **A escada ganha a dimensão de alcance** (§2.1): profundidade × quantos times.
3. **A métrica de variação entra no set** (§4.4).
4. **A página do valor mostra** — e mostra junto com a válvula de escape, pelo
   motivo acima.

---

## 7. O que esta SPEC RECUSA

- **Questionário de auto-declaração de maturidade.** É o oposto da tese do
  produto. Se algum dado não for derivável, ele é **declarado e marcado como
  declarado** — `ValorSpec.origem` já faz exatamente isso.
- **Nota única de maturidade.** "Sua empresa é nível 3" é consultoria, não
  medição. O patamar é por área, e o do time é o mínimo, com o buraco visível.
- **Usar a palavra "nível".** Colide com `auth/niveis.ts` (SPEC-38).
- **Estatística de terceiros apresentada como nossa.** Os números do §1.1 são de
  ISACA/CMMI e da imprensa de mercado. Na página, só com fonte e data — e a
  SPEC-83 §2 continua valendo: nada de *"aumente a produtividade em 40%"*.
- **Prometer que o produto sozinho sobe o patamar da organização.** Ele mede,
  mostra o próximo passo e é o lugar onde a camada mora. Quem sobe o patamar é o
  time. Prometer o contrário é a promessa falsa mais cara desta SPEC.
- **Publicar a escada antes de existir análise crítica.** Um selo de maturidade
  sem o mecanismo que o move é retrato — e retrato de maturidade é o que os
  *appraisals* de mercado já vendem (§2).
- **Chamar de PDCA o que não tem etapa de análise.** É o achado do §3, e vale
  contra nós: o produto usa a palavra hoje para um ciclo que não a tem.
- **Coletar feedback que ninguém lê.** Se a métrica do sinal que morre (§4.4.1)
  vier alta, a resposta certa é **parar de perguntar** ou passar a responder —
  nunca deixar como está. Interromper quem trabalha para alimentar um arquivo é
  pior que não coletar.
- **Vender nivelamento entre times sem a válvula de escape** (§6.1). Padronizar o
  que deve variar é o defeito clássico da governança corporativa.
- **Deixar a camada analítica com IA produzir número.** Ela narra o que o motor
  calculou (SPEC-96 §6.4.4); uma IA que soma erra em silêncio.
- **Comparar o time com outros times ou com "o mercado".** Não temos amostra, e
  fabricar uma seria o número de conversão inventado com outra roupa.
- **Refazer os diagramas existentes.** De novo: o usuário gostou deles.

---

## 8. Fatias

> **Isto é maior que uma rodada.** A ordem abaixo é de dependência, não de
> preferência.
>
> ## ⚠️ A revisão do §343 mudou a ordem
>
> A primeira escrita abria pela fatia A (a escala de maturidade). **A escala saiu
> da frente**, e por dois motivos que a revisão mediu:
>
> - **maturidade não é retrato, é mecanismo** — publicar a escada antes da análise
>   crítica entrega um selo que ninguém sabe como mudar;
> - **o topo dela é casa vazia** (§2.2.1) enquanto não houver Study.
>
> As fatias novas — **Z, Y, X** — vêm antes por isso, e a boa notícia é que **duas
> delas não dependem de canal externo nenhum**.
>
> - **Z — as métricas do ciclo de baixo.** O que o §4.4.1 lista, calculado do que
>   já está gravado em `solicitacoes_ajuste` e `pdca_feedback`: tempo até decisão,
>   taxa de invalidação, concentração por recurso, e **quanto sinal morre em
>   `novo`**. **Prova:** nenhum número digitado; e a métrica do sinal que morre
>   roda contra o banco real, porque ela é a que pode acusar o próprio produto.
>
> - **Y — a coleta qualitativa estruturada.** `pdca_feedback` ganha **handoff** e
>   **tipo de carga** (§4.4.2), e o texto continua. **Prova:** o dado entra
>   marcado como declarado; e é possível dizer *"N relatos no mesmo handoff"* sem
>   ninguém ler os N.
>
> - **X — a análise crítica como objeto.** Entradas e saídas declaradas (§4.1),
>   com **a consequência da análise anterior como entrada obrigatória**, e um
>   ritmo que é configuração, não constante (§4.5). **Prova:** uma análise sem a
>   leitura da anterior não fecha; uma que termina sem decisão com dono não fecha.
>
> - **W — o dashboard sobre o fluxo já mapeado** (§4.6). **Prova:** handoff sem
>   medição aparece **vazio**, nunca estimado.
>
> Só então as fatias abaixo. E a **A** ficou mais barata do que parecia: §2.4
> mediu que a máquina de avaliar cobertura existe, apontada para a demanda.

- **A — o patamar como DADO e como cálculo.** `maturidade/patamares.ts`: os cinco
  patamares, e a função que os deriva do que está preenchido, por área.
  **Prova:** um time de fixture vazio dá patamar 1; povoar `RegrasConfig` com
  `checagem` sobe a área para 4; nenhum patamar é digitado em lugar nenhum.

- **B — o diagnóstico na tela.** Onde o time se vê: por área, com o patamar, a
  evidência que o produziu e **qual é o próximo passo concreto** ("três tipos de
  componente sem campo obrigatório"). **Prova:** todo patamar exibido tem link
  para a área que o gerou; nenhum texto de patamar sem evidência ao lado.

- **C — a peça do método de quebra.** O diagrama desenho → itens, com o que é do
  motor e o que é de gente, e a lacuna do §3.2 dita. **Prova:** desenhada de um
  desenho real via `derivar()`, e nenhum item aparece sem origem.

- **D — a peça da maturidade, animada.** O pedido explícito do usuário: *"um
  diagrama de apoio, com animações para explicar isso"* — o passo curto de quem
  tem processo e o caminho longo de quem não tem. É a **única** peça animada nova,
  e a régua da SPEC-85 §2 vale: *movimento que não carrega informação que o
  estático não carrega, não entra.* Aqui ele carrega — a **distância** entre os
  dois percursos é a informação, e distância percorrida no tempo é o que um
  diagrama estático só consegue afirmar.

- **E — o valor cruzado com o patamar.** A tabela do §4, desenhada, saindo dos
  mesmos dados dos ganhos.

- **F — os atos novos na landing, e o storytelling.** O usuário pediu que
  *"converse com o resto"*. **Cuidado medido:** a barra de navegação tem cinco
  itens e foi dimensionada para isso — em 360 px ela já rola com cinco (§341).
  Oito itens não cabem, e a saída **não** é encolher a fonte. Provavelmente a
  maturidade entra **antes** de "A tese" (é a pergunta *"isto serve para mim?"*,
  que vem antes de *"o que é isto?"*), e quebra e valor entram **dentro** dos
  atos existentes. **Prova:** as travas do §341 continuam verdes — inclusive o
  teto de prosa e a de repetição.

- **G — as travas.** Nenhum patamar sem evidência; a palavra "nível" não volta
  para este vocabulário; e nenhum número de terceiro sem fonte e data.

> **Sugestão de corte:** **A+B numa rodada** (é o produto, e é o que o usuário
> escolheu ao pedir diagnóstico), **C+D+E noutra** (são as peças), **F+G na
> terceira**. Fatia D depois de A não é capricho: uma animação sobre uma escala
> que ainda não existe seria desenho de conceito, e desenho de conceito envelhece
> em separado do produto — que é o defeito que a SPEC-82 §4.3 recusou.

---

## 9. Perguntas em aberto

1. **O patamar é do time ou da organização?** `usuario_time` já é N:N com nível
   de acesso por vínculo. A camada perene é configurada por time, mas "maturidade
   da organização" é a pergunta que um diretor faz. **Recomendação:** medir por
   time, e deixar a agregação para quando existir mais de um time medido — uma
   média de dois times é um número sem significado.

2. **O que fazer com quem mede patamar 1 no primeiro dia?** Todo time novo começa
   vazio. Mostrar "patamar 1 — tácito" na primeira tela é receber alguém dizendo
   que ele está mal. **Recomendação:** o diagnóstico só aparece depois de haver o
   que medir, e o texto do patamar 1 fala de **próximo passo**, nunca de nota.
   Isto precisa ser desenhado com cuidado — é o ponto onde esta SPEC pode
   produzir uma tela que afasta.

3. **A maturidade muda o que o produto cobra?** O usuário disse *"muito bem
   mapeado no sistema"*, e a leitura forte é: um time no patamar 2 não deveria
   levar as mesmas cobranças de um no 4. Isso é adaptar a régua ao patamar — e é
   **poderoso e perigoso**: silenciar cobrança porque o time é imaturo é ensinar
   a não amadurecer. **Recomendação:** o patamar muda a **ordem do que se sugere**,
   nunca o que se mede. A medição continua inteira e visível.

4. **Citar CMMI pelo nome na página?** Abre porta em organização grande e pode
   soar pesado para time pequeno — é a mesma tensão que a SPEC-92 §7.1 levantou
   sobre jargão de governança. **Recomendação:** a escada é nossa e em português;
   a equivalência com CMMI aparece como **nota lateral**, para quem procura por
   ela.

5. ~~**Quanto do patamar 5 é mensurável hoje?**~~ **✅ Respondida, e a resposta é
   "nada".** O §2.3 mediu: não existe série temporal no sistema, então não há
   linha de base, e sem linha de base não há como provar melhoria. **O patamar 5
   é casa vazia por falta de infraestrutura, não por falta de uso** — e a
   pergunta certa passou a ser: **a fatia da tabela `medicoes` vem antes da
   escala?**

   **Recomendação: vem.** Publicar uma escada cujo topo é inalcançável por
   construção é vender um degrau que não existe — a mesma promessa falsa que a
   SPEC-76 impediu na prosa. Ou a escala nasce com quatro patamares e o quinto
   declarado como "ainda não medimos isto", ou a `medicoes` vem primeiro.

---

## 10. Para quem implementar: o mínimo antes de começar

- `CONCEITO.md` — a fonte canônica. A tabela de ganhos (§4) e o verbete
  *"governança executável"* (§2) saem daqui.
- `packages/engine/src/derive/derivar.ts` — o método de quebra, para a fatia C.
- `packages/web/src/navegacao/rota.ts` — `SEGMENTO_DA_AREA`, as 13 áreas de
  configuração que a fatia A precisa varrer.
- `packages/server/src/auth/niveis.ts` — para **não** reusar a palavra.
- `packages/web/src/demo/atos.ts` e `landing.travas.test.tsx` — a estrutura da
  landing e as travas que a fatia F não pode afrouxar (§341).
- `SPEC-39` (PDCA de configuração) — **leia inteira**: é o ciclo de baixo, e o §3
  desta SPEC é sobre o que falta nele.
- `packages/server/src/db/schema.ts` — `solicitacoes_ajuste` e `pdca_feedback`.
  **É de onde saem as métricas da fatia Z**, sem canal externo.
- `SPEC-43` (stacks globais) — o mecanismo do nivelamento entre times (§6.1).
- `SPEC-96` — as métricas, as duas derivações e a contenção da camada analítica.
  As duas SPECs pedem a mesma peça (a porta de volta), e ela paga as duas.
- `SPEC-83 §2` — *todo ganho tem mecanismo*. É a régua que a fatia E não pode
  quebrar.
- **`JOURNEY.md` §341** — a rodada que construiu a apresentação, e que registra
  por que a barra de navegação não comporta oito itens.

### As fontes da pesquisa do §1

- CMMI AIM, ISACA/CMMI Institute (2026) — <https://www.isaca.org/about-us/newsroom/press-releases/2026/cmmi-institute-launches-new-cmmi-ai-maturity-model-to-strengthen-ai-governance>
- MITRE AI Maturity Model — <https://witness.ai/blog/mitre-ai-maturity-model/>
- CMU SEI + Accenture, AI Adoption Maturity Model — <https://techjacksolutions.com/ai-brief/the-cmuaccenture-ai-maturity-model-how-to-use-an-eight-dimen/>
- CMMI, os cinco níveis — <https://en.wikipedia.org/wiki/Capability_Maturity_Model_Integration>
- *readiness × adoption × maturity* — <https://www.ishir.com/blog/341021/organizational-ai-readiness-in-2026-why-ai-adoption-and-ai-maturity-require-a-new-operating-model.htm>
- Story splitting / vertical slicing — <https://www.visual-paradigm.com/scrum/user-story-splitting-vertical-slice-vs-horizontal-slice/>

### As fontes da revisão do §343

- ISO 9001 §9.3, análise crítica pela direção (entradas e saídas obrigatórias) — <https://advisera.com/9001academy/knowledgebase/how-to-make-a-management-review-meaningful/>
- Deming, *PDSA e não PDCA* — *"I don't use check. Check is too closely associated with inspection"* — <https://deming.org/explore/pdsa/>
- PDCA × PDSA, a diferença entre *Check* e *Study* — <https://blog.simana.com/pdsa-and-pdca-whats-the-difference>
- **Hoshin Kanri** — cascata, *catchball* e o ritmo de revisão em três horizontes — <https://www.lean.org/lexicon-terms/hoshin-kanri/>
- CMMI 2 → 3, *Managed* (por projeto) × *Defined* (padrão da organização) — <https://en.wikipedia.org/wiki/Capability_Maturity_Model_Integration>
