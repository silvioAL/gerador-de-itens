# SPEC-65 — O desenho lido em voz alta

> **Origem:** relato do usuário — *"senti falta de um feedback em tempo real,
> exemplo: usuário monta um diagrama de um serviço recebendo uma chamada e
> fazendo diversas antes de responder e não tem nenhum feedback disso enquanto
> está desenhando; precisa ser algo bastante visível e bonito, eventualmente
> interativo"*.

---

## 1. A medição

Carreguei o cenário `credito-completo` na pilha real — que é, sem eu ter
escolhido, exatamente o exemplo do relato:

```
srv-credito-api ──orquestra──▶ processo-aprovacao ──orquestra──▶ decisao-score (FICO) ──http──▶ bureau-credito-nacional
       │                                                                │
       ├──escreve──▶ solicitacoes_credito                               └──escreve──▶ decisoes_auditoria
       └──valida───▶ regra-limite-endividamento
```

Três saídas do serviço de entrada. Uma cadeia de quatro saltos até um **bureau
de terceiro**. E a faixa de saúde diz:

> **VERMELHO 0 · AMARELO 0 · VERDE 8** — *"Tudo verde — a quebra está pronta
> para derivar os itens de trabalho."*

O único sinal de qualquer natureza é `🛣 4 caminho(s) a confirmar`, que exige
clicar, confirmar um a um, e mesmo depois disso as réguas de percurso do deploy
vêm vazias (medido no §286).

### O diagnóstico

**Verde responde "todos os campos estão preenchidos?" e é lido como "o desenho
está bom?".** A cor não mente sobre o que mede; ela mente por omissão sobre o
que *não* mede — e a frase "pronta para derivar" fecha a pergunta que a pessoa
ainda deveria estar fazendo.

O desenho acima tem três propriedades estruturais que qualquer arquiteto
apontaria em dois segundos olhando a figura, e sobre as quais o produto não diz
uma palavra:

1. a latência da resposta de `srv-credito-api` é a **soma** de três chamadas;
2. a cadeia síncrona tem quatro saltos, e a falha de **qualquer um** derruba a
   resposta inteira;
3. há um **terceiro** dentro do caminho de resposta.

## 2. O que já existe, e por que nada disso cobre

| Mecanismo | O que mede | Por que não serve aqui |
|---|---|---|
| `calcularProntidao` (a cor do nó) | campos preenchidos daquele nó | é sobre **um** nó; a propriedade aqui é da vizinhança |
| `avaliarTopologia` (SPEC-63) | exige/proíbe uma ligação | binário e pontual; "três chamadas" não é ausência nem presença de uma seta |
| `avaliarPercursos` (SPEC-57/64) | soma de campos ao longo de um caminho | **exige caminho confirmado** e régua configurada — nada vale enquanto se desenha |
| `avisosDaDerivacao` (§261) | o que passa batido ao derivar | só aparece **no clique de derivar**, que é tarde: a decisão de desenho já foi tomada |
| `detectarConflitos` | grafo de **atividades derivadas** | não olha o desenho (medido na SPEC-56 §10) |

Todo feedback do produto hoje é ou **por elemento** (a cor do nó) ou **por
momento** (o diálogo de derivar). Nenhum é **pela forma, enquanto ela nasce**.

## 3. A distinção que sustenta esta SPEC

A SPEC-63 §1 traçou uma linha explícita, e ela é o obstáculo que esta proposta
precisa atravessar de frente:

> *"É a linha que impede isto de virar um linter de grafo genérico. Não vamos
> cobrar ciclo, nó órfão ou componente desconectado por serem 'feios'."*

Essa linha continua valendo, e esta SPEC **não a cruza** — porque o que ela
propõe não cobra nada.

> **Uma régua diz "isto está errado". Uma leitura diz "isto é o que você
> desenhou".**

A diferença não é de tom, é de natureza:

| | Régua (SPEC-63) | Leitura (esta SPEC) |
|---|---|---|
| Afirma | um julgamento | um fato |
| De quem é | do time (configurada) | do desenho (derivada) |
| Precisa de config | sim | não |
| Entra no placar ⚖ | sim | **não** |
| Bloqueia/avisa ao derivar | sim | **não** |
| Pede exceção com motivo | sim | **não** — não há o que excepcionar num fato |

*"Este serviço faz três chamadas síncronas antes de responder; a latência da
resposta é a soma das três"* não é opinião de ninguém: é o desenho, dito em voz
alta. O que fazer com esse fato continua sendo inteiramente do time — e o **§6**
dá a esse fato um caminho de um clique para virar régua de verdade, quando o
time decidir que ele é uma.

Isto também é o que impede a leitura de virar mais uma cor para ignorar (§230):
ela não tem cor de erro, porque não é erro.

## 4. O dado que falta: o que é uma chamada que espera

Para dizer "três chamadas **antes de responder**" é preciso saber quais arestas
esperam resposta. Medido: **nada no produto declara isso.**

`EdgeTypeConfig` tem `fluxo` (`forward`/`reverse`/`bidirectional`), e o próprio
comentário diz que serve *"só pra animação do diagrama exportável — nunca pelo
motor de derivação"*. Direção não é sincronia: `consumes` é `reverse` e
assíncrono; `reads` é `reverse` e síncrono.

Nem dá para inferir do nome. `http` normalmente espera, e `http`
fire-and-forget existe. Chutar aqui produziria a pior das saídas: uma frase
confiante e errada sobre a arquitetura de alguém.

### 4.1 O campo

```ts
export interface EdgeTypeConfig {
  // …
  /**
   * SPEC-65 — quem chama por esta conexão **espera a resposta** antes de
   * seguir. É o que torna a latência somável e a falha propagável.
   *
   * Ausente = **não se afirma nada**. A leitura estrutural pula a conexão em
   * vez de chutar, e diz que pulou. Sincronia não se infere do nome do tipo:
   * `http` normalmente espera, e `http` fire-and-forget existe.
   */
  espera?: boolean;
}
```

Na config padrão: `true` para `http`, `grpc`, `graphql`, `reads`, `writes`,
`readwrite`, `validates`, `orchestrates`; `false` para `publishes`, `consumes`,
`pubsub`, `triggers`; ausente em `binding` (topologia pura, não é chamada).

> **`orchestrates` é o caso duvidoso, e ele fica declarado como duvidoso.** Um
> Camunda com *call activity* síncrona espera; um com *message event* não.
> Marcá-lo `true` no padrão é a escolha mais comum, e ela é do config — quem
> discordar troca uma linha, que é o ponto de o dado ser declarativo.

### 4.2 A honestidade da lacuna

Se um desenho usa um tipo de aresta sem `espera` declarado, a leitura **não
some em silêncio** (§57): ela aparece dizendo *"não sei se `binding` espera
resposta — 2 conexões deste desenho ficaram de fora"*, com o caminho para
declarar. Uma leitura que ignorou metade do desenho e não disse é pior que
leitura nenhuma.

## 5. As leituras

Quatro, e o critério de entrada é duro: **a propriedade tem de ser um fato do
grafo, não um gosto; tem de ter consequência dizível numa frase; e tem de ser
invisível na figura quando o desenho cresce.**

### 5.1 Fan-out que espera

> *"`srv-credito-api` faz **3 chamadas que esperam resposta**. A latência da
> resposta dele é a soma das três, e qualquer uma que falhe derruba a resposta."*

Nó com ≥ 2 arestas de saída com `espera: true`. Dois já é a propriedade: a
soma começa no segundo.

### 5.2 Profundidade que espera

> *"Da entrada até `bureau-credito-nacional` são **4 saltos que esperam**. O
> tempo de resposta é a soma dos quatro, e a disponibilidade é o produto das
> quatro."*

Cadeia de arestas `espera: true`. Aproveita `percursos.ts`, que já sabe
caminhar o grafo — sem exigir confirmação, porque leitura não julga.

### 5.3 Terceiro no caminho de resposta

> *"`bureau-credito-nacional` é externo e está dentro de uma cadeia que espera.
> A resposta de `srv-credito-api` depende de um sistema que não é de vocês."*

Nó de tipo com `derives: "external"` alcançável por cadeia que espera. É a
única leitura que usa `derives`, e por um motivo defensável: "externo" é a
única categoria do catálogo que carrega *quem controla*, não *o que é*.

### 5.4 Convergência

> *"**5 dos 8** componentes passam por `processo-aprovacao-credito`. Ele para,
> tudo para."*

Nó por onde passa a maioria das cadeias. Entra por último porque é a mais
discutível — e por isso nasce com o limiar no config, não no código.

### 5.5 O que fica de fora, de propósito

Registrado para não virar zelo depois: **ciclo**, **nó órfão**, **componente
desconectado**, **profundidade assíncrona**, **contagem de tipos**. Todas são
detectáveis e nenhuma tem consequência dizível numa frase sem virar julgamento
estético — que é exatamente o linter de grafo que a SPEC-63 recusou.

## 6. A superfície: onde, e como

O relato pede *"bastante visível e bonito, eventualmente interativo"*. As três
palavras viram três decisões.

### 6.1 Visível = no canvas, junto do que causou

**Não** mais um chip na faixa. Já há cinco lá, e um sexto seria o sinal se
diluindo no lugar onde ele menos ajuda: a faixa fala do desenho inteiro, e a
leitura fala **daquele nó**.

O nó com uma leitura ganha, no canto oposto ao badge de prontidão, uma **marca
de leitura**: um anel fino com o número (`3`, `4`, `5`), na cor de tinta do
produto — nunca vermelho nem âmbar, que já significam "errado" e "atenção" na
gramática da mesa. A marca aparece com uma transição curta **no momento em que
a propriedade passa a existir** — ao ligar a terceira seta, a marca nasce. É
esse instante que responde ao "em tempo real" do relato.

### 6.2 Bonito = o desenho se explicando, não um alerta

Ao passar o mouse na marca (ou selecionar o nó):

- as arestas envolvidas **acendem juntas** e as demais esmaecem — a leitura
  vira visível *na figura*, que é onde a pessoa está olhando;
- um cartão flutuante ancorado ao nó traz a frase da leitura (uma linha), o
  número em destaque, e a consequência (a segunda linha das do §5);
- no caso de profundidade, a cadeia acende como um **trilho** da entrada ao
  fim, com os saltos numerados.

Nenhum modal, nenhum toast, nada que interrompa. A leitura só ocupa espaço
enquanto se olha para ela.

### 6.3 Interativo = três verbos, e o terceiro é o que importa

No cartão:

1. **"ver os elementos"** — mantém o realce fixo mesmo tirando o mouse;
2. **"não me mostre neste desenho"** — dispensa aquela leitura naquele nó,
   guardado na quebra. Dispensar é decisão, e decisão fica registrada com quem
   e quando — e é reversível pela lista de dispensadas (§283: nenhuma decisão é
   de mão única);
3. **"virar régua"** — abre o `ConstrutorDeForma` da SPEC-63 **pré-preenchido**
   a partir da leitura. É a ponte entre as duas SPECs e a resposta à pergunta
   "e daí?": o fato que o time decidir que é uma regra vira uma regra do time,
   com porquê, placar e exceção — tudo o que a §287 já construiu.

> A régua de forma de hoje só sabe `exige-conexao` e `proibe-conexao`. Uma
> leitura de fan-out vira `"no máximo N conexões que esperam saindo de X"`, que
> é uma checagem **nova** (`limita-grau`). Ela entra nesta SPEC como fatia D,
> ou fica para a SPEC seguinte — ver §8.

### 6.4 O risco declarado

Toda leitura que aparece sempre vira decoração que ninguém lê. Três defesas:

- **limiar no config, não no código** (`leituras.fanOutMinimo`, etc.), com
  padrões que o time ajusta pelo PDCA como qualquer outra régua;
- **a marca só existe onde a propriedade existe** — desenho pequeno não ganha
  marca nenhuma, e é assim que ela significa algo quando aparece;
- **dispensar é por (nó, leitura)**, nunca global: silenciar tudo de uma vez é
  o que transforma sinal em ruído aceito.

## 7. O que esta SPEC não faz

- **não bloqueia derivação** nem entra em `avisosDaDerivacao`. Um fato sobre o
  desenho não é algo que "passa batido": ele está na tela o tempo todo;
- **não entra no placar ⚖ nem na conta de vermelho/amarelo/verde.** A cor
  continua respondendo "campos preenchidos?", e passa a **não ser mais a única
  coisa dita** sobre o desenho — que é o conserto de fato do §1;
- **não vira item de backlog.** Um item "reduzir o fan-out" seria o produto
  decidindo arquitetura pelo time;
- **não usa IA.** É grafo, e grafo é determinístico. Feedback ao vivo que
  depende de rede não é ao vivo.

## 8. Fatias

| | O quê | Onde | Prova |
|---|---|---|---|
| **A** | `espera` no `EdgeTypeConfig` + config padrão + a lacuna que se declara | engine, config | unitário: tipo sem `espera` sai da conta **e aparece na lista de ignorados** |
| **B** | `lerDesenho(diagrama, config, limiares)` → `LeituraDoDesenho[]`, as quatro leituras do §5 | engine, puro | unitário sobre `credito-completo`: as três leituras esperadas, com os números certos |
| **C** | A marca no nó, o realce das arestas, o cartão | web/canvas | E2E: ligar a **terceira** seta faz a marca nascer sem recarregar |
| **D** | Dispensar (com histórico) e "virar régua" | web + engine | E2E: dispensar some e volta pela lista; "virar régua" chega ao construtor preenchido |

A ordem não é negociável: **B antes de C**. A leitura é função pura sobre o
grafo, e desenhar a marca antes de ter o que ela diz produziria a marca decidindo
o conteúdo — que é como se chega a um número bonito que ninguém sabe explicar.

## 9. Perguntas em aberto

1. **`limita-grau` entra aqui (fatia D) ou vira SPEC-66?** Ela é uma checagem
   nova na régua de forma, com editor, RBAC, PDCA e prévia — o mesmo tamanho da
   SPEC-63 fatia D inteira. A recomendação é **fora**: fatia D entrega
   "dispensar" e deixa "virar régua" apontando para as checagens que já existem,
   e `limita-grau` vira a SPEC seguinte.
2. **A leitura vale para o desenho salvo de outra pessoa?** Ela é derivada, não
   guardada — então sim, e sem migração. O que é guardado é só a dispensa.
3. **Quantas marcas num nó?** Um nó pode ser fan-out **e** convergência. A
   proposta é uma marca só, com o cartão listando as leituras — duas marcas no
   mesmo canto viram enfeite.
