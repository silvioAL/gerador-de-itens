# SPEC-91 — Medir o móvel, e o desdobramento que se move

> **Origem:** o usuário, olhando a landing rodando: *"tem como medir pelo
> Playwright, pode implementar; também preciso que esse diagrama seja maior, e de
> expandir ou reduzir esses itens exista animação."*

## 0. A medição

### 0.1 A pergunta em aberto tinha resposta barata, e eu não a procurei

A SPEC-90 §5.2 registrou:

> *"Um fluxo horizontal com cinco fases não cabe em tela estreita. Esta rodada usa
> quebra de linha, e não miniatura ilegível — mas **não medimos em aparelho
> real**, e isso fica dito."*

Dizer "não medimos" foi honesto e ficou pela metade: **o Playwright emula
viewport**, a suíte já roda com ele, e a régua de móvel que importa é mecânica —
*a página cabe na largura, ou o conteúdo vaza?* Isso é `scrollWidth` contra
`innerWidth`, e não precisa de aparelho.

O usuário viu o que eu não vi: a medição estava a uma linha de distância.

### 0.2 O diagrama está pequeno para o que ele carrega

Ele desenha seis fases, treze estágios e cinco saltos — e vive numa coluna de
1060 px enquanto a faixa da página tem a largura toda. O texto dos estágios está
em **8,5 px** porque o pior nome não cabia; a fonte encolheu para caber na
largura, quando o certo era a largura crescer.

### 0.3 O desdobramento do ciclo aparece e some, seco

`CicloDoProduto` renderiza o detalhe com `{selecionado && …}` — o conteúdo entra e
sai do DOM instantaneamente. Não há transição nenhuma, e a lista de treze itens é
justamente onde abrir e fechar é o gesto principal.

E existe uma peça na mesma página que já se move com propósito (`OPassoContido`,
§328) — então a página tem duas linguagens: uma que anima e outra que pisca.

## 1. As três coisas, e o que cada uma custa

- **medir o móvel**: é E2E novo, e ele é barato porque o mecanismo já está lá;
- **o diagrama maior**: é largura e fonte, e o único cuidado é não brigar com o
  item acima;
- **a animação do desdobramento**: é a que tem decisão de desenho, porque animar
  o fechamento exige o elemento continuar no DOM — e isso muda o que a trava do
  §319 afirma.

## 2. A decisão de desenho: o detalhe fica no DOM, e some do LEITOR de tela

Para animar **abrir e fechar** — que é o que foi pedido —, o elemento não pode ser
desmontado no fechamento: não há o que animar num nó que já não existe.

A consequência é semântica, e é ela que precisa de decisão: um detalhe colapsado
que continua no DOM **continua sendo lido por leitor de tela**, e aí a lista de
treze itens vira uma parede de texto para quem não vê a animação.

**A saída:** o detalhe fica montado, colapsado por `grid-template-rows: 0fr`, e
sai da árvore de acessibilidade com `aria-hidden` + `inert`. Quem enxerga ganha a
transição; quem usa leitor de tela continua ouvindo só o que está aberto.

> **A trava do §319 muda de asserção, e é preciso dizer.** Ela afirmava que
> clicar de novo **remove** o detalhe do DOM (`queryByTestId(...)` nulo). Passa a
> afirmar que ele fica **fechado e fora da árvore de acessibilidade** — que é a
> garantia que interessava desde o começo. Reescrita com o motivo, nunca
> contornada.

## 2.1 O que nem sempre se aplica, e o diagrama tem que dizer

O usuário, no meio da rodada:

> *"nem sempre uma demanda se trata de uma decisão que muda o fluxo de negócio ou
> arquitetural — precisamos deixar claro, inclusive no diagrama, de forma clara
> que pode ser aplicável ou não."*

**Isto não é conceito novo: é o produto sendo coerente consigo.** O documento já
diz exatamente isso, e há teste para a frase:

> *"Nenhuma decisão entre alternativas nesta demanda — o que é resposta legítima:
> **nem toda mudança move arquitetura**."* (`DocumentoScreen.tsx:329`)

O diagrama, porém, desenha as seis fases como se todas acontecessem sempre. Para
quem lê a página, isso é uma promessa de processo pesado — e afasta exatamente a
demanda pequena, que é a maioria.

**Cada estágio ganha se é `sempre` ou `quando-se-aplica`**, e quem é condicional
carrega **por que**. A régua para marcar: só é condicional o que o produto **já
declara** como opcional em algum lugar — não é opinião minha sobre o que parece
dispensável. Quatro passam nesse critério hoje:

| Estágio | Onde o produto já diz |
|---|---|
| Registrar o porquê | *"nem toda mudança move arquitetura"* (`DocumentoScreen.tsx:329`) |
| Declarar o volume | `Quebra.volumetria` — *"Ausente = nada se afirma. Sem volume declarado a saturação segue calada"* |
| Ensaiar o que pode dar errado | o E2E afirma que *"o desenho sem tempo nenhum DIZ que não há o que ensaiar"* |
| Integrar com as ferramentas do time | os destinos do gateway são **configuráveis por time**: sem destino, o botão nem aparece (SPEC-49/81) |

Há teste para a régua: **estágio marcado como condicional sem o porquê quebra** —
marcar sem explicar é o mesmo que não marcar, e é a mesma disciplina que o §327
aplicou às marcas de ausência.

## 3. O que esta SPEC RECUSA

- **Biblioteca de animação.** CSS sobre as variáveis que já existem, como o §328
  fez. A guarda de `prefers-reduced-motion` já é global desde lá, e esta animação
  entra debaixo dela sem código novo.
- **Animar o que não carrega informação.** A régua do §328 continua: movimento que
  não diz nada que o estático não diga é decoração. Aqui ele diz *"este item está
  se abrindo, e é este"* — que é orientação, não enfeite.
- **Um E2E de móvel por aparelho.** Emular seis telefones seria seis vezes o mesmo
  teste. **Duas larguras** — a estreita de verdade e a de tablet — cobrem a régua
  mecânica, e são as que o `viewport` do Playwright dá de graça.
- **Prometer que a landing é boa no celular.** A régua deste E2E é *não vaza e o
  essencial aparece*. "É agradável" não é medida, e fingir que o teste garante
  isso seria a mesma mentira que a SPEC-76 proíbe na prosa.

## 4. Fatias

- **A — a medição de móvel.** E2E que abre a landing em duas larguras e afirma:
  **nenhum vazamento horizontal** (`scrollWidth <= innerWidth`, com a tolerância
  de 1 px do arredondamento), e as peças essenciais visíveis. Prova de que ele
  tem dentes: estreitar o `viewBox` do fluxo o suficiente para vazar derruba o
  teste.
- **B — o diagrama maior.** Largura e tipografia, com o pior nome do conjunto
  ainda cabendo — o critério continua sendo o pior caso, não a média (§334).
- **D — o que nem sempre se aplica.** `EstagioDoCiclo.aplicacao` e o porquê, com
  a marca no fluxo e no círculo. Prova: condicional sem motivo quebra, e a marca
  só existe onde o produto já declara a opcionalidade (§2.1).
- **C — o desdobramento que se move.** A transição de abrir e fechar, com o
  elemento montado, `aria-hidden`/`inert` no fechado, e a trava do §319
  reescrita.

## 5. Perguntas em aberto

1. **Qual largura é "estreita"?** 390 px é o iPhone moderno e 360 o Android comum.
   Esta rodada usa **360**, o mais apertado dos dois: passar no pior caso cobre o
   outro, e escolher o mais folgado seria escolher o resultado.
2. **O fluxo em 360 px vai ficar bom?** Provavelmente não — seis fases lado a lado
   não cabem, e a resposta honesta pode ser empilhar. A fatia A **mede**; o que
   fazer com o número é decisão da rodada seguinte, com o número na mão.
