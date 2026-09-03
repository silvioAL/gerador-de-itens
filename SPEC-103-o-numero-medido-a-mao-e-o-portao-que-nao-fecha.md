# SPEC-103 — O número medido à mão, e o portão que não fecha

> **Origem:** o E2E da CI apontado como vermelho no fechamento do §352, e o
> pedido do usuário:
>
> > *"precisa ajustar o CI, avalie"*

---

## 0. A medição

### 0.1 O que falha, e desde quando

Um teste só, sempre o mesmo:

```
✘ `--altura-do-cabecalho` cobre a barra em toda largura, inclusive telefone
  Error: em 360px a barra tem 113px e a variável diz 100px
```

Rastreado nas execuções da `main`:

| Marco | Quando | Execução |
|---|---|---|
| Última CI verde | **30/08 23:54** | `33343022712` |
| Primeira vermelha | **31/08 01:43** | `33348456912` |
| Ainda vermelha | 03/09 02:42 | `33708664554` (§352) |

**São 25 merges seguidos com o E2E vermelho**, todos com a mesma mensagem e os
mesmos números. O teste nasceu em `landing-apresentacao.spec.ts:55` e hoje mora
em `site-navegacao.spec.ts:173` — mudou de casa, nunca de diagnóstico.

### 0.2 O defeito é real, e a régua do teste está certa

`--altura-do-cabecalho` tem **um consumidor só**: o `scroll-margin-top` de
`.landing-ato` (`styles.css:895`). O comentário dela (`styles.css:805`) explica a
assimetria, e está correto:

> *"Sobrar alguns pixels no desktop é inofensivo: a seção começa um pouco mais
> abaixo. Faltar um só corta o chapéu."*

Por isso a régua é `real ≤ declarada`. **Não é o teste que está frouxo nem
exigente demais** — é a única forma de a variável não envelhecer calada.

### 0.3 Por que ela envelheceu mesmo assim

Medido contra a stack real (`:8080`), nesta máquina:

| Largura | Altura real | Declarada | Folga |
|---|---|---|---|
| 360 px | **99 px** | 100 px | **1 px** |
| 400–1440 px | 92 px | 100 px | 8 px |

E o mecanismo do crescimento, na primeira linha do cabeçalho:

| Largura | "Gerador de Itens" | Linha 1 |
|---|---|---|
| 1440 px | 21 px (uma linha) | 55 px |
| 360 px | **42 px (duas linhas)** | 62 px |

A marca **quebra em duas linhas** no telefone. Quanto ela cresce ao quebrar
depende da métrica da fonte — e a fonte do runner Linux não é a desta máquina.
Lá a mesma quebra dá 113 px.

> **O número `100` foi medido à mão, uma vez, numa máquina, com 1 px de folga.**
> O comentário chama 100 de *"o PIOR CASO medido"*. Era o pior caso **daquele
> ambiente**. Nenhuma constante escrita à mão sobrevive a uma troca de fonte,
> de locale, de zoom ou de rótulo da marca — e as quatro são coisas que mudam.

### 0.4 O achado maior: o portão não é portão

```
$ gh api repos/silvioAL/gerador-de-itens/branches/main/protection
{"message":"Branch not protected", "status":"404"}
```

**A `main` não tem proteção nenhuma.** Nenhum check obrigatório. É por isso que
25 merges passaram por cima de um E2E vermelho sem nenhuma resistência —
inclusive o do §352, ontem.

Consertar o teste sem consertar isto resolve o vermelho de hoje e deixa o
mecanismo que o escondeu por três dias exatamente como está.

---

## 1. As duas coisas a ajustar, separadas

| # | O quê | Natureza |
|---|---|---|
| **1** | A altura declarada não acompanha a altura real | defeito de produto |
| **2** | Um E2E vermelho não impede merge | defeito de processo |

A **2** é a que importa: sem ela, a **1** volta com outro nome.

---

## 2. Fatia A — a altura deixa de ser escrita à mão

Três saídas foram consideradas:

| Opção | O que faz | Por que não |
|---|---|---|
| **(a)** Subir a constante para ~120 px | passa nos dois ambientes | É o mesmo número à mão com mais folga. Temos **dois** pontos (99 e 113) e nenhuma razão para crer que 120 sobrevive à próxima fonte. Chutar a folga é o que já falhou. |
| **(b)** Um valor por breakpoint | mais preciso | Três números à mão em vez de um, com a mesma fragilidade e mais lugares para desatualizar. |
| **(c)** **Medir em tempo de execução** | a variável recebe a altura real | **Recomendada.** |

**A escolha é (c):** um `ResizeObserver` no `.landing-cabecalho` escreve a altura
medida em `--altura-do-cabecalho`, com `Math.ceil` (arredondar para baixo
recriaria o defeito por fração de pixel).

**Por que não há laço de realimentação:** a variável alimenta **só** o
`scroll-margin-top` de `.landing-ato`. Ela nunca entra no tamanho do próprio
cabeçalho, então medir → escrever → medir converge no primeiro passo. Foi por
isso que o consumidor único do §0.2 importou.

**O `100px` do CSS não sai:** vira o valor de partida, para o primeiro quadro
antes de o observador rodar. Âncora só é usada depois de um clique; nunca há
janela em que o valor esteja ausente.

**Prova:** com a fonte trocada por uma métrica diferente, a variável acompanha —
e o E2E, que hoje é uma armadilha de métrica de fonte, passa a afirmar que **o
mecanismo funciona**, que é o que ele sempre quis dizer.

## 3. Fatia B — o vermelho volta a doer

Proteção na `main` exigindo os dois jobs (`test` e `e2e`) antes do merge.

**O que isso muda de verdade:** hoje o E2E é informativo — roda, fica vermelho,
e ninguém é obrigado a olhar. Com o check obrigatório, o custo de ignorá-lo
passa a ser imediato em vez de acumulado por 25 merges.

**Prova:** um PR com o E2E vermelho não oferece o botão de merge.

> **Corte:** **A** primeiro, porque ligar o portão com a `main` vermelha
> trancaria o repositório na hora. A ordem não é preferência, é dependência.

---

## 4. O que esta SPEC RECUSA

- **Afrouxar o teste** (tolerância de N px, `toBeLessThanOrEqual(declarada + 20)`).
  É o defeito virando configuração. A régua `real ≤ declarada` é exatamente
  certa; quem estava errado era o valor.
- **Fixar a fonte do runner** para bater com a da máquina local. Trataria o
  sintoma no ambiente errado: o navegador de quem usa o produto também não tem a
  fonte desta máquina. O problema nunca foi a CI ser diferente — foi a constante
  supor que não seria.
- **Impedir a marca de quebrar linha em 360 px.** Resolveria este caso e
  amarraria o rótulo do produto ao número: trocar "Gerador de Itens" por um nome
  mais longo traria o defeito de volta.
- **`--altura-do-cabecalho` responsiva por media query** (§2, opção b).
- **Reescrever o cabeçalho.** A SPEC-95 §5 já recusou, e continua valendo: a
  única parte verificada em pixel é justamente esta.
- **Mexer nos outros 126 testes de E2E.** Passam, e sempre passaram.

---

## 5. Perguntas em aberto

1. **Por que 25 merges não incomodaram?** A hipótese é o §0.4 — sem check
   obrigatório, o vermelho é informação passiva. **Não medimos** se alguém
   olhou e decidiu seguir, ou se ninguém viu. A fatia B trata os dois casos.
2. **O `test` também deve ser obrigatório?** Recomendação: sim, os dois. Ele
   está verde hoje, então ligar não custa nada — e é o portão que pega o que o
   E2E não cobre.
3. **A variável deveria valer para o app, e não só para o site?** Hoje o
   cabeçalho do app é outro. Fora do escopo; entra se alguém esbarrar.

---

## 6. Para quem implementar

- `packages/web/src/styles.css:820` — a constante; vira valor de partida.
- `packages/web/src/styles.css:895` — `scroll-margin-top`, o consumidor único
  que garante a ausência de laço.
- `packages/web/src/site/Site.tsx` — onde o `ResizeObserver` mora, junto do
  cabeçalho que ele mede.
- `packages/web/e2e/site-navegacao.spec.ts:173` — o teste; **não muda**, e é
  isso que prova a correção.
- `.github/workflows/ci.yml` — os nomes dos jobs (`test`, `e2e`) para a
  proteção da fatia B.
- **§341** — a rodada que criou a variável e mediu 99 px; e **SPEC-95 §5**, que
  recusou reescrever o cabeçalho.
