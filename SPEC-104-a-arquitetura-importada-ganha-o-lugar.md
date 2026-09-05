# SPEC-104 — A arquitetura importada ganha o lugar dela?

> **Origem:** o usuário abriu a tela pela primeira vez, com o dublê respondendo,
> e reagiu:
>
> > *"aqui ficou muito estranho, eu clico nos botões e não aparece nada, a
> > proposta aqui também não ficou clara"*
>
> > *"casa? que casa? o que isso significa?"*
>
> E, ao ser perguntado como consertar:
>
> > *"não vi sentido na feature como está, vamos reavaliar, não quero esticar
> > demais o projeto, precisamos avaliar onde isso seria usado"*
>
> **Esta SPEC não conserta a tela. Avalia se ela deve existir.**

---

## 0. A medição

A feature é a SPEC-81 fatia F: importar a **arquitetura de negócio** de um
sistema externo e propô-la campo a campo no contexto do produto.

### 0.1 O que ela custa

| Peça | Onde |
|---|---|
| Porta + proposta campo a campo | `portas/leitorDeArquiteturaDeNegocio.ts` (125 linhas) |
| Painel | `config/PropostaDeArquitetura.tsx` (191 linhas) |
| Adaptador | `adaptadores/gatewayDoTime.ts` |
| Rota | `routes/produtos.ts:141` |
| Fiação | `config/ProdutosTab.tsx` |
| Operação na lista FECHADA | `OPERACOES_DO_GATEWAY` |
| Dublê | `/v1/arquitetura` (§355) |
| Testes | 1 arquivo de unidade — **nenhum E2E** |

### 0.2 Os três defeitos que o usuário encontrou em um minuto

1. **A escrita é invisível.** O painel é renderizado em `ProdutosTab.tsx:429`; os
   campos que ele preenche estão em `:289` — **140 linhas acima**, fora da tela.
   Clicar em *"trazer"* faz `setRascunho(...)` e o texto cai onde ninguém está
   olhando. O único retorno é o rótulo virar `aceito` — que é **estado**, não
   ação (`jaAceito ? "aceito" : "trazer"`), e por isso parece um botão morto.
2. **Dois botões idênticos com semânticas diferentes.** Campo (`:433`) preenche o
   rascunho e espera "Salvar contexto". Termo do glossário (`:434`) **grava no
   servidor na hora**. Um é reversível, o outro não, e nada diz qual é qual.
3. **"Casa" é jargão nosso.** Significa *"os sistemas da própria empresa"* nas
   SPECs e não significa nada na tela. Vazou para **17 lugares visíveis**.

> **Nada disso é coincidência: é a consequência de não haver E2E.** Cada peça
> passa sozinha; ninguém nunca clicou. É a mesma forma do §349 (§356 mediu) e do
> `tokens` (§354) — construído, testado isolado, nunca exercitado.

### 0.3 O achado que muda a pergunta

**Já existem duas outras formas de preencher exatamente os mesmos campos.**

O alvo `contexto-do-produto` do assistente (§274) tem o **schema idêntico** —
`objetivo`, `quemUsa`, `regrasDeNegocio`, `sistemas`, `restricoes`:

| Caminho | Entrada aceita | Exige da empresa |
|---|---|---|
| `contexto-do-produto` (§274) | conversa, voz, imagem | nada |
| **link → texto → assistente** (§356) | **qualquer página** | um gateway que devolve texto |
| `arquiteturaDeNegocio` (esta) | só o contrato próprio | **um endpoint com a forma interna deste produto** |

E o terceiro **nasceu depois desta feature**: quando o §356 ligou a leitura por
link, ele criou um caminho estritamente mais geral para o mesmo destino.

---

## 1. Onde ela seria usada — a pergunta do usuário

Respondendo com o que dá para medir:

**O contexto do produto é preenchido UMA VEZ por produto.** Não é por demanda.
Compare com as irmãs, que se pagam a cada uso:

| Operação | Frequência de uso |
|---|---|
| `adr` | **por demanda** — toda entrega pode ter decisão anterior |
| `documentoExterno` | **por demanda** — todo desenho pode nascer de um documento |
| `documento` (publicar) | **por demanda** |
| `itens` | **por demanda** |
| `arquiteturaDeNegocio` | **uma vez por produto, na vida** |

**E o contrato é o mais caro dos cinco.** `/adr` devolve decisões, `/documento-externo`
devolve texto — formas que qualquer sistema tem. `arquiteturaDeNegocio` exige um
JSON com a forma do `Produto` **deste** produto. Nenhum Confluence tem isso: a
empresa teria de escrever um tradutor sob medida para uma operação de uso único.

> O cálculo fica assim: **a empresa constrói um endpoint sob medida para
> economizar uma colagem que acontece uma vez.** Enquanto isso, colar o link da
> mesma página no §356 já funciona e não exige nada.

### 1.1 Quando ela GANHARIA o lugar

Sendo justo com a feature, existe um caso em que ela vence:

**Uma casa com registro de arquitetura legível por máquina** — LeanIX, Ardoq,
um CMDB, uma planilha canônica — **e muitos produtos para cadastrar**. Aí o
import estruturado bate a conversa, porque se repete por produto e a fonte já é
estruturada.

**Não temos evidência de que este seja o caso.** É o tipo de coisa que aparece
com nome quando aparece.

---

## 2. As três saídas

| # | Saída | O que custa | O que arrisca |
|---|---|---|---|
| **A** | **Remover** | apagar ~320 linhas, a operação da lista, a rota e o dublê | perder a feature se o caso da §1.1 aparecer — mas ela volta com evidência |
| **B** | **Consertar** | os três defeitos da §0.2 + escrever o E2E que nunca existiu | manter um caminho de uso único que compete com dois melhores |
| **C** | **Encolher** | manter a leitura, jogar o texto no assistente como o §356 faz, e apagar o painel campo a campo | é quase o A, com um endpoint a menos para a empresa escrever |

### 2.1 DECIDIDO: **A** (§358)

> O usuário, com o argumento que fecha a questão:
>
> > *"para contexto de produto existe confluence, acho melhor tirar isso"*
>
> É o cálculo da §0.3 dito em uma linha: o contexto do produto **já mora** num
> lugar que o §356 sabe ler. Um endpoint sob medida para a mesma coisa é trabalho
> duplicado — do lado da empresa, que é o lado que menos deveria pagar.

### 2.2 A recomendação era **A**, e o motivo é o §242

*"Não inventar mecanismo antes de o problema aparecer com nome."* A fatia F foi
construída junto com as irmãs por simetria — as outras quatro nasceram de pedido
com nome, esta nasceu de *"e a arquitetura também"*.

O §356 tornou-a redundante sem que ninguém percebesse. E o que a mantém viva hoje
é custo afundado, não uso.

> Se **C** parecer menos brusco, ela é honesta também: preserva a ideia (*"traga
> o que a empresa já escreveu"*) usando o caminho que já provou funcionar, e
> devolve as 191 linhas do painel.

---

## 3. O que esta SPEC RECUSA

- **Consertar a tela antes de decidir se ela fica.** Polir os três defeitos custa
  mais que o A inteiro, e o resultado seria uma tela boa que ninguém usa.
- **Decidir por simetria.** Foi o que criou a fatia F: as outras quatro existem,
  logo esta também. Simetria não é evidência de uso.
- **Manter "casa" na interface** — independente do que se decida aqui. São 17
  lugares, e a pergunta *"que casa?"* veio do usuário do produto. Isso é rodada
  própria, e vale mesmo que esta feature morra.

---

## 4. Fatias

- **A — a decisão.** Do usuário, não do código.
- **B — tirar "casa" da interface**, nos 17 lugares. **Independente desta SPEC**,
  e a única parte que eu faria sem perguntar. **Prova:** nenhuma string visível
  usa a palavra; onde há destino cadastrado, a tela ecoa o rótulo que o usuário
  deu.
- **C — o E2E que falta**, se a saída for **B** da §2.

---

## 5. Perguntas em aberto

1. **A empresa tem registro de arquitetura legível por máquina?** É a §1.1, e é
   ela que decide. **Não medimos** — e é pergunta para o usuário, não para o
   código.
2. **Quantos produtos serão cadastrados?** Com um punhado, qualquer import perde
   para a conversa. Com dezenas, o cálculo muda.
3. **Os outros quatro destinos têm uso previsto?** `adr` e `documentoExterno`
   sim, pelo que o usuário descreveu. `arquiteturaDeNegocio` é o único sobre o
   qual ele disse *"não vi sentido"*.

---

## 6. Para quem implementar

- `packages/aplicacao/src/portas/leitorDeArquiteturaDeNegocio.ts`
- `packages/web/src/config/PropostaDeArquitetura.tsx` e a fiação em
  `ProdutosTab.tsx:289,429,433`
- `packages/server/src/routes/produtos.ts:141`
- `OPERACOES_DO_GATEWAY` em `config/normalizacao.ts` — lista FECHADA: tirar uma
  operação é decisão, como acrescentar foi (§349)
- **§274** (o assistente preenche o contexto) e **§356** (o link vira texto) — os
  dois caminhos que tornaram esta redundante
