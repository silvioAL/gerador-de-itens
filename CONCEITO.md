# O conceito — a camada perene, e a IA no meio dela

> Este é o texto que a SPEC-76 fatia A pediu e que a SPEC-83 fatia A ampliou: o
> que a ferramenta é, escrito para alguém de fora ler e explicar de volta **sem
> ver a tela**.
>
> **Ele é a fonte canônica.** README, landing e tour são resumos que apontam para
> aqui — nunca segundas explicações. A SPEC-83 §0.2 mediu o custo de fazer
> diferente: a mesma tese estava escrita em quatro lugares, nenhum canônico.
>
> A lista dos estágios não mora aqui. Ela mora em
> `packages/web/src/demo/ciclo.ts`, como dado — porque é conferida por teste
> contra o roteador de verdade, e porque uma lista em prosa envelhece calada. O
> que mora aqui é o **porquê**.

---

## O problema

Organizações não estão sem ferramenta de IA. Muitas já têm agentes, skills,
assistentes de código — e **isso não tem sido suficiente**.

O que falta é o lugar onde a regra da casa mora de um jeito que a IA possa ser
**medida contra ela**. Governança e padrão corporativo vivem hoje em cabeça de
gente, wiki desatualizada, PDF de arquitetura e costume de time. Cada agente
reconstrói esse contexto do zero, em cada conversa, e ninguém consegue conferir
se ele reconstruiu certo.

> Este produto existe para tornar **governança e padrão corporativo algo perene
> e determinístico**, dentro do qual a IA trabalha — em vez de um contexto que
> alguém recola a cada vez.

### A evolução do trabalho com IA

Três estágios. O produto se posiciona no terceiro.

1. **O prompt.** Uma pessoa pergunta, recebe texto. Nada persiste, nada é
   reaproveitável, nada é conferível. Cada conversa recomeça do zero.

2. **O agente, a skill, o arquivo de instrução.** A instrução vira arquivo
   reutilizável. É onde a maior parte das organizações está hoje, e é progresso
   real. Mas continua sendo **texto dizendo ao modelo o que fazer**: não mede
   nada, não deriva nada, e nada do que afirma é conferível. Dois agentes com
   instruções que se contradizem não acusam o conflito — os dois respondem com
   confiança.

3. **A camada.** A regra deixa de ser texto e vira **dado consultável e
   medível**: tipos, campos obrigatórios, réguas com número, checklists por
   contexto, templates versionados. O agente opera *dentro* dela. **O que
   persiste não é o prompt — é a régua.**

E a diferença entre 2 e 3 não é rigidez. É que **a camada tem quem a evolua, e a
evolução também é assistida**: dos oito tipos de pedido que este produto faz à
IA, dois não falam da entrega — falam da configuração. Somado ao PDCA, o laço
fecha. É o laço que nenhuma skill solta consegue fechar, porque não existe camada
para ela ajustar.

## Em uma frase

Uma camada perene de configuração, padrões e specs — versionada, medível e
evoluída pelo time — dentro da qual a IA acelera o desenho e a especificação de
software, sem decidir nada sozinha.

## O que ela não é

Não é um gerador de prompt. Não é um assistente que "cria o backlog para você".

A diferença é verificável, e é a tese do produto: **o mesmo desenho produz
sempre os mesmos itens.** Se você mudar uma coisa e rederivar, dá para comparar
o antes e o depois — porque nada no meio do caminho é uma amostragem de modelo.

## As quatro camadas

O que o produto guarda, e por que estão separadas.

| Camada | O que é | Onde vive |
|---|---|---|
| **Perene** | o que não muda a cada demanda: contexto do produto (objetivo, personas, regras de negócio, sistemas, restrições, glossário, volume), padrões por tecnologia, checklists de processo, réguas, templates, design system | as áreas de configuração, versionadas, com PDCA |
| **Da demanda** | o que é desta vez: o desenho, o volume declarado, os ensaios, as decisões e o que foi recusado | a quebra |
| **Apontamentos** | o que o motor **calcula**: prontidão, lacunas contáveis, itens derivados, o que contraria padrão, o que estoura régua | nunca digitada — e some quando a causa some |
| **IA generativa** | escreve o *texto* dentro do que as três acima determinam | contida, e nada dela conta antes da confirmação |

A camada de **apontamentos** é a que ninguém desenha e a que explica o produto:
ela **não é armazenada como verdade**, é recalculada. É por isso que o mesmo
desenho sempre dá os mesmos itens, e por isso que discordar de um apontamento é
**mudar uma regra** — não apagar uma linha.

E a camada perene **não termina neste produto**. O repositório de ADR da casa e a
arquitetura de negócio dela são perenes pelos mesmos motivos, e hoje vivem fora —
que é precisamente o problema descrito acima. Quando este produto disser *camada
perene*, a resposta honesta a *"e o que eu já tenho?"* é **"conversa com o que
você já tem"**, não "substitui".

## A divisão de trabalho

É a coisa mais importante deste documento.

**O motor calcula.** Ele lê duas coisas — o seu desenho e a configuração do time
— e faz três: mede o desenho a cada mudança, deriva os itens de trabalho, monta
os textos a partir dos modelos. Não conversa com IA, não vai à rede, não guarda
estado.

**A IA escreve.** A história de usuário, os critérios de aceite, o porquê de uma
proposta, o texto de um contrato. Ela nunca decide que itens existem, o que falta
preencher, o que está fora do padrão, ou em que ordem as coisas dependem umas das
outras.

**A pessoa confirma.** Nada que a IA propõe conta antes disso. E o que ela
escreveu continua marcado como dela, mesmo depois de confirmado — a marca é do
texto, não do momento.

## IA no centro — e a ambiguidade que precisa ser resolvida

"Centro" tem duas leituras, e as duas aparecem quando alguém olha o diagrama.

- **Centro como protagonista** — a IA decide, o resto serve a ela. É o que o
  mercado costuma chamar de *AI-driven*, e **não é este produto**.
- **Centro como contido** — a IA no meio, tocando todos os estágios, e a borda em
  volta. É o que o círculo desenha.

Mas dizer só "contida" descreve o limite e não o valor — e uma explicação que só
diz o que a IA não pode fazer vende uma limitação. A IA está no centro porque é
**facilitadora e aceleradora**: ela lê o contexto, propõe o desenho, escreve o
texto, sugere configuração, ajuda a refinar. É de longe a parte mais rápida do
trabalho.

> **A borda não existe para conter a IA. Existe para que valha a pena colocá-la
> no meio.** Sem schema de processo, acelerar é acelerar na direção errada com
> boa redação. Com ele, a velocidade da IA vira velocidade do time — porque tudo
> o que ela produz nasce medido, com proveniência, e some se a causa sumir.

O substituto honesto para uma tela que mostrasse "aqui a IA não fez nada":
**toda coisa que a ferramenta afirma diz de onde veio.** Um valor traz sua
proveniência. Uma lacuna traz o marcador que a torna contável. Uma medição traz a
regra que a produziu. Um número derivado nunca se apresenta como declarado.

## SDD, e o duplo sentido de "dirigido por spec"

*Spec-Driven Development* é construir a partir de uma especificação estruturada,
em vez de a partir de um chamado ou de um prompt. O termo é recente e disputado,
então vale explicá-lo em vez de citá-lo.

Este produto tem uma posição incomum, e ela vale nos dois sentidos:

- **Para dentro — a spec dirige o desenho, não o documenta.** Um componente de um
  tipo *precisa* declarar os campos que a spec daquele tipo exige; o que falta
  vira apontamento, e o que contraria vira item de trabalho. Você não desenha e
  depois documenta: a spec do time é o que torna o desenho **possível de
  completar**.
- **Para fora — o produto gera spec.** O mesmo motor que produz o documento de
  solução produz uma spec consumível por um agente de código, com as seções que
  um documento não tem: a origem, as recusas, e as fatias com prova.

E há uma régua estrutural nessa segunda parte: **as seções que carregam
julgamento não podem ser escritas pelo modelo.** Uma spec com aparência de spec e
conteúdo plausível-mas-vazio é pior que nenhuma — custa a leitura de alguém e
carrega autoridade que não merece. O modelo preenche o que é derivável; o resto é
de gente, com lacuna contável enquanto ninguém escreve.

## A linhagem, dita em voz alta

A ascendência disto **não é engenharia de prompt — é engenharia dirigida a
modelo** (a família MDA/MDE).

E vale dizer por que não é aquilo: **aquelas tentativas queriam gerar a
implementação**, e foi nisso que quebraram. Esta gera a **especificação e a
medição**, e deixa a implementação para gente e IA. É a mesma divisão de trabalho
do produto, aplicada à história do próprio campo.

## O vocabulário

Cada termo com âncora no código — porque palavra forte sem código atrás é jargão.

| Termo | O que é | Onde vive |
|---|---|---|
| **Modelo canônico** | a representação estruturada única de que **tudo o mais é projeção**: itens, documento, apontamentos, spec. É por isso que o mesmo desenho dá sempre os mesmos itens — não há segunda fonte para divergir | `Diagrama` + `DiagramaConfig` |
| **Processo** | o jeito da casa de fazer: o que se confere, em que ordem, em que contexto, com que prova | `checklistProcesso` |
| **Schema de processo** | esse jeito escrito como estrutura versionada e **medível**, não como texto | `Requisito`, `Checagem`, `TesteAutomatizado`, `Condicao` |
| **Apontamento** | o que o motor calcula e não guarda como verdade — some quando a causa some | prontidão, lacunas, itens derivados |
| **Proveniência** | de onde cada valor veio, viajando junto com ele | `ValorSpec.origem` |
| **Governança executável** | regra que **roda**, em vez de regra que está documentada | a diferença entre `Requisito` com e sem `checagem` |

## Por que a camada determinística existe

Porque uma medida que ninguém consegue contestar vira ruído ou dogma.

Quando a ferramenta aponta algo — "este componente está fora do padrão", "este
caminho estoura a régua", "este texto não tem contraste suficiente", "este
serviço não aguenta o volume que você prometeu" — existe uma regra explícita por
trás. Você pode ler a regra, discordar dela, mudá-la na configuração, ou
registrar que decidiu contrariá-la de propósito, com motivo e autor.

Essa saída não é concessão: é o que mantém o mecanismo vivo. Sem ela, a pessoa
aprende a ignorar o vermelho, e a medição inteira morre junto.

E a fronteira do que vira regra é dura: **se dá para calcular, é checagem; se não
dá, é item de checklist que uma pessoa responde.** Contraste é aritmética sobre
luminância. "A tela parece nossa" não é, e não finge ser.

## Por que é um ciclo, e não uma esteira

Uma esteira termina. Este produto volta.

O que se aprende usando — o feedback de quem refina, a exceção que cinco times
registraram pelo mesmo motivo, o volume que envelheceu — vira **solicitação de
ajuste na camada determinística**, com prévia e aprovação. O ajuste aplicado muda
as regras. As regras mudam o próximo documento, o próximo item, a próxima
medição.

Se cinco times violam o mesmo padrão, o padrão está errado, não os times. É essa
volta que faz a ferramenta aprender com quem a usa, em vez de só cobrar.

## Os ganhos, e o mecanismo de cada um

Ganho sem mecanismo é promessa. A coluna da direita é obrigatória.

| O ganho | O mecanismo que o sustenta |
|---|---|
| **Dá para discordar sem refazer** — mudar uma coisa e comparar antes/depois | derivação determinística: mesmo desenho, mesmos itens |
| **A medida é contestável** — e medida que ninguém contesta vira ruído ou dogma | toda cobrança tem regra explícita atrás, e a regra é editável |
| **Dá para usar IA onde há auditoria** — sem apostar a conformidade no modelo | nada que a IA propõe conta antes da confirmação, e a marca viaja com o valor |
| **"Está pronto?" deixa de ser opinião** | lacuna contável: o documento diz o número |
| **A demanda não começa do zero** | a camada perene não se recola a cada vez — é onde o atrito cognitivo realmente mora |
| **Seis meses depois dá para saber quem disse o quê** | proveniência por campo, e decisão com o que foi recusado |
| **A régua da casa não fossiliza** | PDCA sobre a própria configuração |

O ganho que amarra os outros: **o conhecimento para de morar em pessoas e em
conversas de IA, e passa a morar numa camada que dá para versionar, medir e
discutir.**

## A régua desta página

**Ela não pode prometer o que o produto não faz.**

É a mesma régua que o produto cobra de todo mundo lá dentro. Uma página de
apresentação que desenhasse estágios inexistentes seria a ferramenta violando, na
porta de entrada, a única coisa que ela exige.

Por isso os estágios que ainda não existem **aparecem, marcados**. Eles dizem
para onde isto vai — e a marca é o que os torna honestos. E por isso a lista é
dado conferido por teste: um estágio que perder a tela derruba a suíte no mesmo
commit em que isso acontecer.
