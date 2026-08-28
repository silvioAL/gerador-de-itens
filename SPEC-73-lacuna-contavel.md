# SPEC-73 — Toda lacuna que o documento entrega tem que ser contável

> **Origem:** o usuário:
>
> > *"o documento que estamos gerando parece ok, exceto por alguns pontos:
> > parece que gera algumas coisas como placeholder no markdown, exemplo:
> > `Como <papel>, quero <ação> para que <benefício — detalhar>`. Preciso de
> > validação completa disso."*

---

## 0. A medição

Varri o motor de documento atrás de tudo que sai com forma de lacuna. São
**quatro famílias**, e elas não são a mesma coisa:

| # | O que sai | Quando | Tem marcador? |
|---|---|---|---|
| 1 | `Como <papel>, quero <ação> para que <benefício — detalhar>.` | **sempre** (string fixa) | **não** |
| 2 | Gherkin genérico: `Dado <contexto>` / `Quando <ação>` / `Então <resultado esperado>` | tipo sem cenário configurado | **não** |
| 3 | `_(sem história definida)_ ✍️ especificar` | campo existe, ninguém respondeu | sim |
| 4 | `_(a definir: o que fica pronto quando este item termina)_ ✍️ especificar` | idem | sim |

**As duas últimas são legítimas.** Carregam o `MARCADOR_ESPECIFICAR` que a
SPEC-23 criou de propósito: o documento diz o que falta, a tela conta quantos
faltam, e a esteira de agentes sabe onde escrever. Não é placeholder esquecido —
é lacuna endereçada.

**As duas primeiras não.** Ninguém as conta, ninguém as preenche, e nada acusa se
saírem num documento aprovado.

## 1. O caso 1 é o mais grave, e é uma linha

```ts
// Papel/benefício não são inferíveis a partir do modelo — o motor monta o
// esqueleto uma vez só, quem preenche decide o resto.
const historiaPo = "Como <papel>, quero <ação> para que <benefício — detalhar>.";
```

O comentário acerta o diagnóstico — **papel e benefício não são dedutíveis do
desenho** — e erra a conclusão. Ele produz uma seção "Visão geral" que **sempre**
contém um formulário em branco: em todo documento, inclusive no aprovado e
exportado.

Três consequências, e a terceira é a que importa:

1. quem lê não sabe se alguém esqueceu ou se é assim mesmo;
2. o texto entra no card do issue tracker;
3. **o selo "aprovado" passa por cima sem dizer nada** — e aí é o §248: um
   documento com lacuna anônima aprovado é um verde falso.

> A SPEC-58 fatia 2 criou as seções escritas por gente e provou que sobrevivem à
> regeneração. A visão geral ficou de fora e continuou sendo string do motor.

## 2. O caso 2 é sutil, e vale manter — com marca

O Gherkin genérico só aparece quando o tipo de nó não tem cenário configurado. É
**útil**: dá a forma a quem nunca escreveu Gherkin. Mas sai idêntico a um cenário
de verdade, e ninguém distingue *"o time escreveu isto"* de *"o motor não tinha o
que escrever"*.

A correção não é removê-lo. É **marcá-lo**, como os casos 3 e 4 já são.

## 3. A régua

> **Toda lacuna que o documento entrega tem que ser CONTÁVEL.**

Se o motor escreve algo esperando que alguém complete, esse algo precisa:

1. carregar o marcador que já existe;
2. entrar na conta de "o que falta" que a tela mostra;
3. aparecer no momento da aprovação.

O que não pode continuar é o terceiro estado: **texto de formulário que não é
lacuna declarada nem conteúdo real.**

## 4. A "validação completa" que o pedido nomeia

Não basta corrigir dois casos: é preciso provar que não há um terceiro, e a prova
tem que envelhecer bem.

**4.1 Um varredor.** Teste que procura a forma `<algo>` no documento gerado, fora
de bloco de código, e falha se achar sem marcador ao lado. Pega o que existe hoje
e o que alguém escrever amanhã.

**4.2 A aprovação diz o número.** Aprovar com lacuna **contada** é decisão;
aprovar com lacuna invisível é acidente.

> **Cuidado com o §230: não bloquear.** Um documento com três lacunas declaradas
> pode ser aprovado de propósito — o produto inteiro é construído sobre essa
> distinção. O que não pode é a lacuna ser invisível.

## 5. O que NÃO entra

**Fazer a IA preencher `<papel>` e `<benefício>`.** São conhecimento de negócio, e
um modelo os inventaria de forma plausível — o pior resultado possível num texto
que alguém vai aprovar. A SPEC-69 §5 recusou o mesmo, pela mesma razão.

**Remover a visão geral.** A seção tem valor; o que não tem é o esqueleto
entregue como se fosse conteúdo.

**Um editor novo.** A `SecaoEscrita` da SPEC-58 já existe, sobrevive à regeneração
e marca proveniência. A visão geral entra nela.

## 6. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | O varredor de lacunas sem marcador | ele **falha hoje**, e aponta os dois casos do §0 |
| **B** | A visão geral vira seção escrita, com o esqueleto como *dica* e não como corpo | documento sem visão geral escrita não contém `<papel>` |
| **C** | O Gherkin genérico ganha o marcador e entra na conta | a contagem sobe quando o tipo não tem cenário configurado |
| **D** | A aprovação mostra quantas lacunas vão junto | E2E: aprovar com lacuna diz o número; sem lacuna, não diz nada |

**A primeiro, e é a fatia mais importante** — ela é a validação completa que o
pedido nomeia. As outras três são o que ela encontrar.

## 7. Perguntas em aberto

1. **A dica da visão geral deve ser o texto atual?** É bom como **dica** (é o
   formato esperado) e ruim como **conteúdo**. Recomendação: manter o texto,
   mudar o lugar.
2. **Lacuna bloqueia a exportação ao tracker?** Recomendação: **não** (§230). Mas
   o card exportado não pode conter `<papel>`: ou vai preenchido, ou a seção não
   vai.
3. **Vale para o template do TIME?** Um time pode ter posto `<algo>` no próprio
   template. Recomendação: o varredor **avisa, não recusa** — a SPEC-47 já
   decidiu que o template é do time.
