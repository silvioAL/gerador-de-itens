# SPEC-92 — A landing como apresentação

> **Origem:** o usuário, depois de olhar a página rodando:
>
> > *"o que hoje é a landing page vai precisar ser transformado com uma cara mais
> > comercial, de explicar o conceito, ter partes para navegar, etc. Precisa ser
> > refeito, está ficando longa, acredito que precisamos produzir imagens, vídeo,
> > etc. — encontrar uma forma."*
> >
> > *"ficaria mais semelhante a uma apresentação ou algo assim, **mas gostei dos
> > diagramas**."*
>
> **Esta SPEC será implementada em outra conversa.** Ela é escrita para ser
> autossuficiente: quem a executar não terá o histórico desta sessão, então tudo
> que foi medido está aqui, com o caminho do arquivo e o número.

---

## 0. A medição de hoje

Contra a stack real (`docker compose`, web em `:8080`), viewport 1440×900,
`document.body.scrollHeight` e contagem de nós:

| O que | Quanto |
|---|---|
| Altura total | **4693 px** |
| Em telas de 900 px | **5,2 telas** de rolagem |
| Seções (`<section>`) | **16** |
| Palavras no corpo | **2326** |
| Diagramas (SVG) | 3 (`OPassoContido`, `CicloDoProduto`, `OFluxoDoProcesso`) |
| Imagens (`<img>`) | **0** |
| Âncoras de navegação (`a[href^="#"]`) | **0** |
| Botões "Entrar" | 3 |
| Títulos (`h1`/`h2`) | 7 |

**Os três números que definem o problema:**

1. **2326 palavras** — é um artigo, não uma apresentação. A leitura completa leva
   ~9 minutos, e ninguém dá 9 minutos a uma ferramenta que ainda não conhece.
2. **zero âncoras** — não há como navegar. Só existe rolar do começo ao fim, e o
   usuário pediu *"partes para navegar"* exatamente por isso.
3. **zero imagens** — tudo é texto ou SVG desenhado por código. Não há respiro
   visual entre 16 seções de prosa.

### 0.1 O que está BOM e não se toca

O usuário foi explícito: *"gostei dos diagramas."* São seis peças, e cada uma
responde uma pergunta diferente — a medição do §333 confirmou que não se repetem:

| Peça | Arquivo | O que responde |
|---|---|---|
| `AEvolucao` | `demo/PecasDoConceito.tsx` | prompt → agente → camada: **onde o produto se posiciona no mundo** |
| `AsCamadas` | `demo/PecasDoConceito.tsx` | perene · demanda · apontamentos · IA: **o corte transversal** |
| `OMotor` | `demo/OMotor.tsx` | o que o motor calcula e o que a IA escreve |
| `OPassoContido` | `demo/OPassoContido.tsx` | **a tese, com movimento**: a IA propõe e para |
| `CicloDoProduto` | `demo/CicloDoProduto.tsx` | os 13 estágios: **o índice**, consultável |
| `OFluxoDoProcesso` | `demo/OFluxoDoProcesso.tsx` | **o percurso em raias**, e onde fala com fora |
| `OMapaDeConexoes` | `demo/PecasDoConceito.tsx` | o que entra e o que sai, marcado |

**Nenhuma some.** O que muda é como elas são apresentadas, e quanto texto as
cerca.

### 0.2 O que já está medido e não precisa ser remedido

Quem implementar não precisa refazer estas medições — elas são desta semana:

- **Móvel:** a página **cabe** em 360 px e 768 px, sem rolagem horizontal. Há E2E
  (`e2e/landing-movel.spec.ts`, §336). *Cuidado:* aquele teste só passou a ter
  valor quando aprendeu a **esperar o React pintar** antes de medir — sem a
  espera ele media uma página vazia e passava sempre.
- **Modo claro: não existe.** `packages/web/src/styles.css` tem **um `:root` só**.
  Capturas em `colorScheme: dark` e `light` saem byte a byte idênticas. Isso é do
  produto inteiro, não da landing (ver §5.4).
- **Movimento reduzido** já é respeitado globalmente (`prefers-reduced-motion`,
  §328).
- **Repetição:** há travas em `demo/landing.travas.test.tsx` que reprovam repetir
  título de estágio fora dos dois componentes que legitimamente os nomeiam, e dois
  títulos que abrem com a mesma palavra.

---

## 1. O que "apresentação" quer dizer aqui, e o que não quer

O usuário deu a palavra: *"mais semelhante a uma apresentação"*. Ela é útil e
perigosa ao mesmo tempo, então vale precisar.

**Quer dizer:**

- **uma ideia por tela**, com ar em volta — em vez de 16 seções encostadas;
- **a peça visual como protagonista**, com o texto reduzido a legenda;
- **avanço deliberado** — navegar entre partes em vez de rolar por tudo;
- **um caminho curto que se completa** — dá para entender o essencial sem ler
  tudo.

**Não quer dizer:**

- slides que substituem a página (quem chega por link precisa ler sem apertar
  nada);
- rolagem sequestrada (`scroll-jacking`), que quebra Ctrl+F, teclado e leitor de
  tela;
- animação em cada entrada;
- perder o conteúdo — ele **muda de lugar**, não some (§3).

---

## 2. A régua herdada, e ela não é negociável

Três SPECs anteriores estabeleceram réguas que esta rodada **não pode afrouxar**.
Quem implementar precisa conhecê-las antes de escrever a primeira linha:

1. **A página não pode prometer o que o produto não faz** (SPEC-76). Todo estágio
   marcado como existente tem rota que resolve; toda conexão incompleta diz o que
   falta e cita a SPEC ou o § que responde por ela. Há testes.
2. **Todo termo tem âncora no código, todo ganho tem mecanismo** (SPEC-83). Nada
   de "aumente a produtividade em 40%".
3. **O conteúdo sai do DADO, não da prosa** (SPEC-76/85/90). Os diagramas são
   desenhados a partir de `demo/ciclo.ts` e `demo/conceito.ts`; a contagem
   "13 de 13" é calculada. Uma página em prosa envelhece mentindo — e já
   envelheceu duas vezes (§327, §328).
4. **Sem depoimento inventado, logo de cliente que não existe ou número de
   conversão fabricado.** "Comercial" não afrouxa a régua da honestidade; ela é o
   produto.

---

## 3. O desenho proposto: cinco atos, e uma navegação que existe

A estrutura abaixo é proposta, não imposição — mas o **número** é: cinco partes
navegáveis, porque é o que cabe num menu que se lê de uma vez.

| # | Ato | A pergunta que responde | Peça protagonista | Texto |
|---|---|---|---|---|
| 1 | **O problema** | *por que a IA que já tenho não basta?* | `AEvolucao` | ≤ 80 palavras |
| 2 | **A tese** | *o que é essa camada?* | `AsCamadas` + `OPassoContido` | ≤ 80 |
| 3 | **O ciclo** | *o que a ferramenta faz, do começo ao fim?* | `CicloDoProduto` | ≤ 60 |
| 4 | **O percurso** | *por onde passa, e quando fala com o que já tenho?* | `OFluxoDoProcesso` + `OMapaDeConexoes` | ≤ 60 |
| 5 | **Começar** | *e agora?* | — | ≤ 40 |

**O teto de palavras é a fatia mais importante desta SPEC.** 2326 → ~320 no
corpo principal. O texto que sair **não é apagado**: vai para `CONCEITO.md`, que
já é a fonte canônica da tese (regra do §323), e a página passa a **apontar** para
ele com um "ler o conceito inteiro →".

### 3.1 A navegação

- barra fixa no topo com os cinco nomes, marcando onde a pessoa está;
- âncoras de verdade (`#o-problema`, `#a-tese`, …) — linkáveis, funcionam com
  Ctrl+F, com teclado e sem JavaScript;
- `scroll-behavior: smooth`, respeitando `prefers-reduced-motion` (a guarda
  global já existe);
- **sem sequestrar a rolagem.**

### 3.2 O caminho curto

Um "ver em 60 segundos" que percorre os cinco atos parando em cada um. É a
resposta honesta ao pedido de vídeo **sem** produzir vídeo (§4.2): mesmo
conteúdo, mesma fonte de dados, e nada que envelheça em separado da página.

---

## 4. Imagens e vídeo: o que a avaliação anterior já decidiu

A **SPEC-82** avaliou isto e o §328 executou a fase 1. Quem implementar precisa
saber onde a decisão parou, para não refazê-la.

### 4.1 O que já foi decidido e não se reabre

- **Lottie está recusado** — artefato que nenhum teste lê e nenhum humano revisa
  em diff.
- **Captura de tela como explicação está recusada** — foi recusa do próprio
  usuário. *Screenshot ilustra; não explica.*
- **Mídia que afirma o que o produto não faz está recusada.** Uma animação
  mostrando os 13 estágios funcionando seria a mesma mentira que a SPEC-76
  impediu na prosa. **Mídia dirigida pelos mesmos dados não consegue cometer esse
  erro** — e é por isso que os diagramas em SVG ganharam.
- **Autoplay com som está recusado.**

### 4.2 Onde a decisão parou

A SPEC-82 §4 mandava: construir movimento autoral, **então olhar**. O §328
construiu (`OPassoContido`) e o §328 olhou. O veredito, escrito:

> *"O que passou: o ciclo virou índice consultável; a peça de movimento é legível
> e a pausa se entende sem legenda. **O que não passou:** isto não parece material
> de apresentação corporativa. É limpo, contido e honesto; não é rico."*

E a razão está na §3 daquela SPEC: *"profissional e não envelhece puxam em
direções opostas"* — acabamento alto vem de produção externa, que é justamente o
que não se rerenderiza.

### 4.3 A recomendação desta SPEC

**Imagens: sim, e de um tipo só.** Não fotos de banco de imagens, não capturas de
tela. **Figuras que explicam** — no mesmo vocabulário visual dos diagramas
(as variáveis CSS já existentes, o indigo `#4f46e5`, o verde `var(--verde)`).
Duas ou três, no máximo, nos atos 1 e 2, onde hoje só há caixas com texto.

**Vídeo: ainda não, e o motivo é uma pergunta sem resposta.** A SPEC-82 §6.2
deixou: *"a necessidade é dentro ou fora do app? Se for só a landing, o §2.3
inteiro é desnecessário."* O caminho curto do §3.2 responde à necessidade **de
dentro**. Se aparecer necessidade **de fora** — uma apresentação de vendas —, aí
o vídeo por código (Remotion) reaproveita os mesmos componentes, e nada do que
esta rodada construir se joga fora.

> **Se o usuário decidir fazer vídeo mesmo assim**, a régua é: ele sai dos mesmos
> dados (`ciclo.ts`, `conceito.ts`), tem **data de validade declarada** no
> próprio arquivo, e fica **fora do caminho crítico** da página — nunca como a
> explicação principal.

---

## 5. O que esta SPEC RECUSA

- **Apagar conteúdo.** Ele migra para o `CONCEITO.md`, com link. A página encolhe;
  a explicação não.
- **Scroll-jacking, carrossel automático, parallax pesado.** Quebram teclado,
  leitor de tela e Ctrl+F — e a página tem E2E de móvel que os pegaria.
- **Framework de UI ou biblioteca de animação novos.** `React.CSSProperties` e CSS
  sobre as variáveis existentes, como as seis peças já fazem.
- **Refazer os diagramas.** O usuário disse que gostou. Eles **mudam de moldura**,
  não de conteúdo.
- **Apagar a máquina de marcação de estado.** Hoje os 13 estágios estão verdes e
  as marcas parecem inúteis; no dia do 14º elas voltam a ser necessárias. A
  honestidade da página não é um estado a que se chega, é um mecanismo que se
  mantém (SPEC-83 §4).
- **Modo claro nesta rodada.** É do produto inteiro (`:root` único) e merece SPEC
  própria — fazer só na landing criaria uma segunda paleta, que é o defeito que a
  §0.2 do `styles.css` já documenta.

---

## 6. Fatias

- **A — o inventário e o corte.** Classificar as 2326 palavras em *fica na página*
  / *vai para o `CONCEITO.md`* / *morre por repetição*. **É a fatia que decide o
  resto**, e ela é texto, não código. Prova: a contagem de palavras do corpo cai
  para ≤ 400, medida pelo mesmo `innerText` do §0.
- **B — os cinco atos e a navegação.** A estrutura, as âncoras, a barra fixa com
  indicação de posição. Prova: E2E que clica cada âncora e afirma que a seção
  correspondente entrou na viewport; e que as cinco existem como `id`.
- **C — as molduras dos diagramas.** Cada peça ganha ar, largura e uma legenda de
  uma linha. Nenhuma muda por dentro. Prova: os testes existentes de cada peça
  continuam verdes **sem alteração** — se algum precisar mudar, a peça mudou por
  dentro e a fatia saiu do escopo.
- **D — as figuras.** Duas ou três, nos atos 1 e 2, no vocabulário visual dos
  diagramas. Prova: nenhuma afirma capacidade que o produto não tem (a régua da
  SPEC-82 §5), e a página continua passando no E2E de móvel.
- **E — o caminho curto.** O "ver em 60 segundos". Prova: percorre os cinco atos,
  para em cada um, e é interrompível a qualquer momento (a régua do tour, §253).
- **F — as travas.** As existentes continuam valendo, e ganham duas: **teto de
  palavras** no corpo, e **toda âncora do menu resolve para uma seção que
  existe** — que é a versão de navegação da régua "não prometer o que não existe".

> **Seis fatias é mais do que cabe numa rodada.** É honesto dizer: **A+B numa,
> C+D noutra, E+F na terceira.** Fingir que cabe numa só é como as três rodadas do
> §251 acabaram pela metade.

---

## 7. Perguntas em aberto

1. **Quem é o leitor?** A página fala com quem já usa agentes de IA e sente falta
   de camada — mas não medimos público. O vocabulário de governança corporativa
   (compliance, auditoria, trilha) abre portas em organização grande e afasta time
   pequeno. **Recomendação:** falar o problema em português claro no corpo, e
   deixar o jargão para uma seção própria que se acrescenta sem reescrever nada.
2. **A landing precisa de rota própria?** Ela é renderizada em `App.tsx` **antes
   de qualquer roteador** — então âncoras `#/algo` colidiriam com o `rotaDoHash`.
   As âncoras propostas (`#o-problema`) não colidem porque não começam com `#/`,
   mas **isso precisa ser conferido na implementação**, e há teste de rota
   (`navegacao/rota.test.ts`) que pode ser estendido.
3. **Quanto texto é pouco demais?** O teto de 400 palavras é escolha, não medição.
   Se a página ficar incompreensível, o número sobe — mas com o texto que voltar
   sendo escolhido, não o que sobrou.
4. **As figuras: quem as desenha?** Se for IA generativa, elas precisam ser
   revisadas contra a régua da SPEC-82 §5 antes de entrar, e a proveniência
   registrada no §. Se for desenho autoral em SVG, entram como as outras peças.

---

## 8. Para quem implementar: o mínimo que precisa ser lido antes

- `packages/web/src/demo/LandingPage.tsx` — a página de hoje, com o histórico das
  decisões nos comentários do topo.
- `packages/web/src/demo/ciclo.ts` e `demo/conceito.ts` — **o dado**. Tudo que os
  diagramas mostram sai daqui.
- `packages/web/src/demo/landing.travas.test.tsx` — as travas de repetição, e por
  que cada uma existe.
- `CONCEITO.md` — a fonte canônica da tese, para onde o texto excedente vai.
- `SPEC-82` — a avaliação de mídia, com o que já está recusado e por quê.
- `JOURNEY.md`, §323, §328, §333, §334, §336 — as cinco rodadas que construíram a
  landing atual. **Cada uma registra um defeito que só apareceu olhando a página
  rodando**, e nenhum deles teria sido pego por teste.

> **A lição das cinco:** capture a página e **olhe** antes de dar por feito.
> Três defeitos seguidos (rótulos sobrepostos, caixa transbordando, texto vazando)
> passaram por suítes verdes, porque `textContent` não sabe de pixel.
