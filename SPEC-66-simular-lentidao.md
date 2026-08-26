# SPEC-66 — Simular lentidão: a mesa como bancada de ensaio

> **Origem:** relato do usuário — *"tem como interagir usando IA? precisa ser
> simples, talvez algo dedicado interface, talvez botão dentro do assistente. A
> intenção seria simular cenários de lentidão, abrir algum lugar (que não existe
> ainda) e ver uma tabela com cenários, tudo interativo, bonito e útil."*

---

## 1. Onde a IA entra, e onde ela seria enfeite

Esta é a primeira pergunta, porque errá-la contamina tudo o resto.

> **O cálculo não é da IA. A pauta é.**

"Se o bureau responder em 8 s em vez de 3 s, quanto passa a demorar a resposta
de `srv-credito-api`?" é **aritmética sobre o grafo**: trocar um número e
recorrer `lerDesenho`. Já está implementado, é determinístico, roda em
microssegundos e **dá o mesmo resultado toda vez**. Pedir isso a um modelo
trocaria uma resposta exata por uma plausível, e ninguém deveria decidir
arquitetura com um número que muda entre execuções. É a mesma linha da SPEC-65
§7: *"é grafo, e grafo é determinístico"*.

O que um modelo faz melhor que o motor é outra coisa: **saber que cenários
merecem ser ensaiados**. "Bureau de crédito degradado em horário de pico",
"banco em failover", "cache frio depois do deploy", "timeout do cliente menor
que a soma dos timeouts internos". Isso é conhecimento de mundo, e é onde a
sugestão vale.

A divisão é a que o produto já pratica em todo lugar: **`/ia/sugerir` propõe, o
engine decide.** A IA escreve a pauta do ensaio; o motor roda o ensaio; a tabela
mostra o resultado.

### 1.1 Consequência de projeto

A tela **funciona inteira sem IA**. Sem modelo configurado, a pessoa cria
cenários à mão e a tabela responde igual — a sugestão é um botão a mais, nunca o
caminho principal. É a disciplina do §244 pelo avesso: capacidade que só existe
com IA ligada é capacidade que metade dos times não tem.

## 2. O que já está de pé

Quase tudo o que o cálculo precisa:

| Peça | Onde | O que falta |
|---|---|---|
| soma do tempo através do que espera | `lerDesenho` (§291) | nada |
| `espera` por tipo e por conexão | `EdgeTypeConfig.espera` + `sincrono` | nada |
| o piso honesto quando falta número | `TempoDoTrecho.completo` | nada |
| fan-out, cadeia, terceiros | `lerDesenho` | nada |
| rota nova | `useRotaHash` | um caso |

O trabalho desta SPEC é **um motor de "e se" fino sobre o que existe**, mais a
tela. Não há nada estrutural a inventar.

## 3. O que é um cenário

```ts
export interface CenarioDeLentidao {
  id: string;
  nome: string;
  /** De onde veio: escrito à mão, ou proposto pelo modelo (§57 — quem propôs
   *  fica visível, e proposta não vira fato sem alguém olhar). */
  origem: "manual" | "sugerido";
  porque?: string;
  /** Os ajustes. Cada um mexe no tempo de UM elemento do desenho. */
  ajustes: AjusteDeCenario[];
}

export interface AjusteDeCenario {
  /** `no` ou `aresta` — o mesmo par que `ElementoDaLeitura` já usa. */
  tipo: "no" | "aresta";
  id: string;
  /** Multiplicador (`3` = "três vezes mais lento") OU valor absoluto em ms.
   *  Os dois existem porque as duas perguntas existem: "e se degradar?" e
   *  "e se o SLA fosse 500 ms?". */
  fator?: number;
  ms?: number;
}
```

**Cenário não é desenho.** Ele nunca escreve no diagrama: é uma lente sobre uma
cópia. Um "e se" que altera o desenho de verdade transformaria ensaio em
mudança, e a pessoa perderia o original no primeiro clique.

## 4. A tabela

Uma linha por cenário, sempre com **a linha de hoje ancorada no topo** — sem a
referência, todo número é solto.

| Cenário | Resposta | Δ | Quem domina | |
|---|---|---|---|---|
| **hoje** (âncora) | ≥ 3,0 s | — | bureau-credito-nacional (3,0 s) | |
| Bureau degradado 3× | ≥ 9,0 s | **+6,0 s** | bureau-credito-nacional (9,0 s) | ✎ 🗑 |
| SLA de 800 ms no bureau | ≥ 800 ms | −2,2 s | api → bureau (—) | ✎ 🗑 |

Quatro decisões sobre esta tabela:

- **"Quem domina" é a coluna que ensina.** O número total diz que dói; ela diz
  **onde** — e é o que transforma a tabela de placar em ferramenta. Vem de graça:
  é o maior contribuinte da soma, que `somarTempo` já percorre;
- **o Δ é contra hoje, não contra o cenário anterior.** Comparar em cadeia faz a
  ordem das linhas mudar o significado dos números;
- **o `≥` sobrevive.** Se o desenho não tem os timeouts, o cenário também não
  tem — e o piso continua sendo piso (§248). Cenário nenhum inventa número que
  o desenho não deu;
- **clicar na linha realça no canvas** os elementos ajustados, reusando o mesmo
  mecanismo da marca (§292).

### 4.1 O interativo

Editar um cenário abre a linha, não um modal: um slider por ajuste (`1×` a
`10×`) e a tabela **recalcula enquanto se arrasta**. É barato porque o cálculo é
puro e local — nenhuma chamada de rede entre o gesto e o número.

## 5. Onde isso mora

**Rota própria** (`#/simulacao`), e não uma aba do assistente. Três razões:

1. o assistente é onde se **conversa** para produzir desenho; aqui não se
   produz nada, se ensaia;
2. a tabela precisa de largura, e o assistente é um painel estreito;
3. rota é linkável e sobrevive ao F5 — "olha o que acontece se o bureau cair"
   é uma URL que se manda para alguém, e isso é metade do valor.

A porta de entrada é o **chip da leitura** (§291): dentro do popover, um
`simular lentidão →`. Quem está lendo "≥ 3,0 s de resposta" é exatamente quem
quer perguntar "e se piorar?" — e é o único momento em que a pergunta ocorre
sozinha.

## 6. O botão de IA

Um só, dentro da tela: **"sugerir cenários"**. Manda o desenho resumido (tipos,
conexões, o que espera, os tempos declarados) e recebe de 3 a 5 cenários com
nome, porquê e ajustes.

Três guardas, todas herdadas de decisões que este produto já tomou:

- **proposta não vira fato**: os sugeridos chegam marcados como `sugerido` e
  entram na tabela **desmarcados**, para alguém aceitar (regra 2 da SPEC-57 —
  inferir é grátis e erra);
- **o porquê vem junto** (§242): "bureau externo em horário de pico" sem o
  motivo é um nome bonito que ninguém sabe avaliar;
- **sem modelo, o botão não aparece** (§244), e a tela segue inteira.

O modelo **nunca devolve tempos calculados** — só os ajustes. Se ele mandar um
número de resposta, é ignorado: quem calcula é o motor. Vale escrever isso no
prompt e no parser, porque é o tipo de coisa que um modelo faz por prestatividade
e que corrói a confiança na tabela inteira.

## 7. O que esta SPEC não faz

- **não altera o desenho**, nunca (ver §3);
- **não vira item de backlog.** "Reduzir a dependência do bureau" é decisão de
  arquitetura, e o produto não a toma pelo time;
- **não entra no placar ⚖ nem na faixa.** Um cenário é uma pergunta hipotética;
  cobrar por hipótese é o caminho mais curto para ensinar a ignorar o placar;
- **não simula throughput, fila, contenção ou percentil.** Só soma de tempo pelo
  caminho que espera. Tudo o mais exigiria dados que o desenho não tem, e
  produziria número com cara de precisão e conteúdo de chute. Registrado aqui
  para não virar zelo depois.

## 8. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | `simularCenario(diagrama, config, cenario)` → reusa `lerDesenho` sobre uma cópia ajustada; `quemDomina` | unitário: 3× no bureau move o total, e o dominante é apontado |
| **B** | A tela `#/simulacao`: tabela, âncora de hoje, Δ, criar/editar/apagar à mão | E2E: criar cenário e ver o Δ, **sem IA nenhuma** |
| **C** | Sliders com recálculo ao vivo; clique na linha realça no canvas | E2E: arrastar muda o número sem recarregar |
| **D** | `POST /ia/cenarios-de-lentidao` + o botão, com aceite explícito | E2E com gateway falso: sugerido chega desmarcado |

**A ordem importa.** B antes de D não é estilo: entregar a IA primeiro faria a
tela nascer dependente dela, e a fatia B existe para provar que ela não é.

## 9. Perguntas em aberto

1. **Cenário é persistido?** A favor: "bureau degradado" é o mesmo ensaio toda
   sprint, e refazê-lo à mão é atrito. Contra: é mais um campo na quebra e mais
   um zod no servidor. A recomendação é **sim, na quebra** — pelo mesmo motivo
   dos percursos: a decisão de que aquele ensaio importa é do time, e recalcular
   é grátis.
2. **A tabela mostra os trechos, ou só o pior?** Hoje `lerDesenho` já devolve
   `tempos[]` inteiro. A proposta é mostrar o pior na coluna e os demais ao
   expandir a linha — um desenho com seis trechos viraria uma tabela ilegível.
3. **`quemDomina` empata?** Dois elementos com o mesmo tempo. A proposta é
   listar os dois: escolher um seria inventar, que é a terceira resposta do
   §248 num caso novo.
