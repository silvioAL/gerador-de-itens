# SPEC-68 — Resiliência como conta, não como checklist

> **Origem:** o usuário esclarecendo o que queria dizer com *"temos outros
> cenários ali"* na SPEC-56 — duas linhas específicas da tabela §2:
>
> - **Engine** — eventos discretos com *circuit breaker, timeout, retry,
>   bulkhead, queue*
> - **Controles** — *duração, taxa, ramp-up, taxa de falha*

---

## 1. O que a SPEC-56 já tinha decidido sobre essas duas linhas

| Linha | Veredito da §2 |
|---|---|
| Engine de eventos discretos | *"Existe como **checklist**, não como valor. Sim, como **decisão conferível** — não como simulação"* |
| Controles | *"**Não** temos. **Parcial** — só o que seleciona padrão"* |

Medi o "existe como checklist", e é literal:

```
Backend-chamadas http · "Definir timeout e política de retry"       [timeoutMs ≤ 500]
Backend-chamadas http · "Definir circuit breaker ou fallback"       (sem checagem)
Backend-mensagens     · "Definir estratégia de retry e DLQ"         [ttl ≥ backoffInicialMs × retries]
```

Duas coisas saltam:

1. **a mensageria JÁ faz a conta** — `ttl ≥ backoffInicialMs × retries` é o P2
   funcionando desde o §241, sobre campos que `rabbit` declara;
2. **a chamada HTTP não tem os campos.** O checklist manda "definir política de
   retry" e não existe onde escrever a política. A conexão `http` declara
   `timeoutMs`, e nada mais. **Circuit breaker não é campo em lugar nenhum.**

> É a assimetria que esta SPEC fecha: o padrão de resiliência da fila é
> conferível, e o da chamada síncrona — que é o caminho da resposta — é um
> lembrete de texto.

## 2. A armadilha, e por que não vou cair nela

O caminho óbvio seria: com `tentativas` declarado, o pior caso da leitura
(§291) passa de `timeout` para `timeout × tentativas`. Números maiores, mais
alarme.

**A própria SPEC-56 §12.1.1 já tinha nomeado por que isso é ruim:**

> *"A aritmética de pior caso tem um defeito que eu não nomeei: **ela grita
> lobo**. Somar tetos ao longo de oito saltos dá um número que por construção
> quase nunca acontece… Um alerta que aparece em todo caminho com mais de três
> nós é um alerta que as pessoas aprendem a ignorar."*

Multiplicar o pior caso por tentativas **piora exatamente esse defeito**.

### A pergunta certa

> **A conta que importa não é "quanto demora". É: *o sistema desiste antes ou
> depois de quem chamou?***

Um exemplo que qualquer arquiteto reconhece:

```
cliente          timeout de 1 s
  └── api  ──http(500ms, 3 tentativas)──▶  bureau
```

A api vai **insistir por até 1,5 s** numa requisição que o cliente **abandonou
em 1 s**. Meio segundo de trabalho garantidamente jogado fora, em cima de um
sistema que já está em dificuldade — que é quando o retry dispara.

Isso não é "pior caso improvável": é uma **contradição entre dois números que
alguém declarou**. Ela ou existe no desenho ou não existe, e quando existe está
sempre errada. É a mesma família do *conflito aritmético* que a SPEC-56 §4
previu — *"retry sob timeout curto demais"* — e é o oposto de gritar lobo.

## 3. Os quatro padrões, e a conta de cada um

| Padrão | Como entra | Que contradição ele revela |
|---|---|---|
| **timeout** | já existe (`timeoutMs`) | — (é o insumo dos outros) |
| **retry** | `tentativas`, `esperaEntreMs` na conexão | **insistência > paciência de quem chama** |
| **circuit breaker** | `disjuntor` (booleano) na conexão | insistência longa **sem** disjuntor |
| **bulkhead** | `chamadasSimultaneas` no nó | **concorrência necessária > o que o pool aguenta** |

E o "queue" da linha do usuário já está modelado desde sempre — é o tipo de nó,
e o §291 já sabe que atravessá-lo **interrompe** a soma do tempo de resposta.

### 3.1 Insistência

```
insistência da conexão = timeout × tentativas + espera × (tentativas − 1)
```

Determinística, e sobre números que a própria pessoa escreveu. A leitura passa a
dizer, além do tempo de resposta, **por quanto tempo o trecho insiste** — e as
duas frases juntas são o que ensina.

### 3.2 A régua nova: `insistencia-maior-que-paciencia`

Quem chama declara sua paciência (o `timeoutMs` da conexão que **entra** no nó).
Se a soma da insistência do que sai passa disso, há trabalho desperdiçado
garantido.

**Só acusa quando os dois lados estão declarados.** Sem um deles, silêncio — não
é "não medi", é que a pergunta não foi feita: comparar um número com uma
suposição é como se produz o alarme que ninguém respeita.

### 3.3 Bulkhead, e o único "Controle" que é aritmética

**Lei de Little**, e não simulação:

```
concorrência necessária = taxa (req/s) × tempo de resposta (s)
```

Com `taxaEsperadaRps` no nó de entrada e `chamadasSimultaneas` no nó que
recebe, a conta é exata: *"a 100 req/s com resposta de 300 ms, você precisa de
30 chamadas simultâneas; o limite declarado é 10"*. Saturação garantida, e
computável no papel.

É o que a SPEC-56 §2 chamou de *"parcial — só o que seleciona padrão"*, e é
mais que parcial: **taxa é o λ, e o tempo de resposta a mesa já calcula.**

### 3.4 O que dos "Controles" fica FORA, e por quê

**Duração, ramp-up e taxa de falha.** Os três só produzem número através de
amostragem: "quantas requisições falham durante um ramp-up de 30 s" não tem
resposta aritmética — tem resposta estatística, e depende de distribuição que o
desenho não declara.

A SPEC-56 §0.3 e §12.1 já os recusaram, e a recusa segue de pé. **`taxa` entra
porque é o único dos quatro que fecha uma conta exata.**

## 4. Onde isso aparece

### 4.1 As contradições vão para o placar

As contradições da §3.2 e §3.3 são **violações de padrão**, e o produto já tem
onde pôr isso: entram no **chip ⚖**, com o porquê e a válvula da exceção — como
toda violação desde o §239. A **insistência** entra na leitura (§291), ao lado
do tempo de resposta: é fato, não cobrança.

### 4.2 E a bancada precisa de outro nome

> *"seria uma repaginação do 'e se ficar lento' — teria que ser repensado para
> contemplar; pense em algo que tenha outro nome, já que é mais genérico."*

A SPEC-66 acertou o mecanismo e **errou o escopo pelo nome**. `#/simulacao`
chama-se *"E se ficar lento?"*, e o cenário só sabe mexer no tempo. Mas retry
não é lentidão, taxa de pico não é lentidão, e disjuntor desligado não é
lentidão — são **condições**, e o tempo é só uma delas.

Um nome estreito não é enfeite errado: ele **fecha a porta** para o que cabe
dentro. Ninguém procura "e se ficar lento?" para perguntar "e se o pico for de
Black Friday?".

**A tela passa a se chamar ENSAIOS** (`#/ensaios`), e cada linha é um **ensaio**
— uma condição hipotética aplicada ao desenho, com o efeito calculado. É a
palavra que estas SPECs já vinham usando sem perceber ("bancada de ensaio",
§294).

| | antes (SPEC-66) | agora |
|---|---|---|
| rota | `#/simulacao` | `#/ensaios` (a velha **redireciona**) |
| título | "E se ficar lento?" | "Ensaios — e se…?" |
| o que um cenário muda | tempo | tempo · **taxa** · **tentativas** · **disjuntor** |
| o que a tabela mostra | resposta, Δ, quem domina | + **insistência** · **concorrência** · **o que passa a contradizer** |

O redirecionamento não é zelo: `rotaDoHash` já trata rota morta assim desde a
SPEC-61 (*"rota que some sem redirecionar dá tela branca para quem tinha o link
salvo, e link salvo é o de quem mais usa"*), e a SPEC-66 §5 apostou justamente
em o endereço ser mandável para alguém.

### 4.3 O que um ensaio passa a poder mudar

```ts
export interface AjusteDeEnsaio {
  tipo: "no" | "aresta";
  id: string;
  /** SPEC-66 — o tempo. Segue sendo o ajuste mais comum. */
  fator?: number;
  ms?: number;
  /** SPEC-68 — as outras condições. */
  tentativas?: number;
  disjuntor?: boolean;
  /** req/s no nó — o λ da Lei de Little. */
  taxaRps?: number;
}
```

Um ensaio continua sendo **lente sobre uma cópia**: nada escreve no desenho.

> **Por que não uma tela por dimensão.** "Lentidão", "carga" e "resiliência"
> pareceriam três telas e são a mesma pergunta com entradas diferentes — e três
> tabelas obrigariam a pessoa a cruzar números na cabeça, que é exatamente o que
> a mesa existe para não pedir.

## 5. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | Campos: `tentativas`, `esperaEntreMs`, `disjuntor` na conexão; `chamadasSimultaneas` e `taxaEsperadaRps` no nó | config + validador |
| **B** | `insistenciaDe` no engine, e a insistência na leitura | unitário: 500 ms × 3 tentativas com 100 ms de espera = 1,7 s |
| **C** | A contradição **insistência > paciência** | unitário: só acusa com os dois lados declarados |
| **D** | A contradição de **saturação** (Lei de Little) | unitário: 100 rps × 300 ms > pool de 10 |
| **E** | **A repaginação**: `#/ensaios`, o ajuste ampliado, as colunas novas, e `#/simulacao` redirecionando | E2E: ensaio de taxa faz a saturação aparecer, e o link velho não dá tela branca |

## 6. Perguntas em aberto

1. **`disjuntor` deveria virar régua sozinho** ("toda chamada externa precisa de
   disjuntor")? Isso já é `exige-campo` do checklist de hoje — e a régua nova
   ganha valor por ser **condicional à insistência**: exigir disjuntor onde a
   insistência é curta é zelo. Recomendação: só a condicional.
2. **A insistência entra no `simularCenario`?** Deveria — um cenário de lentidão
   com retry é o caso em que a insistência mais dói. Fica para a fatia seguinte;
   a SPEC-66 já expõe `campoDeTempo` como parâmetro, então é aditivo.
3. **`taxaEsperadaRps` no nó de entrada ou no percurso?** No nó, porque é
   propriedade de quem recebe a carga, e um mesmo nó de entrada serve vários
   percursos. Se aparecer o caso de taxas diferentes por caminho, o percurso já
   tem `spec` próprio para isso.
