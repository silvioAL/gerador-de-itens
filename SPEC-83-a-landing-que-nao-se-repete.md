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
  (§1.2), o SDD nos dois sentidos (§2.1) e as quatro camadas (§2.2). É a fatia A
  da SPEC-76 outra vez, e pelo mesmo motivo: **texto sem régua vira reescrita
  infinita**, e a régua aqui é que a página não pode prometer o que o produto não
  faz.
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
5. **O `CONCEITO.md` deveria ser publicado como página?** Se ele é a fonte
   canônica, uma versão navegável evita que a landing tente ser o documento
   inteiro — que é como ela virou uma coluna de 760 px.
