# SPEC-83 — A landing que explica o problema, e não se repete

> **Origem:** o usuário, em três mensagens.
>
> A primeira, com as telas na mão:
>
> > *"a parte após o ciclo com todos pontos verdes precisa ser revista, pois está
> > meio repetitiva, a idéia é que fique com cara de landing page de verdade,
> > verificar explicações melhores, remake do layout (mantendo em alguma parte a
> > idéia do círculo e dos pontos verdes, mas também ter outros elementos,
> > eventualmente imagens…)"*
>
> A segunda, que é a que muda o peso desta SPEC:
>
> > *"precisa constar que nessa página devemos resolver a explicação conceitual
> > dos problemas que o sistema resolve, no sentido de tornar **governança e os
> > padrões corporativos em algo perene para trabalhar com suporte de IA**, que é
> > a demanda que algumas organizações têm. Muitas têm acesso a ferramentas e
> > estão com seus agentes de IA e skills do Claude, **mas isso não tem sido o
> > suficiente**: precisa de uma **camada sistêmica perene e determinística que
> > comporte os processos**. É necessário explicar isso e a evolução do trabalho
> > com IA nesse sentido, que se conecta com o conceito que estamos explicando
> > naquele diagrama da tela inicial."*
>
> A terceira:
>
> > *"além disso, é necessário explicar os conceitos: o que é SDD, explicar que o
> > **desenho também é dirigido por specs** e tudo mais, ter mais diagrama que
> > explique os conceitos e as **camadas** — a camada de processos, perene,
> > apontamentos, como se relaciona com a parte da IA generativa. Nessa spec
> > também vamos aproveitar para **atualizar o README**."*

É a última das cinco rodadas deste bloco, porque as SPEC-79, 80 e 81 mudam as
marcas que esta página mostra. Mas deixou de ser uma rodada de layout: **é a
rodada em que o produto passa a dizer que problema resolve.**

---

## 0. A medição

### 0.1 A landing hoje

`packages/web/src/demo/LandingPage.tsx`, 84 linhas, nesta ordem: header com
"Entrar"; `<h1>` *"Do diagrama ao backlog, sem inventar nada"*; um parágrafo;
`<CicloDoProduto />` (13 estágios); `<Jornada />` (que é `OMotor()` + 5 etapas
numeradas); botão "Entrar pra começar".

**A repetição tem causa exata, e é medível.** Das 5 etapas da `Jornada`, **4 são
estágios que o círculo acabou de mostrar**:

| Etapa da `Jornada` | Estágio do ciclo já mostrado |
|---|---|
| 1 · Diagrama | `desenho` — "Desenhar a solução" |
| 2 · Prontidão | `prontidao` — "Medir o que está pronto" |
| 3 · Derivar | `itens` — "Derivar os itens" |
| 5 · Especificação de solução | `especificacao` — "Especificar com a IA" |

A quinta (4 · Revisão) **não tem estágio correspondente** — descreve a detecção
de ciclos de dependência, que vive dentro de `itens`.

### 0.2 A tese está escrita em QUATRO lugares

O `OMotor()` (`Jornada.tsx:59`) reconta a divisão motor × IA. E ele não é o
segundo lugar — é o quarto:

| Onde | A frase |
|---|---|
| `Jornada.tsx:82` | *"A divisão de trabalho é toda a ideia"* |
| `README.md:79` | `### A divisão de trabalho, que é a ideia toda` |
| `CONCEITO.md:27` | `## A divisão de trabalho` |
| `ciclo.ts` | o estágio `especificacao`, e o centro do círculo |

**Quatro fontes, nenhuma canônica.** É o §263 — duas explicações da mesma coisa
dessincronizam — em escala que ninguém tinha medido, porque cada uma está certa
isoladamente.

### 0.3 O layout é de documento, não de página

A landing inteira é **uma coluna de 760 px** (`conteudoEstilo`, `:69`). Sem
seção de largura total, sem alternância, sem ritmo. Nenhuma troca de texto
conserta isso — o problema é estrutural.

### 0.4 O README

358 linhas, e boas: `README.md:31-125` explica o motor com cuidado. Mas a
estrutura é de **guia de instalação** — depois do motor vem "Testes", "Início
rápido", Docker, Qwen, voz, imagem, produção, solução de problemas.

**Não há, em lugar nenhum dele, que problema o produto resolve.** Ele explica
o que a ferramenta faz para quem já decidiu usá-la.

## 1. O que a página tem que explicar, e hoje não explica

Esta é a seção que a segunda mensagem do usuário criou, e ela vem **antes** de
qualquer coisa sobre layout.

### 1.1 A demanda, nas palavras de quem a descreveu

> *"muitas [organizações] têm acesso a ferramentas e estão com seus agentes de
> IA e skills do Claude, mas **isso não tem sido o suficiente**."*

O gargalo declarado **não é falta de IA**. É que governança e padrão corporativo
vivem em lugares que a IA não alcança de forma verificável: cabeça de gente,
wiki desatualizada, PDF de arquitetura, o costume do time. Cada agente reconstrói
esse contexto do zero, em cada conversa, sem que ninguém possa conferir se ele
reconstruiu certo.

> **Premissa declarada, não medida.** Isto é o que o usuário observa no mercado
> dele, e esta SPEC o registra como premissa — não como dado que este
> repositório tenha apurado. A distinção importa: se a premissa mudar, a página
> muda junto, e é bom saber disso por escrito.

### 1.2 A evolução do trabalho com IA — e é isto que a página precisa contar

Três estágios, e o produto se posiciona no terceiro:

1. **O prompt.** Uma pessoa pergunta, recebe texto. Nada persiste, nada é
   reaproveitável, nada é conferível. Cada conversa recomeça do zero.
2. **O agente, a skill, o arquivo de instrução.** A instrução vira arquivo
   reutilizável — é onde a maior parte das organizações está hoje, e é progresso
   real. Mas continua sendo **texto dizendo ao modelo o que fazer**: não mede
   nada, não deriva nada, e nada do que afirma é conferível. Dois agentes com
   instruções que se contradizem não acusam o conflito — os dois respondem com
   confiança.
3. **A camada.** A regra deixa de ser texto e vira **dado consultável e
   medível**: tipos, campos obrigatórios, réguas com número, checklists por
   contexto, templates versionados. O agente opera *dentro* dela. O que persiste
   não é o prompt — **é a régua.**

> A frase que a página precisa conseguir dizer: **as organizações não estão sem
> ferramenta de IA. Estão sem o lugar onde a regra da casa mora de um jeito que a
> IA possa ser medida contra ela.**

### 1.3 O diagrama do centro contido JÁ é essa tese

O usuário fez a ligação — *"se conecta com o conceito que estamos explicando
naquele diagrama da tela inicial"* — e ela é exata. O círculo com **"IA — propõe,
nunca aplica sozinha"** no meio e os estágios em volta é literalmente o estágio 3
desenhado: a IA contida, e a camada perene ao redor dela.

**O diagrama está certo e a página não diz o que ele significa.** Hoje ele é lido
como "mapa de funcionalidades". É a tese inteira, e ninguém contou.

### 1.4 A manchete descreve um fluxo que termina — e foi decidido trocá-la

> *"e sim, precisamos reformular: não é até o backlog, é esse conceito que
> acompanha processos."* — o usuário, decidindo.

O `<h1>` de hoje é **"Do diagrama ao backlog, sem inventar nada"**. Ele promete
um trajeto com **destino**: entra desenho, sai backlog, acabou.

É o mesmo defeito que o §314 encontrou no conteúdo da página — *"descrevia um
fluxo de cinco passos, não um ciclo que fecha"* — **sobrevivendo na manchete**.
A SPEC-76 consertou o corpo e não olhou para o título; ele é a última peça do
enquadramento antigo ainda de pé, e é a primeira coisa que alguém lê.

E a manchete erra duas vezes, não uma:

1. **"ao backlog" é um fim**, e o produto não termina — ele volta (o estágio
   `pdca`, que é o coração do círculo);
2. **ela descreve o mecanismo**, quando o que precisa aparecer primeiro é o
   **problema** da §1: a camada que sobrevive às demandas e acompanha o processo
   da casa.

> A manchete nova precisa dizer **permanência**, não trajeto. Não é "de A até B":
> é *o que fica*, demanda após demanda, e a IA trabalhando dentro disso.

**Isto é decisão, não sugestão** — a §10 não a lista mais como pergunta. O que
continua valendo é a cautela do tour: a frase exata se escreve na fatia A, junto
do `CONCEITO.md`, e não no impulso. Trocar manchete por moda foi como o tour
envelheceu.

## 2. Os conceitos que precisam estar escritos

### 2.1 SDD, e o duplo sentido de "dirigido por spec"

*Spec-Driven Development* — construir a partir de uma especificação estruturada,
em vez de a partir de um chamado ou de um prompt. O termo é recente e disputado;
a página precisa **explicá-lo, não citá-lo como se todo mundo soubesse**.

E o produto tem uma posição incomum, que é o que o usuário pediu para deixar
claro: **a spec dirige o desenho, não o documenta.**

Isto não é retórica — é `FieldSpec` e `NodeTypeConfig`
(`engine/src/config/types.ts:46` e `:72`). Um componente de um tipo **precisa**
declarar os campos que a spec daquele tipo exige; o que falta vira apontamento,
e o que contraria vira item de trabalho. Você não desenha e depois documenta:
**a spec do time é o que torna o desenho possível de completar.**

São, então, dois sentidos, e a página tem que dar os dois:

- **para dentro** — o desenho é dirigido pela spec de configuração do time;
- **para fora** — o produto passa a gerar specs consumíveis por agente de
  código (SPEC-80).

### 2.2 As camadas

O que o usuário chamou de *"a camada de processos, perene, apontamentos, como se
relaciona com a parte da IA generativa"*. São quatro, e todas já existem no
código — o que falta é alguém dizer que existem:

| Camada | O que é | Onde vive hoje |
|---|---|---|
| **Perene** | o que não muda a cada demanda: contexto do produto, padrões por tecnologia, checklists por processo e negócio, réguas, templates, volumetria do produto, design system (SPEC-79) | as áreas de configuração, versionadas, com PDCA |
| **Da demanda** | o que é desta vez: o desenho, a volumetria declarada, os ensaios, as decisões e o que foi recusado | a quebra |
| **Apontamentos** | o que o motor **calcula**: prontidão, lacunas contáveis, itens derivados, o que contraria padrão, o que estoura régua | nunca digitada — e some quando a causa some |
| **IA generativa** | escreve o *texto* dentro do que as três acima determinam | contida, e nada dela conta antes da confirmação |

> A camada de apontamentos é a que ninguém desenha e a que explica o produto: ela
> **não é armazenada como verdade**, é recalculada. É por isso que o mesmo desenho
> sempre dá os mesmos itens, e por isso que discordar de um apontamento é mudar
> uma regra — não apagar uma linha.

**E a camada perene não termina neste produto.** O repositório de ADR da casa e a
arquitetura de negócio dela são perenes pelos mesmos motivos, e hoje vivem fora —
que é precisamente o *"a governança mora onde a IA não alcança"* da §1.1. A
**SPEC-81 §1.3** liga os dois, e o achado que a torna barata vale a esta página:
**o produto já escreve ADR** — `Decisao` tem `contexto`, `alternativas`,
`escolhida`, `porque`, `status` e `substituidaPor` — ancorado no elemento do
desenho e no ensaio que o justificou. A palavra nunca chegou à superfície.

> Consequência para o texto da landing: quando ela disser *camada perene*, o
> leitor de organização grande vai perguntar *"e o que eu já tenho?"*. A resposta
> honesta hoje é **"conversa com o que você já tem, e isso é a SPEC-81"** — não
> "substitui".

### 2.3 O vocabulário — e a ironia que a medição encontrou

> *"tenho impressão que parte do vocabulário precisa ser enriquecido, me chama
> atenção por exemplo a questão de **modelo canônico**, **processos**, e os
> **schema dos processos** que colocam a IA no centro, **IA driven**."* — o
> usuário.

A medição confirma a impressão, e de um jeito que vale registrar:

- **"canônico" já aparece 4× no repositório** — `repositorioDeQuebras.ts:27`
  ("a forma canônica aqui é a do produto"), `estruturarDocumento.ts:39` ("o
  markdown permanece a renderização textual canônica"), `RegrasTab.tsx:74` ("as
  techs canônicas"). **Sempre em sentido local, nunca como o conceito.** A ideia
  está no código há tempo; a palavra nunca foi promovida a vocabulário.
- E a ironia: **`Produto` tem um campo `glossario`.** A ferramenta exige que toda
  organização declare o glossário dela — *"o glossário da casa"*, nas palavras do
  próprio estágio `contexto` — **e não tem um.**

A fatia A passa a produzir esse glossário. Cada termo com uma definição de uma
frase e a **âncora no código** — porque termo sem âncora vira jargão, e jargão é
o que esta página não pode ter.

| Termo | O que é | Onde vive |
|---|---|---|
| **Modelo canônico** | a representação estruturada única de que **tudo o mais é projeção**: itens, documento, apontamentos, spec. É por isso que o mesmo desenho dá sempre os mesmos itens — não há segunda fonte para divergir | `Diagrama` + `DiagramaConfig` |
| **Processo** | o jeito da casa de fazer: o que se confere, em que ordem, em que contexto, com que prova | `checklistProcesso: ItemProcesso[]` |
| **Schema de processo** | esse jeito escrito como **estrutura versionada e medível**, não como texto: exigência com contexto, com o porquê, e com checagem quando é calculável | `Requisito`, `Checagem`, `TesteAutomatizado`, `Condicao` |
| **Camada perene** | o que não se recola a cada demanda | as áreas de configuração, com PDCA |
| **Apontamento** | o que o motor **calcula** e não guarda como verdade — some quando a causa some | prontidão, lacunas, itens derivados |
| **Proveniência** | de onde cada valor veio, viajando junto com ele | `ValorSpec.origem` |
| **Governança executável** | regra que **roda**, em vez de regra que está documentada | a diferença entre `Requisito` com e sem `checagem` |

### 2.4 "IA no centro" — a ambiguidade que precisa ser resolvida, não evitada

O usuário juntou duas coisas que parecem opostas: *schemas de processo* e *IA no
centro, IA driven*. **Não são opostas — é a tese inteira em quatro palavras**, e
o diagrama já a desenha literalmente.

Mas "centro" tem duas leituras, e a página vai ser lida das duas:

- **centro como protagonista** — a IA decide, o resto serve a ela. É o que a
  maior parte do mercado quer dizer com *AI-driven*, e **não é este produto**;
- **centro como contido** — a IA no meio, e a borda em volta. É o que o círculo
  desenha, e é o que o texto "propõe, nunca aplica sozinha" diz.

> A frase que resolve, e que a página precisa: **IA no centro só é seguro quando
> existe borda.** Sem schema de processo, IA no meio do trabalho é caos com boa
> redação. Com ele, é a parte mais valiosa do trabalho feita rápido, dentro de
> limites que alguém pode conferir. **O schema não é o que restringe a IA — é o
> que torna possível colocá-la no meio.**

E uma honestidade de linhagem, que vale a página inteira: a ascendência disto
**não é engenharia de prompt — é engenharia dirigida a modelo** (a família
MDA/MDE). Vale dizer, e vale dizer também por que não é aquilo: **aquelas
tentativas queriam gerar a implementação**, e foi nisso que quebraram. Esta gera
a **especificação e a medição**, e deixa a implementação para gente e IA. É a
mesma divisão de trabalho do §2.2, aplicada à história do próprio campo.

### 2.5 Os ganhos — e a régua que impede isto de virar folheto

> *"e os ganhos/benefícios também precisam ser explicados"* — o usuário.

Faltava mesmo: a página descreve mecanismo e nunca diz o que a pessoa **ganha**.

**A régua, e ela é dura:** *todo ganho aponta para um mecanismo que já existe.*
Ganho sem mecanismo é promessa, e esta página não pode prometer o que o produto
não faz — é a régua da SPEC-76, aplicada à parte do texto onde é mais tentador
esquecê-la.

| O ganho | O mecanismo que o sustenta |
|---|---|
| **Dá para discordar sem refazer** — mudar uma coisa e comparar antes/depois | derivação determinística: mesmo desenho, mesmos itens |
| **A medida é contestável** — e medida que ninguém contesta vira ruído ou dogma | toda cobrança tem regra explícita atrás, e a regra é editável |
| **Dá para usar IA onde há auditoria** — sem apostar a conformidade no modelo | nada que a IA propõe conta antes da confirmação, e a marca viaja com o valor |
| **"Está pronto?" deixa de ser opinião** | lacuna contável (SPEC-73): o documento diz o número |
| **A demanda não começa do zero** | a camada perene não se recola a cada vez — é onde o atrito cognitivo realmente mora |
| **Seis meses depois dá para saber quem disse o quê** | proveniência por campo, e decisão com o que foi recusado |
| **A régua da casa não fossiliza** | PDCA sobre a própria configuração |

> O ganho que amarra os outros: **o conhecimento para de morar em pessoas e em
> conversas de IA, e passa a morar numa camada que dá para versionar, medir e
> discutir.** É a resposta direta ao *"isso não tem sido o suficiente"* da §1.1.

### 2.6 O conceito aplicado ao processo de construção de software

> *"quando estou falando de negócio eu nem me refiro a FICO e Camunda, e sim aos
> **processos de construção do software**: as informações de produto e negócio
> sendo configuradas no sistema, todos os processos de desenho e especificação, o
> uso das specs no desenvolvimento com IA, o uso dos checklists e informações de
> negócio na construção dos itens, e a melhoria das configurações, evolução e
> ajuste dessas coisas com o uso do assistente — ou seja, **tudo assistido por
> IA**."* — o usuário, corrigindo.

**A correção importa, e a primeira leitura desta seção estava errada.** Eu tinha
ido procurar nós de domínio — `rule`, `fico`, `camunda` — e montado o exemplo em
cima de concessão de crédito. Aquilo é o **assunto** que a ferramenta ajuda a
desenhar. O que o usuário chama de negócio é o **jeito da casa de construir
software**, e o conhecimento de produto que alimenta esse jeito.

É outro exemplo, e é o certo: **o processo de especificação da própria
organização.**

#### O que já existe, medido

**O conhecimento de negócio já é configurado.** `Produto`
(`repositorioDeProdutos.ts`) guarda `objetivo`, `quemUsa`, `regrasDeNegocio`,
`sistemas`, `restricoes`, `volumetria` e `glossario` — perene, por organização,
citado por tudo que se gera. Não é anexo de demanda: é a camada.

**O processo de construção já é configurado.** `checklistProcesso` e
`checklistTecnico` (SPEC-20, *"dois checklists: processo e técnico, com condição
por nó"*), `TesteAutomatizado` com `dev`/`hlg`, os templates de especificação, e
o pipeline de agentes. É o "como este time refina" escrito como estrutura.

**E — o achado desta medição — a IA já opera sobre a própria camada.** Dos oito
tipos de pedido em `pedidos.ts`, **dois não falam da entrega, falam da
configuração**:

| Pedido | O que ele faz |
|---|---|
| `montarPedidoDiagrama` · `Necessidades` · `Decisoes` · `CenariosDeLentidao` · `AlterarItem` · `Pipeline` | assistem **o trabalho** — desenho, decisões, ensaios, itens, especificação |
| **`montarPedidoSugerirConfig`** · **`montarPedidoConfigurarConversa`** | assistem **a camada** — sugerem e ajustam a configuração do time |

> **É essa a frase que faltava para "tudo assistido por IA".** A IA não assiste só
> a entrega: ela ajuda a **construir e a evoluir a régua**. Somado ao PDCA, que
> transforma feedback de uso em ajuste aprovado da configuração, o laço fecha —
> e é o laço que nenhuma skill e nenhum agente solto conseguem fechar, porque não
> existe camada para eles ajustarem.

#### O exemplo que a página deve andar

O processo de especificação da casa, atravessando as quatro camadas:

| Camada | O que aparece | Onde a IA entra |
|---|---|---|
| **Perene** | o produto (objetivo, personas, regras permanentes, glossário, volumetria) e o processo (o que se confere, em que contexto, com que prova) | sugere configuração a partir do que ela leu, e o assistente ajusta em conversa |
| **Da demanda** | o desenho desta mudança, as decisões com o que foi recusado, os ensaios | propõe o desenho e as necessidades; nada é aplicado sozinho |
| **Apontamentos** | o que falta, o que contraria o padrão do time, o que estoura a régua, quantas lacunas o documento entrega | não escreve aqui — **isto é calculado**, e é o que dá à IA um alvo em vez de uma folha em branco |
| **Entrega** | itens de trabalho com checklist do contexto certo, documento, e a spec que um agente de código consome (SPEC-80) | escreve o texto todo: história, contrato, critérios, cenários |
| **Volta** | o uso vira feedback, o feedback vira ajuste aprovado da configuração | ajuda a redigir o ajuste; **a aprovação é de gente** |

**O conhecimento de como a casa constrói software para de morar em pessoas e em
conversas, e passa a ser configuração versionada, medida e evoluída — com a IA
ajudando em cada passo, inclusive no passo de melhorar a própria configuração.**

#### O eixo que falta: o checklist é por processo, e precisa alcançar o produto

> *"na realidade acho que o que tem é checklist **por processo**, mas uma das
> demandas que precisamos atender também é **estender para produto**."* — o
> usuário, corrigindo de novo, e com precisão.

Medido, e é isso mesmo. O que existe é o **checklist de processo**
(`checklistProcesso: ItemProcesso[]`), ao lado do técnico — o §20 já os separava
— escopado por **time → tech → contexto → condição por nó**. Quatro eixos, e
**nenhum deles é o produto.**

O bloqueio é concreto, e tem uma simetria que vale registrar:

```
config_documentos_chave_unica  UNIQUE (chave, time_id)   -- as regras
especificacao_templates_chave_unica  UNIQUE (time_id)    -- os templates (SPEC-80)
```

**Duas tabelas de configuração, o mesmo bloqueio: o índice para no time.** A
SPEC-80 já vai mexer no segundo para caber N tipos de artefato; estender o
primeiro para o produto é o mesmo tipo de migração.

E o caminho já está aberto: **a SPEC-77 acabou de construir essa escada para
volumetria** — `Produto.volumetria` herdada pela demanda, com *declarado vence
herdado* e a tela dizendo qual é qual (§306). Estender checklist ao produto é a
**mesma escada aplicada a regra**: o produto declara o que sempre vale para ele,
a demanda herda, e quem discorda declara e aparece.

> Achado desta rodada, não estava em SPEC nenhuma. **Provavelmente é a SPEC-84**
> (§10, pergunta 5). O que esta SPEC assume: a página descreve o conceito aplicado
> ao processo de construção — verdade, e medida acima — e **não** afirma que
> checklist se organiza por produto, porque hoje não se organiza.

#### A IA no centro, dita pelo lado positivo

A §2.4 resolveu a ambiguidade de "centro" pelo lado defensivo — *contida*. Isso
está certo e é insuficiente: **descreve o limite e não o valor**, e uma página que
só diz o que a IA não pode fazer vende uma limitação.

O usuário deu a formulação que faltava: **facilitadora e aceleradora**.

Ela está no centro porque **toca todos os estágios** — lê o contexto, propõe o
desenho, escreve o texto, sugere configuração, ajuda a refinar. É de longe a
parte mais rápida do trabalho, e é a razão de o ciclo inteiro caber num dia em
vez de numa sprint.

> **A borda não existe para conter a IA. Existe para que valha a pena colocá-la no
> meio.** Sem schema de processo, acelerar é acelerar na direção errada com boa
> redação. Com ele, a velocidade da IA vira velocidade do time — porque tudo o
> que ela produz nasce medido, com proveniência, e some se a causa sumir.

Os dois lados juntos, e a página precisa dos dois: **a IA acelera; a camada
responde.**

## 3. Os diagramas — mais de um, e cada um com um trabalho

O usuário pediu *"mais diagrama que explique os conceitos e as camadas"*. Três,
e nenhum decorativo:

1. **A evolução** (§1.2) — prompt → agente/skill → camada. É o que posiciona o
   produto, e é o único que fala do mundo antes de falar da ferramenta.
2. **As camadas** (§2.2) — as quatro, com a IA contida na de dentro. É o corte
   transversal do que o círculo mostra de frente, e é o que torna "determinístico"
   concreto em vez de adjetivo.
3. **O ciclo** — o `CicloDoProduto`, que já existe e fica. Agora legendado com o
   que ele significa, e não só com o que ele lista.
4. **O processo de construção atravessando as camadas** (§2.6) — o jeito da casa
   de especificar software descendo pelas quatro, com a IA em cada passo,
   **inclusive no de melhorar a própria configuração**. É o que mostra o
   **trabalho de quem chega**, e provavelmente o que mais convence: os outros
   explicam o produto, este mostra o problema do leitor já resolvido.
5. **O mapa que conecta tudo, com as bordas** — pedido explícito, em duas
   mensagens: *"se faz necessário também escrever na página diagrama mostrando
   tudo isso se conectando"* e, depois de a SPEC-81 ganhar entradas e saídas,
   *"isso tudo precisa estar diagramado na landing"*.

   O miolo: informação de produto e processo configurado alimentando o desenho;
   o desenho produzindo apontamentos; os apontamentos virando itens, documento e
   spec; e o uso voltando como ajuste da configuração. **A IA em cada aresta**, e
   a volta fechando no ponto de partida.

   E as **bordas**, que são o que a SPEC-81 acrescentou:

   | Entra | Sai |
   |---|---|
   | ADR da casa → vira desenho (§1.3 da SPEC-81) | itens → issue tracker |
   | arquitetura de negócio → vira contexto do produto | documento de desenho → base de conhecimento |
   | | spec → desenvolvimento com IA |

   > **Este é o diagrama-herói**, e os quatro anteriores são apoio. Cinco
   > diagramas numa página é muito, e ninguém lê cinco — a régua tem que ser
   > declarada: **um é a manchete visual, os outros aparecem quando a seção deles
   > chega.** Sem isso, a página vira álbum de diagramas, que é a versão gráfica
   > exata do problema que esta SPEC existe para consertar.

   #### E aqui a máquina de marcação salva a página

   **Quase nenhuma dessas bordas existe hoje.** Uma delas (itens → tracker) é
   real; as outras quatro são SPEC-80 e SPEC-81, não construídas. Diagramar as
   cinco como se funcionassem seria a maior promessa falsa que esta página já
   teria feito — e a §5 da SPEC-76 existe exatamente para impedir isso.

   A solução já está no repositório, e é a resposta à §4 desta SPEC: **o
   diagrama de conexões usa a mesma marcação existe/parcial/ausente do ciclo.**

   > A máquina que a §4 dizia que ficaria sem uso quando os 13 estágios ficassem
   > verdes **ganha o segundo cliente no mesmo dia** — e um em que as marcas são
   > variadas de novo, que é onde ela comunica. Isso deixa de ser argumento de
   > princípio ("não se apaga porque um dia serve") e vira necessidade concreta,
   > o que é bem melhor.

   E dá à página uma honestidade que vende mais que a promessa: **"é para cá que
   isto vai, e é daqui que já estamos"** é uma frase que um arquiteto de
   organização grande acredita. Cinco setas todas acesas, não.

A régua para os três, herdada da SPEC-82: **dirigidos pelos mesmos dados da
página, para que não consigam mentir.** Um diagrama de camadas que liste uma
camada que não existe é o mesmo defeito que a SPEC-76 impediu na prosa.

## 4. O problema novo que as três rodadas anteriores criam

Quando as SPEC-79, 80 e 81 fecharem, o círculo terá **13 marcas iguais**.

A marca existe/parcial/ausente é o que torna a página honesta — mas 13 pontos
verdes idênticos não comunicam nada além de "verde". O que hoje é a informação
mais interessante (*olha, eles dizem o que ainda não existe*) vira ruído
uniforme.

**E a tentação é apagar a máquina de marcação.** Não se apaga: ela é a trava da
SPEC-76 fatia D; no minuto em que existir um 14º estágio ela é necessária de
novo; e a honestidade da página não é um estado a que se chega — **é um mecanismo
que se mantém.** O que muda é o peso visual, e isso é design, não texto.

## 5. O que "cara de landing page de verdade" quer dizer aqui

Ritmo, não decoração:

- **seções com larguras e fundos diferentes** — a coluna de 760 px é uma delas,
  não a página inteira;
- **o problema antes da solução** — hoje a página começa dizendo o que a
  ferramenta faz, para quem ainda não sabe por que precisaria dela;
- **movimento onde ele explica** (SPEC-82), e em lugar nenhum onde só enfeita;
- **o círculo como mapa compacto e consultável**, não como lista vertical de 13
  itens para ler;
- **um fim que oferece um começo** — a régua que a SPEC-78 aplicou ao tour.

O que **não** quer dizer: depoimento inventado, logo de cliente que não existe,
número de conversão fabricado. A régua da SPEC-76 vale para a página inteira.

## 6. O destino da `Jornada`

Ela **não** é lixo: é um passo a passo de uso, e isso é bom no lugar certo.
`JourneyModal.tsx:125` já a usa como aba "A jornada", pós-login — onde está quem
já entrou e quer saber por onde começar.

**Recomendação:** a landing para de renderizá-la; ela fica pós-login. E o
`OMotor()` sai de dentro dela para virar peça de conceito, com **uma** casa.

Consequência declarada: `Jornada.test.tsx`, `JourneyModal.test.tsx` e o E2E que
cobra `explicacao-do-motor` ficam vermelhos. **Reescritos com o motivo dito,
nunca contornados.**

## 7. O README entra na mesma rodada

Pedido explícito, e ele cai bem aqui por um motivo estrutural: o README é a
**quarta cópia** da tese (§0.2). Consertar a landing sem consertá-lo deixaria o
problema pela metade.

O que muda:

- **abre com o problema** (§1), não com o que a ferramenta faz;
- **ganha SDD e as camadas** (§2), que hoje não estão em lugar nenhum dele;
- **para de reexplicar o motor** e passa a apontar para o `CONCEITO.md`;
- **mantém intacto** todo o operacional — Docker, IA sem custo, Qwen, voz,
  imagem, produção, solução de problemas. Isso está bom e não é o assunto.

**A regra que sai desta rodada, e que vale para sempre:** o `CONCEITO.md` é a
fonte canônica da tese. Todo outro lugar é resumo que aponta para ele — **nunca
uma segunda explicação.**

## 8. O que esta SPEC RECUSA

**Apagar a marcação de estado.** Ver §4.

**Refazer a landing antes das SPEC-79/80/81.** As marcas e os textos mudam.

**Framework de UI ou biblioteca de animação novos.** `React.CSSProperties` sobre
as variáveis CSS existentes, como o `CicloDoProduto` já faz.

**Prova social inventada.** Sem clientes, sem números, sem depoimento.

**Ganho sem mecanismo.** A §2.5 é uma tabela de duas colunas de propósito: se a
coluna da direita fica vazia, a linha não entra. É o único jeito de ter uma seção
de benefícios num produto cuja tese é que promessa não confirmada não conta.

**Termo sem âncora.** Vale para o glossário da §2.3: *modelo canônico*, *schema
de processo*, *governança executável* são palavras fortes, e palavra forte sem
código atrás é jargão. Cada uma aponta para onde vive — ou sai.

**Afirmar checklist por produto.** A §2.6 mediu: o checklist é de **processo**,
escopado por time → tech → contexto → nó. Estender ao produto é demanda
reconhecida (§10, pergunta 5) — e até existir, a página não a anuncia.

**Reduzir "negócio" a diagrama de domínio.** Foi o erro da primeira versão desta
seção: ler *negócio* como `fico`/`camunda` — o **assunto** que a ferramenta ajuda
a desenhar — quando o que importa é o **jeito da casa de construir software** e o
conhecimento de produto que o alimenta. A página tem que falar do segundo.

**Vender a IA só pelo que ela não faz.** *"Propõe, nunca aplica sozinha"* é o
limite, e sozinho ele vende uma limitação. **Facilitadora e aceleradora** é o
valor. A página precisa dos dois, nessa ordem: primeiro por que vale colocá-la no
meio, depois por que é seguro.

**Vender "IA driven" no sentido que o mercado usa.** A §2.4 resolve a
ambiguidade em favor de *contido*; usar o termo na leitura de protagonista
venderia melhor e descreveria outro produto.

**Uma quinta cópia da tese.** Se um conteúdo novo repetir o `CONCEITO.md`, ou ele
substitui a fonte ou não entra. Seria constrangedor recriar, nesta rodada, o
defeito que ela existe para consertar.

**Vender a camada como se ela estivesse completa.** A §1 diz que faltava uma
camada perene — e o produto tem uma, com três estágios que só ficam verdes
depois das SPEC-79/80/81. A página não pode prometer maturidade que a própria
página, dois blocos abaixo, contradiz.

**Depreciar agente e skill.** O estágio 2 da §1.2 é progresso real, e a camada
existe **para os agentes trabalharem dentro dela** — não no lugar deles. Uma
página que os trate como erro perde exatamente o leitor que já os usa, que é o
leitor que esta página quer.

## 9. Fatias

- **A — o conceito escrito, e não é código.** `CONCEITO.md` ganha a evolução
  (§1.2), o SDD nos dois sentidos (§2.1), as quatro camadas (§2.2), **o glossário
  do produto** (§2.3), a resolução do "IA no centro" (§2.4) e os ganhos com o
  mecanismo de cada um (§2.5). É a fatia A da SPEC-76 outra vez, e pelo mesmo
  motivo: **texto sem régua vira reescrita infinita.** Aqui são duas réguas — a
  página não pode prometer o que o produto não faz, e **todo termo tem âncora no
  código, todo ganho tem mecanismo.**
- **B — a poda.** A landing para de renderizar `Jornada`; `OMotor` sai dela.
  Prova: um teste passa a **contar** — se uma seção nova repetir um `titulo` de
  `ESTAGIOS_DO_CICLO`, vermelho.
- **C — os três diagramas** (§3), dirigidos por dado, herdando claro/escuro.
  Inclui as peças de conceito da SPEC-82.
- **D — o layout com ritmo** (§5), e o círculo virando mapa compacto com a
  contagem que `contagemDoCiclo()` já dá.
- **E — o README** (§7).
- **F — a prova de que ela continua honesta.** O teste da SPEC-76 fatia D
  continua valendo, e ganha dois irmãos: a página não pode citar estágio fora de
  `ESTAGIOS_DO_CICLO` nem omitir um que esteja; e **a tese não pode aparecer em
  dois lugares** — o varredor do §0.2, virado teste, para que a quinta cópia não
  nasça.

> Seis fatias é mais do que qualquer rodada deste bloco. **É honesto dizer que
> esta é mais de uma rodada** — provavelmente A+B+C numa, D+E+F noutra. Fingir
> que cabe numa só é como as três rodadas do §251 acabaram pela metade.

## 10. Perguntas em aberto

> A pergunta que estava aqui — *"a promessa do `<h1>` ainda é a certa?"* — foi
> **respondida pelo usuário e virou a §1.4.** Não é mais decisão em aberto: a
> manchete muda, e o que fica para a fatia A é escrever a frase, não escolher se
> troca.

1. **Quanto de "governança corporativa" a página assume?** Há um vocabulário
   (compliance, auditoria, trilha) que abre portas em organização grande e afasta
   time pequeno. **Não temos medição de público.** Recomendação: falar o problema
   em português claro e deixar o jargão para uma seção própria, que se acrescenta
   sem reescrever a página.
3. **Imagens: quais, e de quê?** Decisão de design, e vem depois da fatia D de
   pé.
4. **A landing precisa de rota própria?** Ela é renderizada em `App.tsx` **antes**
   de qualquer roteador; seções linkáveis viram trabalho real. Medir na fatia D.
5. **Quando o checklist alcança o produto?** Achado da §2.6, e o usuário já o
   nomeou como demanda: o que existe é checklist **de processo**, escopado por
   time → tech → contexto → nó, e **falta o eixo do produto**. O bloqueio é o
   índice `(chave, time_id)` de `config_documentos`, irmão do que a SPEC-80 vai
   mexer em `especificacao_templates`. A escada já existe: a **SPEC-77** fez
   exatamente isso para volumetria (*declarado vence herdado, e a tela diz qual é
   qual*). **Provavelmente é a SPEC-84**, e é decisão do usuário — esta SPEC só
   garante que a página não afirme o que ainda não existe.
6. **O `CONCEITO.md` deveria ser publicado como página?** Se ele é a fonte
   canônica, uma versão navegável evita que a landing tente ser o documento
   inteiro — que é como ela virou uma coluna de 760 px.
