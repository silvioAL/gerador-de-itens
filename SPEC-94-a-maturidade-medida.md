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

---

## 0. O que esta SPEC faz, em uma frase

Transforma a intuição do usuário — *"é preciso maturidade de processo para usar
isto"* — em **um conceito de primeira classe do produto, medido a partir do que
já está preenchido**, e usa esse conceito para responder às outras duas perguntas
que ele fez: qual é o método de quebra, e o que a organização ganha.

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
| 4 | **Executável** | a regra **roda**: réguas com número, checagens que produzem apontamento e derivam item | há `Requisito` **com** `checagem`, e tokens de design system | 4 — *Quantitatively Managed* |
| 5 | **Evoluído** | a régua muda a partir do uso, com prévia e aprovação | há ajustes de PDCA **aplicados** sobre a configuração (SPEC-39) | 5 — *Optimizing* |

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

---

## 3. O método de quebra, explicado — e a tensão que ele tem

A segunda pergunta: *"qual é o método de quebra em histórias e tasks, como ele
funciona? porque existe?"*

### 3.1 O que o código faz hoje

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

### 3.2 A tensão com o vocabulário de mercado, dita em voz alta

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

### 3.3 O que a peça precisa mostrar

Um diagrama que vá **do desenho ao item**, marcando o que é do motor e o que é de
gente — e dirigido pelo mesmo dado, como as sete peças existentes. Um desenho de
exemplo entra, e sai a lista de itens **com a origem de cada um**.

---

## 4. O valor para a organização — e ele já está escrito

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

---

## 5. O que esta SPEC RECUSA

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
- **Comparar o time com outros times ou com "o mercado".** Não temos amostra, e
  fabricar uma seria o número de conversão inventado com outra roupa.
- **Refazer os diagramas existentes.** De novo: o usuário gostou deles.

---

## 6. Fatias

> **Isto é maior que uma rodada.** A ordem abaixo é de dependência, não de
> preferência, e a fatia A é a que decide o resto.

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

## 7. Perguntas em aberto

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

5. **Quanto do patamar 5 é mensurável hoje?** O PDCA existe (SPEC-39), mas não
   medi quantos ajustes aplicados um time real acumula. **Se for raro, o patamar 5
   é uma casa quase sempre vazia** — e uma escala cujo topo ninguém alcança
   desmotiva em vez de guiar. Isto precisa ser medido **antes** da fatia A.

---

## 8. Para quem implementar: o mínimo antes de começar

- `CONCEITO.md` — a fonte canônica. A tabela de ganhos (§4) e o verbete
  *"governança executável"* (§2) saem daqui.
- `packages/engine/src/derive/derivar.ts` — o método de quebra, para a fatia C.
- `packages/web/src/navegacao/rota.ts` — `SEGMENTO_DA_AREA`, as 13 áreas de
  configuração que a fatia A precisa varrer.
- `packages/server/src/auth/niveis.ts` — para **não** reusar a palavra.
- `packages/web/src/demo/atos.ts` e `landing.travas.test.tsx` — a estrutura da
  landing e as travas que a fatia F não pode afrouxar (§341).
- `SPEC-39` (PDCA) — o patamar 5 depende dela.
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
