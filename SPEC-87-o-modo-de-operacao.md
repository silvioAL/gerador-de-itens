# SPEC-87 — O modo de operação (P5)

> **Origem:** o inventário do §295 (SPEC-67 §1) mediu oito passos da SPEC-56 e
> fechou só o #2. Três ficaram: P5 (modo de operação), P6 (variante A vs B) e P7
> (dialeto de provedor). Esta SPEC fecha o **P5**.

## 0. A medição

### 0.1 O que P5 é, e o homônimo que a SPEC-56 já avisou

Não é carga simulada. É **um perfil nomeado de operação do desenho** —
*"tráfego de Black Friday"*, *"batch noturno"*, *"interno de baixo volume"* — que
**muda as perguntas do painel e os itens derivados** (SPEC-56 §7):

> *"Sob Black Friday, DLQ deixa de ser opcional, idempotência vira obrigatória, a
> régua de volumetria muda."*

E a SPEC-56 já marcou a armadilha do nome: os *"cenários prontos"* deste produto
são **diagramas de exemplo** para carregar na mesa. Coisa diferente, mesmo nome.
Esta SPEC não usa a palavra "cenário" para o perfil, e é por isso.

### 0.2 O custo transversal existe, mas a forma não é a que o §295 escreveu

A SPEC-67 §5 disse:

> *"`avaliarCondicao` é chamado por `camposVisiveis`, e este por **seis
> lugares**: prontidão, especificação de entrega, refinamento, revisão de quebra,
> painel de propriedades e o próprio engine."*

Medi. **São quatro, e refinamento não é um deles:**

```
$ grep -rn "camposVisiveis(" packages/*/src --include=*.ts --include=*.tsx | grep -v "\.test\."
packages/engine/src/especificacao/gerarEspecificacaoEntrega.ts:116
packages/engine/src/readiness/prontidao.ts:54
packages/engine/src/revisao/checagens.ts:116
packages/web/src/panel/PropertiesPanel.tsx:78
```

O refinamento **não passa por `camposVisiveis`**: ele tem o seu próprio
`condicaoBate` (`gerarRefinamento.ts:230`), que chama `avaliarCondicao` direto, e
é usado em três pontos (`:171`, `:212`, `:345`). A conformidade tem um quarto
(`conformidade.ts:194`).

Então a superfície real é **duas portas**, não uma com seis:

| Porta | Onde | Quem usa |
|---|---|---|
| `camposVisiveis(spec, no, arestas)` | `spec/campos.ts:8` | 4 lugares |
| `condicaoBate(regra, nos, arestas)` | `gerarRefinamento.ts:230` | 4 lugares (3 no refinamento, 1 na conformidade) |

As duas terminam em `avaliarCondicao(condicao, no, arestas)`.

**Isso muda o desenho da rodada**, e para melhor: o eixo novo não precisa
atravessar seis assinaturas diferentes. Precisa entrar em **uma** — a de
`avaliarCondicao` — e ser repassado por duas.

### 0.3 O que já existe e não deve ser reinventado

- `Condicao` (`config/types.ts:14`) já é uma união com `allOf`/`anyOf`/`not`, e
  `avaliarCondicao` já recursa. Um eixo novo é **um caso a mais na união**, não
  uma máquina nova.
- `Quebra.volumetria` (SPEC-70) e `Produto.volumetria` (SPEC-77) já respondem
  *"quanto"*. O modo responde *"em que regime"* — e a régua do §306 já sabe
  distinguir declarado de herdado.
- `cenariosDeLentidao` (SPEC-66/68) é a bancada de ensaio: *"e se ficar lento?"*.
  Pergunta hipotética, e continua sendo. O modo é **declarado**, não hipotético.

## 1. A decisão de desenho: o modo é da QUEBRA, e é um só

Um desenho está num regime por vez. *"Este desenho é para o tráfego de Black
Friday"* é uma afirmação sobre a demanda, não sobre um nó.

**Por que não é lista.** Um desenho "que vale para normal E para pico" é um
desenho para pico — o regime mais severo é o que manda, e deixar a pessoa marcar
os dois produziria a pergunta *"e quando eles discordam?"* sem resposta. Quem
quiser comparar dois regimes está pedindo **P6 (variante)**, que é outra SPEC e
está declarada como tal.

**Por que não é do produto.** O produto atende um volume perene (SPEC-77); o
regime é da entrega. A mesma vitrine tem demanda de Black Friday e demanda de
manutenção interna, e amarrar o regime ao produto obrigaria a mentir numa das
duas.

## 2. O que muda quando o modo muda

Uma coisa só, e é a que a SPEC-56 pediu: **a condição passa a poder olhar o
modo.** Um requisito com `when: { modo: ["pico"] }` só aparece nesse regime.

Consequência direta, e é o valor inteiro: o time escreve **uma** régua —
*"idempotência no consumo"* — com `when: { modo: ["pico"] }`, e ela some do
refinamento das demandas de manutenção e aparece nas de pico. Sem o eixo, a
alternativa real é uma régua sempre visível que quase sempre não se aplica — que
é como um checklist ensina a ser ignorado.

## 3. O que esta SPEC RECUSA

- **Modo por nó.** Regime é do desenho. Por nó, produziria um desenho em dois
  regimes ao mesmo tempo, que é P6 mal feito.
- **Lista de modos por demanda.** §1.
- **Modo mudando a aritmética sozinho.** A SPEC-56 §7 sugere que trocar de
  "normal" para "pico" trocaria a taxa na origem. **Não nesta rodada**: a
  volumetria já tem dono (SPEC-70/77) e um segundo lugar que a altera criaria
  duas verdades sobre o mesmo número (§263). O modo pode **condicionar uma régua
  de volumetria**; não pode reescrever o número.
- **Modos de fábrica.** Não vamos embutir "Black Friday" no produto. Os modos
  são do time, como as techs e os contextos — inventar um vocabulário aqui é
  escolher o negócio de todo mundo.
- **P6 e P7.** P6 é uma SPEC inteira, e a SPEC-67 §5 já disse isso. P7 é, pela
  medição da SPEC-56 §9, *"o que mais parece impressionante numa demo e o que
  menos muda o item derivado"* — e continua valendo.

## 4. Fatias

- **A — o eixo na condição.** `Condicao` ganha `{ modo: string[] }`;
  `avaliarCondicao` recebe o modo por um **contexto**, não por um quinto
  parâmetro posicional — quatro posicionais já é o limite em que quem chama
  troca a ordem sem o compilador ver. Prova: sem modo declarado, a saída de tudo
  é **idêntica** — comparação do objeto inteiro, não por trecho.
- **B — o modo é dado da quebra.** `Quebra.modoDeOperacao?: string`, atravessando
  Zod, coluna, porta, adaptador e reidratação — o caminho que o §310 mede, e o
  teste de borda `keyof Quebra` cobra sozinho se ficar pela metade.
- **C — os modos são do time.** `RegrasConfig.modos?: string[]`, no molde de
  `tipos`/`tamanhos`. E, pela SPEC-86, o produto pode acrescentar os dele.
- **D — a tela, e a marca.** O seletor onde a volumetria da demanda já mora
  (`ContextoEpicoPanel`), e a régua condicionada **diz que está condicionada** —
  um requisito que aparece e some sem explicação parece defeito.

## 5. Perguntas em aberto

1. **Demanda sem modo.** É o padrão e continua sendo: régua com `modo` declarado
   não aparece; régua sem `modo` aparece sempre. Dito aqui para ninguém
   interpretar a ausência como buraco.
2. **Modo no documento e na spec?** O documento diz o contexto da demanda, e o
   regime é contexto. Provavelmente sim, e de graça — mas não medimos o custo, e
   esta rodada não o assume.
