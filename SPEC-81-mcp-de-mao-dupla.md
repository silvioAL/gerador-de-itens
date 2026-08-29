# SPEC-81 — O gateway do time: ADR, arquitetura de negócio e as saídas

> **Origem:** o usuário — *"implementar tudo o que falta"*, com **ambição
> completa**, mais três mensagens que definiram o que este estágio é:
>
> > *"seria interessante ter conector para o MCP em determinado estágio interagir
> > com **arquitetura de negócio** e **ADR (arquitetura técnica)**: fazem parte da
> > camada perene/determinística de processos corporativos."*
> >
> > *"uma ADR deveria poder vir do MCP e **conversar com o assistente e virar
> > desenho**."*
> >
> > *"também é necessário revisar as saídas… via alguma chamada **exclusiva** ao
> > MCP (separada das de publicação dos itens no issue tracker), também publicar
> > os **design docs** no Confluence."*
>
> E a correção que reescreveu esta SPEC:
>
> > *"não é isso, vou chamar um **gateway via REST** normalmente, nele tem o MCP.
> > É mais simples."*

---

## 0. A correção que dissolveu metade desta SPEC

A primeira escrita desta SPEC tratava MCP como **protocolo a implementar**: o
produto viraria servidor MCP, escolheria um SDK, resolveria transporte atrás de
nginx. A §5 chegava a se autobloquear — *"não medimos qual SDK; não escrever a
fatia A antes disso"*.

**Nada disso é necessário.** O produto fala **REST com um gateway**, e quem fala
MCP com as ferramentas da casa é o gateway. Some o SDK, some o transporte, some o
servidor MCP, e some a pergunta que travava a rodada.

E isto não é arquitetura nova: **é a que o produto já usa duas vezes**, escrita
no comentário do adaptador de exportação desde a SPEC-49:

> *"O gerador não implementa Jira. Implementar um tracker específico seria
> escolher o tracker de todo mundo… A mesma disciplina do gateway de IA: o
> produto chama um endereço configurável (bridge de MCP, n8n, função interna) e
> quem sabe criar issue é quem está do outro lado."*

O gateway de IA é um endereço. O exportador é um endereço. Este é o terceiro — e
a única razão de a primeira escrita ter inventado complexidade foi eu ter lido
"MCP" como implementação em vez de como **o que está do outro lado do endereço**.

### O que a medição do repositório mostra, e agora com o sinal certo

| Fato | Onde |
|---|---|
| **Não há SDK de MCP no repositório** | medido nos 6 workspaces |
| A palavra "MCP" aparece **7× no fonte — 6 em comentário e 1 na tela**, e 0 em código executável | `ExportacaoTab.tsx:92` é a da tela |
| A porta de saída tem **um método só**: `exportar(itens)` | `exportadorDeItens.ts:24` |
| O adaptador é **POST HTTP com cabeçalhos configuráveis** | `exportadorViaAgente.ts` |

Na primeira escrita eu li isso como lacuna. **É o estado certo.** O que falta não
é MCP no produto — são as **outras operações** pelo mesmo caminho.

## 1. As quatro operações, e por que são quatro portas

Tudo é POST para um endereço configurável. O que muda é o contrato, e cada um tem
ciclo de vida próprio.

| Operação | Direção | O que o gateway faz do outro lado |
|---|---|---|
| **Publicar itens** | sai | cria issue no tracker (existe hoje) |
| **Publicar documento** | sai | cria/atualiza página na base de conhecimento |
| **Ler ADR** | entra | lê o repositório de decisões da casa |
| **Ler arquitetura de negócio** | entra | lê objetivo, regras, sistemas, restrições |

E uma quinta, que é a de maior valor e não é transporte: **escrever ADR de
volta** — a `Decisao` tomada aqui vira ADR no repositório da casa.

### 1.1 Por que não uma porta só com um campo `operacao`

Foi a instrução explícita do usuário — *"chamada exclusiva… separada das de
publicação dos itens"* — e ela se justifica por contrato, não por gosto:

| | Itens → tracker | Documento → base de conhecimento |
|---|---|---|
| **Ciclo de vida** | criado uma vez, vive lá | **página viva**, republicada a cada mudança |
| **Idempotência** | exportar duas vezes **duplica** (defeito) | publicar duas vezes tem que **atualizar no lugar** |
| **Falha** | parcial, por item — é o acerto do §2 | é uma coisa só: publica ou não |
| **Permissão** | quem abre issue | quem escreve na wiki — **não são as mesmas pessoas** |

Um parâmetro a mais no `exportar(itens)` faria a porta mentir sobre os quatro.

## 2. O achado que barateia a fatia do ADR: o produto já produz ADR

A palavra aparece no repositório **só em comentário** — mas o conceito está
implementado:

| Onde | O que diz |
|---|---|
| `model/types.ts:179` | *"a régua que impede isto de virar wiki: ADR nasce de escolha entre alternativas"* |
| `decisao/decisoes.ts:65` | *"registra a escolha e omite a razão é o formato que fez repositório de ADR…"* |
| `decisao/decisoes.ts:101` | *"a SPEC-57 chama o caso 3 de emenda ao ADR do padrão"* |
| `ia/pedidos.ts:875` | ensina o modelo a distinguir: *"'definir timeout = 300ms' é valor, não ADR"* |

E os campos de `Decisao` são o schema de ADR quase termo a termo:

```
titulo · contexto · alternativas · escolhida · porque · status · substituidaPor · autor · em
```

`status` + `substituidaPor` **é o ciclo de vida do ADR**. E há dois campos que um
ADR comum não tem: `noId`/`arestaId`, que ancora a decisão no elemento do
desenho, e `ensaioIds` (SPEC-69), que a liga à conta que a justificou.

> **O produto não precisa aprender ADR: ele já escreve ADR ancorado em modelo e
> em medição, e nunca chamou isso pelo nome na superfície.** A fatia liga um
> conceito que já existe ao repositório onde a casa guarda os dela.

Do outro lado, `Produto` já tem forma de registro de arquitetura de negócio —
`objetivo`, `quemUsa`, `regrasDeNegocio`, `sistemas`, `restricoes`, `glossario` —
hoje preenchido à mão. Ler o repositório da casa ataca o *"alguém tem que digitar
o contexto"* que a SPEC-75 §3.1 apontou como o gargalo real.

## 3. O fluxo que fecha: ADR → conversa → desenho

> *"uma ADR deveria poder vir do MCP e conversar com o assistente e virar
> desenho."*

Isto muda o papel do ADR: não é **contexto** (entra, informa, evita repropor o
que foi decidido contra) — é **ponto de partida**. E a peça do meio já existe: o
assistente é literalmente onde se conversa para produzir desenho, e
`montarPedidoDiagrama` e `montarPedidoNecessidades` já são os pedidos que fazem
isso.

Um ganho estrutural cai de graça: hoje `Decisao.noId`/`arestaId` é preenchido à
mão, ligando a decisão ao elemento **depois** que alguém desenhou. Se o desenho
nasce do ADR, **o vínculo nasce junto**.

**O risco é real:** um ADR é uma decisão, não um desenho. Ele **subdetermina** o
diagrama, e tudo o que ele não diz o modelo preenche — que é onde o
plausível-mas-vazio morde. A mitigação é a tese do produto, e precisa ser visível
no resultado:

- o que veio do ADR chega **importado**, com o ADR de origem apontado;
- o que o modelo completou chega **sugerido**;
- o que nenhum dos dois respondeu chega como **lacuna contável**.

> Um desenho nascido de ADR tem que dizer, olhando para ele, **quanto dele foi
> decidido e quanto foi preenchido.** Sem isso, importar ADR produz arquitetura
> com aparência de aprovada — pior que desenhar do zero.

E o uso de maior valor talvez nem seja um ADR: é o **conjunto**. Lido inteiro, o
repositório dá as restrições acumuladas da casa, e o produto passa a responder
*"o que estou desenhando contraria alguma decisão já tomada?"* — que é medição, e
não opinião. Hoje isso só existe na memória de um arquiteto veterano.

## 4. A régua que governa o que entra

`Decisao.origem` **já existe**. ADR importado entra marcado, **nunca como fato
local** — do mesmo jeito que a IA entra como `sugerido`.

E a arbitragem, quando os dois lados discordam, é a do §306, reafirmada pela
SPEC-77: **declarado vence herdado, e a tela diz qual é qual.** Se o repositório
de ADR da casa é a fonte da verdade, este produto não pode agir como se fosse.

## 5. O que esta SPEC RECUSA

**Implementar MCP.** O produto fala REST com um endereço. Quem fala MCP é o
gateway. É a política que a `ExportacaoTab` já declara na tela, e ela continua
valendo — só precisa ser reescrita sem prometer demais quando as outras operações
existirem.

**Implementar Jira, Confluence ou qualquer ferramenta específica.** Um conector
nativo por ferramenta é esteira de manutenção sem fim.

**ADR importado virando decisão local.** Se a casa tem repositório de ADR, ele é
a fonte; o que entra aqui entra marcado. Um produto que absorve a decisão alheia
e a reapresenta como sua corrompe o registro dos dois lados.

**Prosa alheia virando `Decisao` estruturada sem confirmação.** Mapear ADR em
formato livre para `alternativas`/`escolhida`/`porque` é trabalho de modelo, com
o risco de plausível-mas-vazio da SPEC-80 §2. Chega como proposta, com lacuna
contável.

**Virar repositório de ADR da organização.** O produto escreve ADR ancorado em
modelo e medição, e conversa com o repositório da casa. Substituí-lo é outro
produto.

**Publicar documento pela porta dos itens.** Ver §1.1.

**Publicar cópia que não sabe que envelheceu.** Uma página gerada e esquecida é a
quinta cópia da demanda, fora do alcance do repositório — o §263 em escala de
documento. Publica **atualizando no lugar**, dizendo de onde veio e **se o
original mudou desde então** (o produto já sabe: é o `atualizadoEm` que o §312
tornou honesto), ou não publica.

**Sincronização automática que sobrescreve em silêncio.** Enquanto não estiver
escrito quem vence, não se escreve o `sync`.

## 6. Fatias

- **A — a configuração do gateway.** Um endereço por operação, com cabeçalhos —
  no molde exato do `ConfigExportador`, que já existe e já funciona. Prova: uma
  operação sem endereço configurado **não aparece** na tela, em vez de aparecer e
  falhar.
- **B — publicar o documento** (§1.1). Porta própria, `PublicadorDeDocumento`, e
  **não** um parâmetro do `exportar(itens)`. Prova dupla: publicar duas vezes
  **atualiza a mesma página**; e a página publicada carrega de que demanda veio,
  quando, e se o documento mudou desde então.
- **C — ler ADR.** Traz as decisões da casa, marcadas como importadas. Prova, e é
  a que impede a fatia de mentir: um ADR importado **não pode aparecer como
  decisão local**; `origem` distingue, e desligar a marca derruba o teste (§248).
  Segunda prova: ADR que a casa marcou como substituído não volta a valer aqui.
- **D — o ADR vira desenho** (§3). Importar, conversar com o assistente, sair
  diagrama com a decisão já ancorada nos nós que ela criou. Prova: o desenho
  resultante **distingue na tela** o importado, o sugerido e a lacuna. Segunda
  prova, a de maior valor: desenhar algo que contraria um ADR aceito **produz
  apontamento**.
- **E — escrever ADR de volta.** A `Decisao` tomada aqui vai para o repositório
  da casa, no formato dela. Template configurável — e vale conferir se divide o
  mecanismo com o da SPEC-80 antes de construir dois.
- **F — ler arquitetura de negócio.** Alimenta `objetivo`, `regrasDeNegocio`,
  `sistemas`, `restricoes` e `glossario`. Prova: o que veio de fora chega marcado
  e **contável como lacuna enquanto ninguém confirma**.

**Ordem: A → C → D → B → E → F.** A configuração primeiro porque nada entra ou
sai sem endereço; C e D coladas porque *"ADR vira desenho"* é o que dá razão de
ser à importação — sem ela, importar ADR é encher um repositório.

## 7. Perguntas em aberto

1. **Um endereço por operação, ou um só com caminhos?** O `ConfigExportador` tem
   um `endpoint`. Quatro operações podem ser quatro endereços, ou um endereço
   base com `/itens`, `/documento`, `/adr`. **Recomendação: um por operação**,
   porque é o que permite apontar cada uma para um gateway diferente — e a
   organização que tem um só configura o mesmo quatro vezes, que é barato.
2. **O formato de ADR na saída.** MADR, Nygard, o template da casa? A saída é
   markdown, então **template configurável** é a resposta provável, e é o mesmo
   problema que a SPEC-80 fatia A resolveu.
3. **A fatia F vale a pena?** É a de valor menos certo: depende de a organização
   ter arquitetura de negócio em formato legível, e **não temos medição disso**.
   Recomendação: fazer A→E, e só então perguntar a quem usa.
