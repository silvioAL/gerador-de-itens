# SPEC-82 — Avaliação: a mídia que explica o conceito

> **Origem:** o usuário, sobre a landing —
>
> > *"eventualmente imagens, ver como podemos produzir algum vídeo ou algo do
> > tipo"*
>
> e, quando perguntado até onde ir, a régua que decide tudo nesta avaliação:
>
> > *"precisamos avaliar, precisa ser algo **profissional de apresentação que
> > explique os conceitos**, não necessariamente telas do sistema em si"*

Esta é uma SPEC de **avaliação**, como a SPEC-55 e a SPEC-75. Ela não autoriza
construção: separa o que vale do que só parece valer, e diz o que precisaria ser
verdade antes.

---

## 0. Por que a resposta óbvia foi recusada, e ainda bem

A resposta barata era: o Playwright já percorre a jornada inteira contra a stack
real e sabe gravar vídeo e screenshot — logo, a mídia da landing sai de graça e
nunca envelhece.

**O usuário recusou, e a recusa está certa.** Captura de tela explica *onde
clicar*; não explica **por que o produto é assim**. Quem chega na landing não
tem o problema de achar o botão — tem o de entender que existe uma camada que
calcula e uma IA que só escreve texto. Um vídeo de tela mostraria uma ferramenta
web parecida com outras dez, e a tese do produto — a única coisa que o
diferencia — continuaria invisível.

> A régua da SPEC-76 dizia: *a página não pode prometer o que o produto não faz.*
> Esta avaliação acrescenta a irmã dela: **a página não pode mostrar a mecânica e
> chamar isso de explicação.**

## 1. Os quatro conceitos que precisam de mídia, e nenhum é uma tela

Saem do `CONCEITO.md`, escrito na SPEC-76. São os que texto explica mal e
movimento explica bem:

| Conceito | O que a mídia precisa fazer ver |
|---|---|
| **A evolução do trabalho com IA** | prompt → agente/skill → **camada**: o que persiste deixa de ser o texto da instrução e passa a ser a régua medível |
| **As camadas** | perene · da demanda · apontamentos · IA generativa — e a de apontamentos sendo **recalculada**, não guardada |
| **Determinismo** | o mesmo desenho, duas vezes, produzindo saída idêntica — e um desenho mudado produzindo a diferença, isolada |
| **O centro contido** | a IA **dentro** de um limite que ela não atravessa: o motor decide a estrutura, ela escreve o texto |
| **Proveniência** | um valor carregando de onde veio, e a marca não se perdendo quando ele viaja |
| **O ciclo que fecha** | o retorno — a coleta vira ajuste, o ajuste muda a regra, a regra muda o próximo documento |

O último já existe como `CicloDoProduto`. Os **cinco** primeiros não existem em
lugar nenhum que uma pessoa que não fez login consiga ver.

> Os dois primeiros entraram depois, quando o usuário disse o que a página tem
> que resolver: *"tornar governança e os padrões corporativos em algo perene para
> trabalhar com suporte de IA"*, e *"ter mais diagrama que explique os conceitos e
> as camadas"*. Eles são de natureza diferente dos outros três — **falam do mundo
> antes de falar da ferramenta**, e são os únicos que uma pessoa que nunca ouviu
> falar do produto consegue reconhecer como o problema dela. Ver SPEC-83 §1.2 e
> §2.2.

> Note o que os quatro têm em comum: são **relações e restrições**, não telas.
> Diagrama animado é a forma natural deles. Isso já elimina metade das opções
> antes de discutir ferramenta.

## 2. As opções, medidas contra a régua

A régua tem duas metades, e elas puxam em direções opostas: **profissional** e
**explica o conceito** — mas este repositório impõe uma terceira, que decide os
empates: **não pode mentir quando o produto mudar.**

### 2.1 Movimento autoral em SVG/CSS, dentro do app

Componentes React animando os conceitos, no molde do `CicloDoProduto` e do
`MotorPassoAPasso` (que já anima quatro elos).

- **A favor:** vive no repositório e é revisável em PR; herda claro/escuro pelas
  variáveis CSS que já existem; é **testável**; e — o argumento decisivo — pode
  ser **dirigido pelo mesmo dado da página**. Uma animação que lê
  `ESTAGIOS_DO_CICLO` não consegue mostrar um estágio que não existe. Zero
  dependência nova. `prefers-reduced-motion` sai de graça.
- **Contra:** teto de acabamento. Não vai ter a produção de uma peça feita por
  motion designer, e movimento em React dá mais trabalho do que parece.

### 2.2 Lottie (After Effects → JSON)

- **A favor:** acabamento profissional de verdade, arquivo pequeno.
- **Contra, e é grave aqui:** o JSON é **opaco à revisão** — ninguém lê um
  diff de Lottie; exige a ferramenta e alguém que a saiba usar; tema claro/escuro
  fica assado dentro da peça; e **nenhum teste consegue ler o que ela afirma.**
  É exatamente a classe de artefato que envelhece calada — o defeito que a
  SPEC-78 acabou de gastar uma rodada inteira consertando no tour.

### 2.3 Vídeo renderizado por código (ex.: Remotion — React → mp4)

- **A favor:** é a **única** opção que produz arquivo de vídeo de verdade
  **e** pode ser regerada quando o conceito mudar. Reaproveita os componentes
  React que a §2.1 construiria. Versionado, e a CI pode rerenderizar.
- **Contra:** dependência pesada, tempo de render, e — o que costuma ser
  esquecido — **vídeo sem narração e sem trilha não soa profissional**, e nem
  narração nem trilha saem de um render de React.
- **Onde ele ganha:** fora do app. Landing embute componente; LinkedIn, e-mail e
  apresentação de vendas precisam de arquivo.

### 2.4 Produção externa por motion designer

- **A favor:** o teto de qualidade, sem competição.
- **Contra:** custo; ciclo de dias por correção; não versionável; e **não é
  regerável quando o produto mudar.** Se o conceito mudar — e ele mudou seis
  vezes nas últimas seis rodadas — a peça vira propaganda de um produto que não
  existe mais.

## 3. A tensão que esta avaliação não vai fingir que resolve

**"Profissional" e "não envelhece" puxam em direções opostas.** O acabamento
alto vem de produção externa, que é justamente o que não se rerenderiza. O que
se rerenderiza é o que vive no repositório, que é justamente o que tem teto de
acabamento.

Quem escolher precisa saber que está escolhendo nisso, e não entre "bonito" e
"feio". A saída não é achar a opção que ganha nas duas — **é dar prazo de
validade ao que não se rerenderiza.**

## 4. Veredito

**Faseado, e a primeira fase é barata o bastante para responder a pergunta que
falta.**

1. **Construir os três conceitos como movimento autoral (§2.1).** Dirigidos por
   dado, testáveis, tema herdado. É a fatia B da SPEC-83, e não depende desta
   avaliação para começar.
2. **Então olhar.** Renderizar, capturar, e julgar com os olhos: *isto passa por
   apresentação profissional?* **Não temos essa medição, e ela não se faz por
   argumento** — se faz vendo. É o §304 aplicado a design.
3. **Se passar, parar.** A landing embute componente, não vídeo, e ganha peça
   que nunca mente.
4. **Se não passar, ou se aparecer necessidade fora do app**, aí sim §2.3 — o
   vídeo por código, reaproveitando o que a fase 1 construiu. Nada se joga fora.

## 5. O que esta avaliação RECUSA

**Lottie como formato primário.** Artefato que nenhum teste lê e nenhum humano
revisa em diff, num repositório cuja disciplina inteira é "o que não é
verificável envelhece calado".

**Produção externa como peça central.** Aceitável como material de campanha, com
**data de validade declarada** e fora do caminho crítico da landing. Nunca como
a explicação do conceito dentro do produto.

**Captura de tela como explicação.** Foi o que o usuário recusou, e a §0 diz por
quê. Screenshot ilustra; não explica.

**Mídia que afirma o que o produto não faz.** Vale para vídeo e imagem tanto
quanto para texto: uma animação que mostrasse os 13 estágios funcionando seria a
mesma mentira que a SPEC-76 impediu na prosa. **Mídia dirigida pelos mesmos
dados não consegue cometer esse erro** — e é por isso que a §2.1 ganha.

**Autoplay com som.** Não é detalhe de gosto: é a diferença entre a pessoa ler a
página e fechar a aba.

## 6. O que precisaria ser medido antes da próxima decisão

1. **Movimento autoral chega em "profissional"?** Só vendo. Fase 1 do §4.
2. **A necessidade é dentro ou fora do app?** Se for só a landing, o §2.3
   inteiro é desnecessário. Se houver apresentação de vendas, muda o veredito.
3. **Existe alguém que use After Effects?** Se não existe, a §2.2 está decidida
   por ausência e não por argumento — e é melhor saber disso antes.
