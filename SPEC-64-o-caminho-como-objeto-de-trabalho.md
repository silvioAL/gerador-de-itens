# SPEC-64 — O caminho como objeto de trabalho

> **Origem:** *"o que acontece quando o usuário altera um conector? exemplo, era
> lê, e agora lê e escreve, como deveria impactar essa parte da confirmação? e se
> não for o que foi sugerido, como ajustar?"*
>
> A pergunta foi respondida medindo, e a resposta é **"hoje não acontece nada"** —
> em um dos dois casos porque está certo, no outro porque a medição é cega.

---

## 1. Trocar o conector não mexe na confirmação, e isso está certo

```ts
Percurso.id = `pc::${nos.join(">")}`   // nós, não arestas
inferirPercursos()                      // ignora e.type (só pula auto-laço)
```

`lê` → `lê e escreve` tem efeito zero sobre a confirmação. **E deve ter.** O que
a confirmação afirma é *"este trajeto existe de verdade"*, e trocar o verbo do
conector não desfaz a passagem da requisição por ali. Invalidar a cada troca de
rótulo obrigaria a reconfirmar o tempo todo — e o §242 já mostrou aonde isso
leva: a pessoa aprende a clicar sem ler.

O que **já** invalida corretamente, porque muda o id: inserir um nó no meio,
inverter `source`/`target`, apagar a aresta. O caminho antigo vira obsoleto
(visível desde o §283) e o novo entra na fila.

> **A confirmação é sobre a EXISTÊNCIA do trajeto, não sobre o que o desenho diz
> a respeito dele.** É por isso que ela sobrevive à troca do conector — e é por
> isso que ela não pode ser a única coisa que a troca do conector afeta.

## 2. O achado: a régua do caminho não vê o que o caminho atravessa

As duas réguas de percurso do `regras.example.json` somam `timeoutMs`:

> *"O caminho síncrono cabe no orçamento de latência do cliente — ≤ 2000ms"*

E `timeoutMs` é declarado:

| Onde | Quem |
|---|---|
| `edgeTypes` | **`http`, `grpc`** |
| `nodeTypes` | só `external` |

Mas a apuração mede **apenas nós**:

```ts
function declaraCampo(no: No, config: DiagramaConfig, campo: string): boolean {
  return (config.nodeTypes[no.type]?.spec ?? []).some((c) => c.key === campo);
}
```

Num caminho `web → api → worker` ligado por arestas HTTP, a soma dá **zero** e a
régua se cala, caindo no ramo comentado como *"a régua não se aplica aqui, e isso
é silêncio legítimo"*.

**Não é legítimo: é cego.** O caminho tem timeouts, eles moram nas arestas, e a
medição não os enxerga. O cabeçalho do próprio arquivo promete *"a soma dos
timeouts do percurso"* — e o §248 escreveu, sobre este mesmo código, que *"um
verde falso é o pior resultado possível de uma medição"*. É exatamente o que
acontece: silêncio onde havia o que somar.

Respondendo à pergunta na letra: trocar `lê` por `HTTP` e declarar
`timeoutMs: 900` **deveria mudar tudo** — acabaram de entrar 900ms no caminho — e
não muda nada.

**O dado já existe.** `Aresta` tem `spec?: Record<string, ValorSpec>`, a mesma
forma do nó. Não falta modelo; falta a apuração olhar.

## 3. E não há como ajustar o que foi sugerido

Dois verbos: `confirmar` e `não é caminho`. Se o trajeto real passa por um nó a
mais, ou se são dois caminhos onde o motor viu um, não existe o que fazer além
de recusar e ficar sem.

O modelo **já prevê** a saída: `Percurso.origem` aceita `manual`, e
`percursoConta()` conta manual sempre, sem pedir confirmação. Nada no produto
cria um. É a mesma assimetria do §283 um degrau acima: lá faltava **desfazer**,
aqui falta **corrigir**.

### A régua desta SPEC

> **O caminho deixa de ser uma sugestão que se aceita ou se recusa, e passa a ser
> um objeto que se declara, se corrige e se mede pelo que ele atravessa.**

## 4. Fatia A — a medição enxerga o caminho inteiro

`declaraCampo` deixa de ser sobre nó e passa a ser sobre **elemento
atravessado**: os nós da sequência **e as arestas entre eles**.

```ts
/** Um elemento do caminho, para a apuração e para a mensagem. */
interface ElementoDoCaminho {
  tipo: "no" | "aresta";
  id: string;
  /** O rótulo que a pessoa reconhece — o id sozinho não diz nada. */
  rotulo: string;
}
```

- **quem declara, conta.** O campo é procurado no `spec` do tipo do elemento —
  `nodeTypes[no.type]` para nó, `edgeTypes[aresta.type]` para aresta. Cada
  elemento atravessado contribui **uma vez**;
- vale para `soma` e para `maximo`. `saltos` não muda: já conta arestas
  (`nos.length - 1`), e continua sendo contagem, não campo;
- `timeoutMs` declarado nos dois lados (o nó `external` **e** a aresta `http`)
  soma os dois, porque são dois lugares onde há espera.

### 4.1 O par com mais de uma conexão

Se dois nós consecutivos são ligados por **mais de uma aresta** na direção
percorrida, o desenho não diz por qual a requisição passa. Escolher uma seria
inventar; somar todas inflaria o caminho.

O resultado é **"não medido"**, com o motivo dito: *"há mais de uma conexão entre
A e B — o desenho não diz por qual o caminho passa"*. É a terceira resposta do
§248 aplicada a um caso novo: dentro do padrão, fora do padrão, e *"faltam estes
elementos para eu conseguir dizer"*.

### 4.2 O contrato que muda

`PercursoNaoMedido.nosSemValor: string[]` vira `elementosSemValor:
ElementoDoCaminho[]`. A tela já transforma cada id em botão que seleciona o nó;
com aresta na lista, ela passa a poder selecionar a aresta — e `onSelecionarNo`
ganha um irmão, `onSelecionarAresta`.

Renomear é obrigatório, e não cosmético: um campo chamado `nosSemValor`
carregando aresta é a mentira por nome que o §280 acabou de corrigir em outro
lugar.

### 4.3 O efeito colateral que precisa ser dito

Caminhos hoje **silenciosos** passam a medir, e alguns vão nascer **fora do
padrão** — sobre desenhos que não mudaram. Isso é o mecanismo funcionando pela
primeira vez, não uma regressão.

Mas é mudança de resultado sobre trabalho existente, e por isso entra com aviso:
na primeira medição depois desta fatia, a violação de percurso que aparece diz
*"esta régua passou a somar o que as conexões declaram"*. Sem essa frase, o time
vê vermelho novo num desenho que ninguém tocou e conclui que a ferramenta
quebrou.

## 5. Fatia B — declarar um caminho à mão

`origem: "manual"`, que `percursoConta()` já aceita sem exigir confirmação.

**O gesto:** na mesa, "declarar caminho" entra em modo de seleção; a pessoa
clica os nós **na ordem** e fecha. O id sai da mesma fórmula (`pc::` + nós), o
que dá de graça duas coisas: um caminho manual que coincide com um inferido é o
**mesmo** caminho (não duplica), e ele sobrevive a rederivar.

### 5.1 O que quebra hoje, e precisa ser corrigido junto

```ts
export function conciliarPercursos(inferidos, guardados = []) {
  const percursos = inferidos.map(...);                    // ← só os inferidos
  const obsoletos = guardados.filter((p) => !idsInferidos.has(p.id) && percursoConta(p));
}
```

Um caminho manual **nunca** está entre os inferidos. Com o código de hoje ele
cairia direto em `obsoletos` — apareceria para sempre como *"sumiu do desenho"*,
mesmo recém-criado.

A conciliação passa a ter três entradas, e a regra é por origem:

| Guardado | Ainda inferido? | Vai para |
|---|---|---|
| inferido | sim | `percursos`, com a confirmação preservada |
| inferido | não | some (nunca foi de ninguém) ou `obsoletos`, se confirmado |
| **manual** | irrelevante | `percursos` **enquanto todos os seus nós existirem**; `obsoletos` quando um sumir |

O manual não depende do inferidor — depende do desenho ainda ter os nós dele.

## 6. Fatia C — corrigir o que o motor sugeriu

O verbo que falta, e a costura fina desta SPEC.

**"Ajustar"** num caminho inferido abre a sequência dele como ponto de partida;
a pessoa acrescenta, tira ou reordena nós e confirma. O resultado:

- nasce um percurso `manual` com a sequência corrigida (id novo, porque os nós
  mudaram);
- **o inferido original fica `confirmado: false`**, e não apagado. Sem isso, o
  inferidor o devolveria a cada render e a pessoa corrigiria a mesma sugestão
  para sempre — é a razão de o estado `false` existir (§ do `PercursosPanel`);
- e ele aparece na lista de recusados que o §283 criou, com o caminho de volta.
  Corrigir não é apagar a sugestão: é dizer que ela estava errada **e** o que é
  certo.

> Ajustar é **recusar com resposta**. O produto já sabe que o "não" precisa de
> motivo (§278); aqui o motivo é o caminho certo.

## 7. O que esta SPEC não faz

- **Não infere caminho a partir do tipo do conector.** `pubsub`
  ("publica+consome") descreve duas travessias e o grafo tem uma seta. Fazer o
  inferidor desdobrar isso é mudar o que ele lê do desenho, e o desdobramento
  certo depende de semântica por tipo — que é config de outro assunto. Quem tem
  esse caso declara o caminho à mão (fatia B), e isso é o que a fatia B existe
  para permitir;
- **não versiona a confirmação.** Confirmar continua sendo sobre existência do
  trajeto (§1), e o desenho mudar em volta não a invalida;
- **não mede o que a aresta não declara.** Se o tipo de conexão não tem o campo,
  o silêncio continua legítimo — a diferença é que agora ele é sobre o elemento
  certo.

## 8. Ordem

1. **Fatia A — a medição.** É correção de defeito, é a que responde a pergunta
   que originou a SPEC, e é a única conferível sem opinião: função pura, teste de
   engine, um caminho com timeout na aresta somando o que deve;
2. **Fatia B — declarar à mão.** Traz o `conciliarPercursos` junto, senão nasce
   quebrada;
3. **Fatia C — ajustar.** Depende da B (o resultado de ajustar é um manual) e
   fecha a pergunta *"e se não for o que foi sugerido?"*.

> **Relação com a SPEC-63.** São independentes: a 63 acrescenta um escopo novo de
> régua (a forma do desenho), a 64 conserta a régua de caminho que já existe. Se
> for para escolher, **a 64 primeiro** — corrigir uma medida que devolve zero
> vale mais que acrescentar uma medida nova.
