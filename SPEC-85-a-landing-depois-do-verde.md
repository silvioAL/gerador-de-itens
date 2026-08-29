# SPEC-85 — A landing depois de todos os pontos verdes

## 0. A medição

Medida contra a stack real (`docker compose`, web em `:8080`), com captura de
página inteira em 1280×4073. Não é leitura de código: é o que aparece na tela.

### 0.1 A repetição literal, e ela é a queixa do usuário

`LandingPage.tsx:102` renderiza:

```tsx
<h2>O ciclo, e o que dele já existe</h2>
<CicloDoProduto />
```

e `CicloDoProduto.tsx:79`, três linhas de rolagem abaixo, renderiza:

```tsx
<h2>O ciclo, e onde a IA entra</h2>
```

**Dois títulos sobre a mesma coisa, empilhados.** É o §263 pelo lado que ninguém
vigia outra vez: cada `h2` está certo isoladamente, e a landing não sabia que o
componente traz o seu.

### 0.2 O círculo não é mapa — é enfeite ao lado de uma lista de treze

A SPEC-83 §5 pediu, com estas palavras: *"o círculo como mapa compacto e
consultável, não como lista vertical de 13 itens para ler"*.

A tela entrega **as duas coisas ao mesmo tempo**:

- treze pontos idênticos num círculo, **sem rótulo** — o nome só aparece no
  `<title>` do SVG, ou seja, no hover, ou seja, não existe para quem lê;
- ao lado, a lista vertical inteira com título **e** resumo de cada estágio,
  sempre aberta.

O círculo não é consultável (não diz o que é cada ponto) e a lista é o que se
lê — então o círculo é decoração. A seção mede **1051 px**, a maior da página, de
4073 px no total.

### 0.3 A contagem virou uma frase estranha

> "13 dos 13 estágios existem hoje. Os que ainda não existem estão marcados —
> eles dizem para onde isto vai, e marcá-los é o que os torna honestos."

A segunda frase foi escrita para quando havia buracos, e agora fala de um
conjunto vazio. É o **§4 da SPEC-83 se realizando**, e ela já tinha avisado:

> *"13 pontos verdes idênticos não comunicam nada além de 'verde'. O que hoje é a
> informação mais interessante — olha, eles dizem o que ainda não existe — vira
> ruído uniforme."*

E já tinha dito o que **não** fazer: apagar a máquina de marcação. Ela é a trava
da SPEC-76 fatia D, e no minuto em que existir um 14º estágio ela volta a ser
necessária. **O que muda é o peso visual.**

### 0.4 `CONEXOES` envelheceu igual — e a trava de ontem não alcança

Duas das cinco conexões do mapa mentem **hoje**, na página no ar:

| Conexão | O que a página diz | O que é verdade |
|---|---|---|
| ADRs da casa | `parcial` — *"falta a tela para importar"* | §325 e §326 entregaram a tela e a importação pela conversa |
| Spec → desenvolvimento com IA | `parcial` — *"falta a tela para escrevê-lo"* | §327 entregou a tela, ontem |

A trava da SPEC-84 fatia C cobra `ESTAGIOS_DO_CICLO`. `CONEXOES` é **outro array,
no arquivo vizinho** (`conceito.ts`), e ninguém o vigia.

**A mesma doença reapareceu em três horas.** Isso não é azar: é a prova de que a
trava foi escrita estreita demais — ela cobria a instância, não a classe. Toda
afirmação da landing sobre o que existe precisa da mesma disciplina, venha do
array que vier.

### 0.5 Zero movimento

```
$ grep -rn "animation\|keyframes\|transition" PecasDoConceito.tsx CicloDoProduto.tsx OMotor.tsx
(nenhuma ocorrência)
```

A fase 1 da SPEC-82 — *"construir os três conceitos como movimento autoral"* —
não existe. E ela é pré-requisito do veredito daquela avaliação: a pergunta
*"movimento autoral chega em profissional?"* está declarada lá como **não
medida**, e diz textualmente que *"não se faz por argumento — se faz vendo"*.

### 0.6 O produto é escuro só (achado lateral, não escopo)

`styles.css` tem um `:root` único, sem `prefers-color-scheme`. As capturas em
`colorScheme: dark` e `light` saíram **byte a byte idênticas** (313.094 bytes as
duas). Não é defeito da landing e não se conserta de passagem — mas fica dito,
porque toda peça nova nasce só no escuro, e quem escolher cor precisa saber
disso.

## 1. O que esta SPEC faz

O pedido do usuário, nas palavras dele:

> *"a parte após o ciclo com todos pontos verdes precisa ser revista, pois está
> meio repetitiva, a idéia é que fique com cara de landing page de verdade,
> verificar explicações melhores remake do layout (mantendo em alguma parte a
> idéia do círculo e dos pontos verdes, mas também ter outros elementos,
> eventualmente imagens, ver como podemos produzir algum vídeo ou algo do tipo)"*

Traduzido para o que a medição encontrou:

1. a repetição é **literal e localizável** (§0.1, §0.2) — não é impressão;
2. "manter o círculo e os pontos verdes" **combina** com §0.2: o círculo fica, e
   passa a ser o que ele deveria ser — mapa;
3. "vídeo ou algo do tipo" já tem resposta escrita: a SPEC-82 §4 manda fazer a
   fase 1 (movimento autoral) **e então olhar**. Esta rodada faz a fase 1 e
   executa o "então olhar".

## 2. O que esta SPEC RECUSA

- **Apagar a marcação de estado.** SPEC-83 §4, e vale mais agora que tudo está
  verde: a honestidade da página não é um estado a que se chega, é um mecanismo
  que se mantém.
- **Screenshot como explicação.** SPEC-82 §5, e foi recusa do próprio usuário.
  "Imagens" aqui quer dizer figura que explica, não captura de tela.
- **Vídeo nesta rodada.** Não por preconceito: porque a SPEC-82 §4 ordenou as
  fases, e pular a primeira desperdiça a única medição barata que existe.
- **Biblioteca de animação nova.** `React.CSSProperties` e SVG sobre as variáveis
  que já existem — SPEC-83 §8, e continua valendo.
- **Movimento que enfeita.** Se a animação não carrega informação que o estático
  não carrega, ela não entra. É a régua que separa isto de decoração.

## 3. A régua

Duas, herdadas, e uma nova:

1. **A página não pode prometer o que o produto não faz** (SPEC-76).
2. **Todo termo tem âncora no código, todo ganho tem mecanismo** (SPEC-83).
3. **Nova — toda afirmação da landing sobre o que existe é verificável, venha do
   array que vier.** É a §0.4 virando régua: a trava da SPEC-84 cobria uma lista;
   esta cobre a classe de afirmação.

## 4. Fatias

- **A — a repetição medida morre, e o círculo vira mapa.** O `h2` duplicado; os
  pontos ganham **rótulo no próprio círculo**; a lista de treze deixa de estar
  aberta ao lado — o desdobramento ao clique, que já existe e já tem teste,
  passa a ser o caminho. A frase da contagem serve aos dois estados. Prova: um
  teste que falha se dois títulos da página tiverem o mesmo assunto — o varredor
  de repetição do §323 existe e não pegou este caso, porque compara `titulo` de
  estágio, não `h2` de seção.
- **B — a trava que não alcançava.** Corrigir as duas conexões que mentem, e
  estender a disciplina: **toda conexão marcada como incompleta cita a SPEC ou o
  § que responde por ela**, igual aos estágios. Onde houver rota que a sustente,
  ela resolve — é a mesma prova do `ciclo.test.ts`, aplicada a outra lista.
- **C — movimento onde ele explica** (SPEC-82 fase 1). Dirigido pelos mesmos
  dados que o estático usa, com `prefers-reduced-motion` respeitado. Mídia
  dirigida por dado **não consegue** afirmar o que o produto não faz — é o
  argumento central da SPEC-82 §2.1, e é o que a torna melhor que vídeo aqui.
- **D — olhar, e registrar o veredito.** Capturar a página e julgar com os olhos
  (SPEC-82 §4.2). O resultado vai para o JOURNEY como medição, não como opinião:
  se passar, a §2.3 daquela avaliação fica arquivada; se não passar, fica
  registrada como a próxima, com o que faltou.

## 5. Perguntas em aberto

1. **Quantas seções a página aguenta?** 4073 px é longo. A medição não diz qual é
   o número certo, e cortar por gosto é como as reescritas infinitas começam.
   Esta rodada corta o que está **provadamente repetido** (§0.1, §0.2) e mede de
   novo.
2. **Modo claro.** O §0.6 é achado, não escopo. Se a landing for material de
   apresentação, a pergunta volta — e aí é uma SPEC própria, porque o produto
   inteiro depende de um `:root` só.
