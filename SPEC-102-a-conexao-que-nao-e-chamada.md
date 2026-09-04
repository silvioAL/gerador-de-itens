# SPEC-102 — A conexão que não é chamada

> **Origem:** o usuário, com print do canvas:
>
> > *"no motor FICO a informação passa de um fluxo dentro de um motor e depois de
> > um motor para o outro dentro, mas consta http, além de ajustar isso, é
> > necessário que o usuário possa usar o agente para ajustar isso, pois
> > eventualmente vai acontecer, já existe suporte a configurar no assistente,
> > mas nao temos como colocar a imagem tal como estou te mandando"*
>
> O print mostra `FLUXO DECISÃO (FICO) · aprovacao-credito-fico` ligado a
> `MOTOR DE REGRAS · Motor de Regras` por uma aresta rotulada **HTTP**.

---

## 0. A medição

### 0.1 De onde veio o HTTP

Não é fixture errada. **Nenhum exemplo do repositório tem uma aresta
`fico → motor`** — varredura em `config/cenarios/*.json` e `exemplos/*.json`:

| Arquivo | Arestas que envolvem `fico` |
|---|---|
| `config/cenarios/fico.json` | `service → fico` (`http`) |
| `config/cenarios/credito-completo.json` | `camunda → fico` (`orchestrates`), `fico → external` (`http`), `fico → mongo` (`writes`) |
| `exemplos/quebra-aprovacao-credito.json` | idem |

A aresta do print foi **desenhada à mão**, e o tipo foi escolhido pelo produto,
não pela pessoa. A origem é `config/diagrama.example.json`, bloco `edgeRules`:

```
fico      -> default: http | valid: ["http", "orchestrates"]
motor     -> default: http | valid: ["http", "grpc", "orchestrates"]
_fallback -> default: http
```

`edgeRules` é indexado pelo **tipo de nó de DESTINO** (`DiagramaConfig.edgeRules`,
`packages/engine/src/config/types.ts:187`). Ligar qualquer coisa num
`Motor de Regras` cai em `edgeRules.motor.default`, que é `http`.

> **Este é o mecanismo de inferência que o produto já tem**, e ele funciona: é
> por ele que ligar um serviço numa exchange nasce *"publica"*
> (`rabbit-exchange -> default: publishes`), e num Camunda nasce *"orquestra"*.
> Nada aqui introduz inferência — o `http` do print **é** a inferência,
> respondendo certo a uma tabela que está errada.

### 0.2 O achado que muda o tamanho do conserto

**O vocabulário não tem como dizer o que o FICO faz.** Os treze tipos de aresta
declarados são todos de rede ou de broker:

`http` · `grpc` · `graphql` · `publishes` · `consumes` · `pubsub` · `reads` ·
`writes` · `readwrite` · `orchestrates` · `binding` · `triggers` · `validates`

Nenhum expressa **invocação dentro do próprio motor**. Trocar o `default` sem
criar o tipo trocaria um rótulo errado por outro.

### 0.3 Por que o rótulo errado não é cosmético

`edgeTypes.http` carrega um `spec` com quatro campos — `timeoutMs`,
`tentativas`, `esperaEntreMs`, `disjuntor` — que são as perguntas de resiliência
de uma chamada **de rede**.

Chamar de `http` uma invocação em processo faz o produto **cobrar as quatro**:
elas aparecem no formulário da conexão, entram na completude do desenho, e a
leitura de resiliência (SPEC-68) e o cálculo de latência (SPEC-65, via
`EdgeTypeConfig.espera`) passam a raciocinar sobre disjuntor e backoff de uma
chamada que nunca sai do processo.

> Não é uma etiqueta feia. É a ferramenta **fazendo a pergunta errada**, e
> registrando a resposta como se fosse fato do desenho.

### 0.4 A limitação que o conserto encosta, e não resolve

`EdgeRule` é `{ valid: string[]; default?: string }` (`config/types.ts:178`),
indexado **só pelo destino**. O default não pode depender da origem.

Para o `motor` isso importa: `fico → motor` é interno, mas `service → motor`
(um motor de regras exposto como serviço) é `http` legítimo. Com o índice atual,
**um dos dois vai errar o default**.

Esta SPEC escolhe qual, e diz por quê (§3). Não estende `EdgeRule` — ver §6.

### 0.5 A imagem no assistente: existe, e está no painel errado

O suporte a imagem **já está construído** (SPEC-30 Fase 2):

| Peça | Onde |
|---|---|
| Componente de anexo | `packages/web/src/conversa/AnexoDeImagem.tsx` |
| Envio ao provedor | `packages/llm/src/provedorOpenAI.ts:338` (`{type:"image_url"}`) |
| Porteiro de capacidade | `capacidades.visao`, com erro próprio quando o modelo não enxerga (`provedorOpenAI.ts:215`) |

E está ligado em **um só lugar**: `ConversaPanel.tsx:275` — a conversa que
constrói o **desenho**.

O `ConfigurarPanel.tsx` (a aba "⚙ Configurar" do assistente flutuante, que é o
que a SPEC-34 entregou para configurar conversando) tem **voz**
(`useVozNaEntrada`, `:147`) e **não tem imagem**.

### 0.6 E há um segundo bloqueio, que o pedido não previu

O usuário supôs que a imagem era o que faltava. **Não é suficiente.**

O `ConfigurarPanel` só sabe produzir dois objetos —
`apiIa.sugerirConfig<ObjetoCampo | ObjetoPapel>` (`:217`): um **campo** (de nó ou
de aresta) e um **papel** do pipeline de agentes.

Ele não tem vocabulário para *"mude o tipo padrão das conexões que chegam no
Motor de Regras"*. Com a imagem anexada e sem isto, o assistente entenderia o
print e não teria o que devolver.

---

## 1. As três coisas erradas, separadas

| # | O quê | Onde morde |
|---|---|---|
| **1** | Não existe tipo de aresta para invocação interna | `config/diagrama.example.json`, `edgeTypes` |
| **2** | O default de quem chega no motor é `http` | idem, `edgeRules` |
| **3** | O assistente não vê imagem **nem** sabe mexer em `edgeRules` | `ConfigurarPanel.tsx` |

A **1** é pré-requisito da 2. A **3** é o que faz o usuário não depender de nós
na próxima vez — e é a que ele chamou de mais importante.

---

## 2. Fatia A — o tipo de aresta que faltava

Um `edgeType` novo, em config (nada no engine é hardcoded — contrato de
genericidade do `DiagramaConfig`):

```json
"interno": {
  "label": "interno",
  "color": "#0891b2",
  "verbo": "decide internamente com",
  "tamanhoPadrao": "P",
  "espera": true
}
```

**Sem `spec`**, deliberadamente — no molde de `orchestrates` e `validates`, que
também não têm. As quatro perguntas de resiliência do `http` são exatamente o
que não se aplica aqui (§0.3), e `fico.spec.fallback` (*"Comportamento se o
motor não decidir"*) já cobre a pergunta que sobra.

**`espera: true`** e isto é uma afirmação, não um default copiado: a invocação
interna é síncrona e **soma latência** — só não soma latência *de rede*. Dizer
`espera: false` faria a leitura da SPEC-65 dar o caminho como assíncrono e parar
de somar um tempo que existe.

O `verbo` foi escolhido para ler bem na atividade derivada, que monta
`${source.label} ${verbo} ${target.label}` (`derivar.ts:208`):

> *"aprovacao-credito-fico decide internamente com Motor de Regras."*

**Prova:** uma aresta `interno` entre dois nós não oferece campo de timeout,
tentativas nem disjuntor; e a descrição derivada é a frase acima.

## 3. Fatia B — o default de quem chega no motor

```
motor -> default: "interno" | valid: ["interno", "http", "grpc", "orchestrates"]
fico  -> default: "http"    | valid: ["http", "orchestrates", "interno"]
```

**Por que o `motor` muda de default e o `fico` não** (a escolha da §0.4):

- Quem chega num **Motor de Regras** é, no caso comum, um fluxo de decisão ou
  outro motor — as duas relações que o usuário descreveu. `http` continua em
  `valid` para o motor exposto como serviço, que existe e é legítimo.
- Quem chega num **Fluxo de Decisão (FICO)** é, no caso comum, uma aplicação de
  fora (`service → fico`, que é o próprio `config/cenarios/fico.json`) ou um
  orquestrador. O default `http` está certo ali. `interno` entra em `valid`
  porque motor→fluxo interno também acontece.

**Prova:** ligar um `fico` num `motor` no canvas nasce `interno`; o cenário
`fico.json` continua abrindo com `service → fico` em `http`, sem alteração de
fixture.

## 4. Fatia C — imagem no assistente de configuração

`AnexoDeImagem` no `ConfigurarPanel`, no molde exato do `ConversaPanel:275`
(mesmos props: `imagens`, `onMudar`, `destino`, `desabilitado`), e as imagens
viajando em `apiIa.configurar`.

Sem inventar caminho: o provedor já anexa imagem **só na última mensagem**
(`provedorOpenAI.ts:319`), de propósito, para não multiplicar tokens a cada
turno. A fatia é fiação, não mecanismo.

**Prova:** anexar um print na aba "⚙ Configurar" e o modelo responder sobre o
que está na imagem; com modelo sem `visao`, o erro é o específico que já existe,
não um 400 cru.

## 5. Fatia D — o assistente sabendo mexer em conexão

> **Adiada no §352, entregue no §354.** A medição durante a implementação mostrou
> que ela é várias vezes maior do que esta SPEC supunha, e que a decisão que ela
> exige não é técnica. O §353 fechou a CI; o §354 tomou a decisão de escopo
> (§5.3) e construiu. As §§5.1–5.2 ficam como estavam — são o registro de por que
> a fatia parou, e a razão continua verdadeira.

Um terceiro objeto ao lado de `ObjetoCampo | ObjetoPapel`: a regra de conexão —
para um tipo de nó de destino, qual o `default` e quais os `valid`.

### 5.1 O que a implementação encontrou

**`edgeRules` não tem caminho de escrita nenhum.** Não é que a rota falte: não
existe superfície.

| O que | Onde vive | Tem escrita? |
|---|---|---|
| `campos_no` / `campos_aresta` | tabela no Postgres | sim (CRUD + RBAC) |
| `regras`, `pipeline-agentes`, `exportador`, `tokens` | `config_documentos` | sim |
| **`edgeTypes`, `edgeRules`, `nodeTypes`** | **`config/diagrama.json`, arquivo estático** | **não** |

`CHAVES_CONFIG` é lista **fechada** —
`["regras", "pipeline-agentes", "exportador", "tokens"]`
(`aplicacao/src/portas/repositorioDeConfig.ts:29`). O web lê o diagrama por
`fetch("/config/diagrama.json")` (`web/src/config/loadConfig.ts`); só `spec` de
nó e de aresta recebe sobreposição do banco.

### 5.2 Por que isso para a fatia aqui

Dar ao assistente o poder de propor a mudança sem ter onde aplicá-la seria
entregar um cartão com o botão "Aplicar" desabilitado para sempre — pior que não
ter o cartão.

E construir a superfície não é trabalho mecânico: exige decidir **de quem é o
vocabulário de conexão**. As mesmas perguntas da configuração por time voltam
inteiras — vale por time ou é organizacional? quem cura? o time pode contrariar
o padrão da arquitetura?

> É exatamente a pergunta que o usuário levantou no mesmo dia sobre a
> configuração de MCP/tracker (*"acho que o adequado seria que fizesse parte da
> governança global"*), e que ficou reservada para a **SPEC-97**, que ainda não
> existe.

Decidir isso dentro de uma rodada de conserto de config seria escolher a
governança do produto de passagem, sem a discussão que o usuário pediu.

> **O que mudou depois:** o usuário pediu para fechar a 102 primeiro. A §5.3
> mostra que, para **esta** chave, a resposta não precisava da SPEC-97 — ela é
> ler o que já vale e não inventar eixo novo. A pergunta geral de governança
> continua aberta e continua sendo da 97.

### 5.3 A decisão de escopo, tomada (§354)

> **Atualização.** O usuário pediu para **fechar a 102 antes da 97**. Isso obriga
> a responder aqui a pergunta que a §5.2 tinha reservado — e ela tem uma
> resposta conservadora, que é preservar o que já vale hoje.

**O vocabulário de conexão é ORGANIZACIONAL. Sem sobreposição por time.**

Três razões, e a terceira é a que decide:

1. **É o que já é.** `nodeTypes`, `edgeTypes` e `edgeRules` são servidos de **um
   arquivo só** para todo mundo. Não existe versão por time e nunca existiu — a
   decisão não inventa eixo, mantém o que há e só lhe dá caminho de escrita.
2. **Há precedente assinado.** As `stacks` (SPEC-43) são organizacionais, e o
   vínculo por time foi **removido** na migração 0026 a pedido do próprio
   usuário (*"poderia simplesmente ter tudo"*). O mesmo raciocínio se aplica: um
   catálogo compartilhado não melhora ao ser fatiado.
3. **Por time quebraria o determinismo.** *"Esta chamada não atravessa a rede"* é
   um fato da arquitetura, não uma preferência de time. Se o time A disser que
   `fico → motor` é `interno` e o time B disser que é `http`, **o mesmo desenho
   passa a produzir itens diferentes** — que é exatamente o argumento com que a
   SPEC-101 §4 recusou regra por time do nó. Recusá-lo lá e aceitá-lo aqui seria
   incoerente.

**O que isto NÃO decide:** nada sobre `regras`, `campos_no`, `exportador` ou
qualquer outra chave. A SPEC-97 continua dona da pergunta geral — inclusive da
camada organizacional que **soma** (arquitetura/DBA impondo piso), que é problema
diferente deste.

### 5.4 O tamanho real, medido antes de construir

Cinco superfícies, e nenhuma é opcional:

| # | Superfície | Por que é obrigatória |
|---|---|---|
| 1 | Chave nova em `CHAVES_CONFIG` | é onde o documento passa a morar |
| 2 | Recurso novo em `RECURSOS` | `permissoes.cobertura.test.ts` lê o código das rotas e **reprova** recurso que nenhuma rota exige |
| 3 | **Resolução no SERVIDOR** (`GET /config/diagrama`) | o arquivo continua sendo a base; o documento **sobrepõe** por tipo de nó |
| 4 | Aba em Configurações | o `ConfigurarPanel` é *"um jeito novo de chegar ao caminho velho"*; os cinco alvos existentes têm formulário, e um alvo sem aba seria a primeira config que **só se muda conversando com um LLM** |
| 5 | Alvo no assistente | o pedido original |

### 5.4.1 Duas correções de rumo durante a construção

**O `if` que era modelo de dados.** A escolha do recurso saiu como
`chave === "conexoes" ? … : "pipeline-agentes"`. O usuário apontou, e ele está
certo: a relação chave→dono **é dado**. Virou
`RECURSO_DA_CHAVE_DE_CONFIG`, um `Record<ChaveConfig, …>` exaustivo — chave nova
não compila sem declarar de quem é. O `else` anterior concedia em silêncio a
permissão de outra área.

**A resolução que estava no cliente.** A primeira escrita mesclou as
sobreposições no `loadConfig.ts`. *"Coisas do backend precisam ficar no
backend"* — e o motivo concreto: `validateConfig` roda no servidor e confere
`edgeRules` contra `edgeTypes`. Com a mescla só no navegador, **o servidor
validaria as regras do arquivo enquanto o canvas usa as sobrescritas**, e uma
sobreposição inválida nunca passaria pela validação.

A mescla foi para `aplicacao/config/diagnostico.ts` (`aplicarRegrasDeConexao`) e
o servidor ganhou `GET /config/diagrama`, que devolve o diagrama já resolvido. O
web fetcha essa rota, com fallback para o arquivo estático se o servidor não
responder.

> **Fica anotado:** `mesclarCamposCustomizados` e `mesclarCamposCustomizadosAresta`
> continuam no web, fazendo a mesma coisa para `campos_no`/`campos_aresta`. Não
> foram movidos nesta rodada — mas são a mesma classe, e a rota nova é onde eles
> devem ir.

### 5.5 O que fica registrado

O pedido do usuário que originou a fatia:

> *"é necessário que o usuário possa usar o agente para ajustar isso, pois
> eventualmente vai acontecer"*

Hoje, com A+B+C, ele consegue **mostrar** o problema ao assistente e receber a
explicação. Não consegue aplicar a correção pelo assistente: a correção é edição
do `config/diagrama.json`.

> **Corte executado:** **A+B** consertou o desenho de hoje. **C** entregou o
> print ao assistente de configuração. **D** está bloqueada por uma decisão de
> governança, não por esforço.

---

## 6. O que esta SPEC RECUSA

- **Estender `EdgeRule` para default por ORIGEM.** É a correção "certa" da §0.4,
  e é a única recusa de mecanismo desta SPEC.

  Vale ser exato sobre o que está sendo recusado, porque a inferência **por
  destino já existe e é justamente o que esta SPEC usa** (§0.1): serviço →
  exchange nasce `publishes`, serviço → Camunda nasce `orchestrates`. O default
  por destino não é esperteza nova, é a tabela de sempre.

  O que não se faz agora é a inferência passar a olhar **o par** (origem +
  destino). Com `motor → interno` e `fico → http`, o caso relatado fica certo e
  nenhum outro piora. Volta quando aparecer um destino em que os dois defaults
  doam de verdade, com o desenho na mão — §242.
- **Migrar desenho existente.** Nenhuma quebra do repositório tem `fico → motor`
  (§0.1). Se alguma instalação tiver, o `http` continua em `valid` do motor —
  ela não quebra, só deixa de ser o default.
- **Remover `http` de `edgeRules.motor.valid`.** Motor de regras exposto por
  HTTP existe. Tirar seria trocar um default errado por uma proibição errada.
- **Dar `spec` de resiliência ao `interno`.** É o §0.3 ao contrário.
- **Mexer no `_fallback`.** `http` como último recurso para tipo desconhecido
  continua sendo o palpite menos ruim.

---

## 7. Perguntas em aberto

1. **O nome do tipo.** `interno` diz o que ele *não* é (não é rede), que é a
   propriedade que importa. `delega` diria a relação. Escolhi `interno` porque é
   a afirmação que muda o comportamento do produto — mas é revisável, e o custo
   de trocar antes de existir desenho gravado é zero.
2. ~~**`fico.spec.motorPadrao` vira redundante?**~~ **DECIDIDO pelo usuário: o
   nó, não o campo de texto.**

   > *"precisa de nós que desdobra em tasks, assim mantemos a unidade de medida"*

   O campo `motorPadrao` nomeia o motor e **não produz item nenhum** — a
   derivação só olha nós e arestas. Um motor declarado em texto é trabalho que
   não aparece no backlog. Um nó `motor` com `status: novo` desdobra numa Task
   (`derivarNo` → `derivarCriacaoGenerica`), e a aresta `interno` desdobra na sua
   própria atividade (`derivarEdge`).

   Portanto a fatia B é o que **preserva a unidade de medida**: ao fazer
   `fico → motor` nascer `interno` em vez de `http`, o motor vira nó de verdade
   no desenho e o trabalho passa a ser contável. `motorPadrao` continua onde
   está — despromovê-lo é mudança de formulário, e esta rodada não mexe nisso.
3. **Motor → motor precisa de tipo próprio?** O usuário descreveu *"de um motor
   para o outro"*. `interno` cobre; se a relação entre motores tiver régua
   própria (ordem, precedência de domínio), ela pede tipo próprio — com
   evidência.
4. **A fatia D deve poder criar `edgeType` novo, ou só editar `edgeRules`?**
   Recomendação: **só `edgeRules`** nesta rodada. Criar tipo de aresta é mexer no
   vocabulário compartilhado, e é o tipo de mudança que a §2 desta SPEC mostra
   precisar de decisão sobre `espera`, `spec` e `verbo` — não de uma proposta de
   uma frase.

---

## 8. Para quem implementar

- `config/diagrama.example.json` — `edgeTypes` (fatia A) e `edgeRules` (fatia B).
  É o único arquivo de config com estes blocos; `config/domains/*.diagrama.json`
  são de `job` e `rabbit` e não os declaram.
- `packages/engine/src/config/types.ts:178` — `EdgeRule`, e `:159`/`:175`
  (`fluxo`, `espera`) para o significado dos campos da fatia A.
- `packages/engine/src/derive/derivar.ts:208` — onde o `verbo` vira frase.
- `packages/web/src/conversa/AnexoDeImagem.tsx` e `ConversaPanel.tsx:275` — o
  molde da fatia C.
- `packages/web/src/assistente/ConfigurarPanel.tsx:217` — `sugerirConfig`, onde
  o terceiro objeto da fatia D entra.
- `config/diagrama.schema.json` — valida `edgeTypes`/`edgeRules`; conferir se o
  tipo novo passa sem alteração de schema.
- **SPEC-30** (imagem na conversa) e **SPEC-34** (configurar conversando) — as
  duas metades que a fatia C junta.
