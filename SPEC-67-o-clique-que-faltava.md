# SPEC-67 — O clique que faltava, e o passo #2 fechado

> **Origem:** duas coisas do usuário na mesma mensagem — *"na SPEC-56 fizemos
> uma avaliação do SimArch, acho que agora finalmente estamos chegando em um
> ponto de convergência, avalie, pois temos outros cenários ali"* e *"você falou
> de 'em um clique' na resposta anterior, reavalie, construa spec para que o
> sistema fique completo e implemente"*.

---

## 1. A convergência, medida

A SPEC-56 §0.4 declarou oito passos, numa ordem. Este é o estado real de cada
um, cruzado com o código de hoje:

| # | Passo | Estado | Onde |
|---|---|---|---|
| 1 | **P3** requisito + rastreabilidade + gap | ✅ | `Necessidade`, `analisarLacunas` (SPEC-57 A) |
| 2 | **P8** padrão como regra sobre topologia **e valor** | ⚠️ **quase** | `avaliarTopologia` sabe `exige-conexao` e `proibe-conexao` (§287) |
| 3 | **P4** ADR ancorado no nó | ✅ | `Decisao`, com alternativas e porquê (SPEC-57 C) |
| 4 | **P1** percurso | ✅ | `inferirPercursos`, `percursoManual`, ajuste (SPEC-57 E, SPEC-64) |
| 5 | **P2** número com unidade | ✅ | `Checagem` com `valorDe`/`multiplicadoPor` (§241); `lerDesenho` somando tempo (§291) |
| 6 | **P5** modo de operação | ❌ | — |
| 7 | **P6** variante A vs B | ❌ | — |
| 8 | **P7** dialeto de provedor | ✅ **corrigido no §335** | o eixo do provedor EXISTE, e é automático: `nodeTypes.kafka.contextos` e `.rabbit` já trazem `Backend-mensagens kafka/rabbitmq`, e o checklist de fábrica já condiciona por eles |

**Cinco de oito fechados, um quase, dois ausentes.** A convergência que o
usuário percebeu é real, e ela não veio da lista: veio de a cadeia da §0.1
— *propósito → decisão → padrão → item* — ter sido construída elo a elo.

Duas coisas apareceram no caminho que a SPEC-56 **não previu** e que hoje são
centrais:

- a **leitura do desenho** (SPEC-65) — o fato dito em voz alta, sem régua
  nenhuma configurada. A §0.6 dizia "medir o desenho, não o runtime"; a leitura
  é isso levado a sério, e chega a quem ainda não configurou nada;
- a **bancada de ensaio** (SPEC-66) — que é, sem eu ter percebido enquanto a
  escrevia, **metade do P5**: trocar números de entrada e refazer as contas.
  O que falta do P5 é a outra metade, e a §7 é clara sobre qual é.

## 2. O passo #2 não está fechado, e a dívida tem nome

A SPEC-65 §6.3 prometeu, em texto:

> *"**virar régua** — abre o `ConstrutorDeForma` da SPEC-63 **pré-preenchido** a
> partir da leitura. É a ponte entre as duas SPECs e a resposta à pergunta 'e
> daí?'."*

E o §292 não entregou, com este motivo escrito:

> *"a régua de forma sabe `exige-conexao` e `proibe-conexao`; um fan-out viraria
> `limita-grau`, que não existe ainda. Um botão que abre um formulário onde a
> regra não cabe é pior que botão nenhum (§244)."*

A decisão de não entregar um botão morto estava certa. O que estava errado foi
**parar ali**: a leitura sabe dizer *"este serviço faz 3 chamadas que
esperam"*, e o time não tem como transformar isso em régua. O fato fica sendo
fato para sempre, e a pergunta "e daí?" não tem resposta.

> **É o passo #2 da ordem declarada — o mais central dos que seguem abertos — e
> ele está incompleto por uma checagem.**

`exige-conexao` e `proibe-conexao` cobrem **presença e ausência**. Falta a
terceira forma que um padrão de topologia assume: **quantidade**. "No máximo
três chamadas que esperam saindo de um serviço" não é presença nem ausência —
é grau, e é justamente o padrão que a leitura mais produz.

## 3. A checagem que falta

```ts
export type ChecagemDeTopologia =
  | { tipo: "exige-conexao"; … }
  | { tipo: "proibe-conexao"; … }
  /** SPEC-67 — o padrão como QUANTIDADE. */
  | {
      tipo: "limita-grau";
      tipoNo: string;
      direcao: "entra" | "sai";
      maximo: number;
      /** Restringe a contagem a um tipo de conexão. */
      tipoAresta?: string;
      /**
       * Conta só as conexões em que quem chama ESPERA a resposta (SPEC-65).
       * É o que separa "faz três chamadas antes de responder" — que soma
       * latência e propaga falha — de "publica em três filas", que não segura
       * ninguém. Sem isto, a régua acusaria o desenho assíncrono correto.
       */
      apenasQueEsperam?: boolean;
    };
```

### 3.1 Por que `apenasQueEsperam` não é detalhe

É o que impede a régua de nascer errada. Um serviço que publica em quatro filas
está fazendo exatamente o que se recomenda; um que chama quatro serviços
síncronos antes de responder é o problema. **Os dois têm grau de saída 4.**

Uma régua de grau que não distingue os dois casos é um linter de grafo — o que a
SPEC-63 §1 recusou. Este campo é o que a mantém sendo *"o desenho contraria o
padrão do time?"*.

### 3.2 A conta, e o que ela acusa

Para cada nó do tipo, conta as conexões (na direção pedida, do tipo pedido,
filtradas por `arestaEspera` quando `apenasQueEsperam`). Acima do máximo, o
**nó** é acusado — não as arestas: o excesso é uma propriedade do nó, e apontar
quatro arestas obrigaria a pessoa a escolher qual sobra, que é decisão dela.

`atual` diz o número real ("4 conexões que esperam"), porque *"acima do
máximo"* sem o número não diz de quanto é o excesso.

## 4. O clique

Com `limita-grau` de pé, a promessa da SPEC-65 §6.3 se cumpre sem invenção:

| Leitura | Régua que ela vira |
|---|---|
| `srv-credito-api` faz **3** chamadas que esperam | `limita-grau` · `tipoNo` = tipo do nó · `direcao: "sai"` · `maximo: 2` · `apenasQueEsperam: true` |
| **4 saltos** que esperam até o bureau | *(sem checagem — ver §4.2)* |

O clique leva ao `ConstrutorDeForma` (§287) com **texto, porquê e checagem já
montados**. Três decisões:

1. **`maximo` nasce em `atual - 1`**, não em `atual`. A régua existe para
   cobrar o desenho que a motivou; nascer permitindo-o faria o primeiro uso
   parecer quebrado;
2. **o texto e o porquê nascem preenchidos e editáveis.** A frase da leitura é
   um bom começo e não é a régua do time — quem publica assina, e assinar exige
   poder mudar;
3. **nada é gravado pelo clique.** Ele abre o construtor; gravar continua sendo
   um segundo gesto, com o RBAC de `regras.topologia` valendo. "Um clique" é
   sobre não ter que reconstruir a régua à mão, não sobre pular a decisão.

### 4.2 A leitura de CADEIA não vira régua, e isso fica escrito

Profundidade ("4 saltos que esperam") só viraria régua com uma checagem sobre
**caminho**, não sobre nó — e essa já existe noutro escopo: `percursos[]`, com
`ChecagemDePercurso` (SPEC-57/64). Criar uma checagem de topologia para isso
seria a mesma pergunta em dois lugares, e duas verdades sobre o mesmo assunto.

Então o verbo "virar régua" aparece **só onde ele leva a algum lugar**: no
fan-out. Na cadeia, não aparece — mesma disciplina do §244 aplicada campo a
campo, e não à tela inteira.

## 5. O que NÃO entra, e por quê

### P5 — modo de operação

A SPEC-56 §7 estimou *"custo quase zero — é `when`, que o engine já avalia"*.
**Medi, e não é.** `avaliarCondicao` é chamado por `camposVisiveis`, e este por
seis lugares: prontidão, especificação de entrega, refinamento, revisão de
quebra, painel de propriedades e o próprio engine. Um eixo novo de condição
atravessa os seis, e o modo precisa vir da quebra até cada um deles.

Não é caro por ser difícil — é caro por ser **transversal**, e trabalho
transversal feito junto com trabalho novo é como se erra nos dois. Fica para
uma SPEC própria, e a SPEC-66 já entregou a metade dele que era barata (trocar
números de entrada e refazer contas).

### P6 — variante A vs B

A própria SPEC-56 §8 aponta o risco: *"variante não pode ser copiar a quebra e
editar, ou as duas divergem e ninguém sabe qual venceu"*. Fazer certo é **uma
quebra com duas variantes** e uma decisão registrada de qual foi adotada —
modelo, servidor, tela e migração. É uma SPEC inteira, não uma fatia.

### P7 — dialeto de provedor

> **§335 — esta seção estava errada sobre o próprio produto, e a medição
> corrigiu.**
>
> O texto abaixo dizia que o eixo do provedor não existia. **Existe, e é
> automático.** `config/diagrama.example.json` traz
> `kafka → contextos: ["Backend-mensagens kafka"]` e
> `rabbit → ["Backend-mensagens rabbitmq"]`, e o `regras` de fábrica já
> condiciona por eles — *"dimensionar prefetch"* só no Rabbit, *"definir chave de
> particionamento"* e *"consumer group e política de offset"* só no Kafka.
>
> Ou seja: pôr um tópico Kafka na mesa **já traz as perguntas do Kafka e não as do
> Rabbit**, sem ninguém configurar nada. Que é exatamente o valor que a SPEC-56 §9
> atribuiu ao passo: *"saber que a fila é SQS e não RabbitMQ muda as perguntas do
> painel… e isso é config, não engine."* É config, e a config já faz.
>
> O que sobra é o **mapeamento de equivalência** entre nuvens (SQS ≡ Service Bus
> ≡ Pub/Sub) — e é a parte que a própria SPEC-56 §9 examinou e reprovou no
> original: *"o mapeamento deles é ingênuo — pega o primeiro componente da mesma
> categoria."*
>
> **Decisão do usuário: fechar o P7 como atendido**, sem construir a
> equivalência. Ela tem um uso legítimo que o P7 não nomeia — *"desenhei com
> Rabbit e vamos para SQS: o que muda no meu checklist?"* —, mas isso é pergunta
> de MIGRAÇÃO, e seria uma SPEC própria com outro escopo.

A SPEC-56 §9 já o chamou de *"menor prioridade da lista — o que mais parece
impressionante numa demo e o que menos muda o item derivado"*. Segue valendo.

## 6. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | `limita-grau` no engine: tipo, avaliação, `apenasQueEsperam`, validação | unitário: 4 chamadas síncronas acusam, 4 publicações não |
| **B** | O editor: a terceira checagem no `ConstrutorDeForma`, com prévia | unitário: a frase da prévia diz o máximo e o "que esperam" |
| **C** | O clique: `onVirarRegua` monta a régua do fato e abre o construtor | E2E: da leitura ao construtor preenchido, sem digitar |
| **D** | PDCA e RBAC: a operação de ajuste aceita a checagem nova | unitário no servidor |

## 7. Perguntas em aberto

1. **O clique navega para `#/config/regras` ou abre um construtor na mesa?**
   Recomendação: **navegar**. O construtor já vive lá, com a lista das réguas
   existentes ao lado — e uma régua nova sem ver as que já existem é como se
   cria a segunda régua que contradiz a primeira.
2. **`maximo: atual - 1` quando `atual` é 2?** Daria `maximo: 1`, uma régua que
   proíbe qualquer fan-out. É severa, mas é o que a leitura mediu — e o campo é
   editável antes de gravar. Sem tratamento especial.
3. **Régua de grau deveria contar conexões que a leitura ignorou** (tipo sem
   `espera` declarado)? Não: com `apenasQueEsperam`, contar o que não se sabe
   inflaria o grau e acusaria por ignorância. Elas ficam de fora, como na
   leitura.
