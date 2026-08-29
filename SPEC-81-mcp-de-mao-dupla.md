# SPEC-81 — Integrar com as ferramentas do time (MCP de mão dupla)

> **Origem:** o usuário — *"implementar tudo o que falta"*, com **ambição
> completa**. É o segundo dos dois estágios `ausente` do ciclo, e o único dos
> três cuja avaliação **ainda não foi feita** — a SPEC-75 §5 recusou
> explicitamente fazê-la de passagem:
>
> > *"MCP como fatia desta SPEC. A integração com issue tracker via MCP é
> > assunto próprio, com superfície própria. Misturá-la aqui faria três
> > avaliações virarem quatro, e nenhuma delas ficaria clara."*
>
> Esta é a superfície própria que aquela recusa prometeu.

---

## 0. A medição

O estágio está marcado **`ausente`**, com `oQueFalta: "Não avaliado ainda."` —
e o texto da página é honesto sobre o que existe:

> Hoje o item sai para o issue tracker por um agente configurável. Falta o
> caminho de mão dupla com as ferramentas onde o time já trabalha.

Medido no código:

| Fato | Onde |
|---|---|
| **Não há SDK de MCP no repositório.** Nenhum `@modelcontextprotocol` em nenhum `package.json` | medido nos 6 workspaces |
| A porta de saída tem **um método só**: `exportar(itens)` | `aplicacao/src/portas/exportadorDeItens.ts:24` |
| O adaptador é **webhook HTTP** para um agente configurável | `server/src/adaptadores/exportadorViaAgente.ts:11` |
| A tela declara a política: *"o gerador não implementa Jira"* | `web/src/config/ExportacaoTab.tsx:92` |

Ou seja: fora o `ciclo.ts`, a palavra "MCP" aparece **sete vezes no fonte — seis
em comentário e uma na tela** (`ExportacaoTab.tsx:92`) — e em **nenhuma linha de
código executável**. Ela sempre foi a intenção; nunca foi a implementação.

A ocorrência da tela merece leitura cuidadosa, porque é a única que o usuário vê:

> *"com o seu tracker (MCP, n8n, uma função interna — o que a empresa já tiver).
> O gerador não implementa Jira"*

Ela descreve o que o **agente externo** pode ser, e não promete que o Gerador
fala MCP. **Está honesta** — e continua tendo que estar depois desta SPEC, porque
o que muda é justamente isso: o Gerador passa a falar. A frase vai precisar ser
reescrita, e é fácil reescrevê-la prometendo demais.

## 1. As duas direções são problemas diferentes

"Mão dupla" esconde que são dois trabalhos com riscos opostos.

### 1.1 Publicar — o produto como **servidor** MCP

Um agente do time (o assistente de código, o bot do chat) pergunta ao Gerador:
*"quais itens desta demanda estão pendentes?"*, *"qual o contrato desta
conexão?"*, *"que lacunas o documento ainda tem?"*.

Isto é **leitura sobre dados que já existem**, e é onde está a maior parte do
valor: hoje essa informação só sai por markdown baixado ou por tela.

**O risco é de fronteira, não de produto.** O Gerador é hospedado e
multi-organização; um servidor MCP é uma porta nova para os mesmos dados. Ela
tem que passar pela mesma autorização que tudo o mais — `exigirPermissao`
(`server/src/auth/permissoes.ts:378`) —, com credencial por organização, e
**nunca** por um token global de instalação. Um servidor MCP que enxerga todas
as organizações é um incidente esperando data.

### 1.2 Consumir — o produto como **cliente** MCP

O Gerador chama as ferramentas do time: cria o issue, lê o status de volta,
comenta.

**O risco aqui é de produto, e é o mais sério desta SPEC:** consumir status de
volta significa que o tracker passa a ter opinião sobre o estado da demanda. E
aí aparece a pergunta que ninguém respondeu ainda — **quem vence quando os dois
discordam?**

O produto já tem régua para isso, e ela é do §306, reafirmada pela SPEC-77:
**declarado vence herdado, e a tela diz qual é qual.** O item local é o
declarado; o tracker é o herdado. Uma sincronização que sobrescreve em silêncio
seria o produto violando a própria régua na integração mais visível que ele tem.

### 1.3 A terceira direção — a camada perene da organização

> *"seria interessante ter conector para o MCP em determinado estágio interagir
> com **arquitetura de negócio** e **ADR (arquitetura técnica)**: fazem parte da
> camada perene/determinística de processos corporativos."* — o usuário.

Esta direção **não estava nesta SPEC** e é, provavelmente, a de maior valor das
três — porque ataca o gargalo que a SPEC-83 §1.1 nomeia: a governança da casa
mora fora do alcance verificável da IA. Aqui ela entra.

#### O achado que muda o custo: o produto já produz ADR

Medido, e é mais forte do que eu esperava. A palavra "ADR" aparece no
repositório **só em comentário** — mas o conceito está implementado:

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

`status` + `substituidaPor` **é o ciclo de vida do ADR** (proposto → aceito →
substituído). E há dois campos que um ADR comum não tem: `noId`/`arestaId`, que
ancora a decisão no elemento do desenho, e `ensaioIds` (SPEC-69), que a liga à
conta que a justificou.

> **O produto não precisa aprender ADR: ele já escreve ADR ancorado em modelo e
> em medição — e nunca chamou isso pelo nome na superfície.** O conector não
> inventa conceito; ele liga um conceito que já existe ao repositório onde a casa
> guarda os dela.

#### Arquitetura de negócio

Do outro lado, `Produto` já guarda `objetivo`, `quemUsa`, `regrasDeNegocio`,
`sistemas`, `restricoes` e `glossario` — um registro de forma
arquitetura-de-negócio, hoje **preenchido à mão**. Um conector que leia o
repositório de arquitetura da casa alimenta exatamente esses campos, e ataca o
"alguém tem que digitar o contexto" que a SPEC-75 §3.1 identificou como o gargalo
real.

#### As duas direções, e a régua que as governa

- **Ler** — os ADRs e a arquitetura de negócio da casa entram como **contexto**,
  para que a IA não proponha o que já foi decidido contra, e para que o desenho
  nasça sabendo das restrições que já existem.
- **Escrever** — a `Decisao` tomada aqui volta para o repositório de ADR da casa,
  no formato dela.

**A régua é a mesma de sempre, e o campo já existe:** `Decisao.origem`. ADR
importado entra marcado como importado — **nunca como fato local** —, exatamente
como a IA entra como `sugerido`. Prosa de ADR alheio virando `Decisao`
estruturada é trabalho de modelo, com o mesmo risco de plausível-mas-vazio da
SPEC-80 §2. A mitigação é a mesma: **importa marcado, e vira fato quando alguém
confirma.**

> E a pergunta de arbitragem da §1.2 aparece aqui de novo, mais afiada: **se o
> repositório de ADR da casa é a fonte da verdade, este produto não pode agir
> como se fosse.** Vale o §306: declarado vence herdado, e a tela diz qual é qual.

## 2. O que o `ExportadorDeItens` já acertou, e o que ele não previu

A porta nasceu certa em duas coisas: não acopla em Jira, e trata **falha parcial
como resposta, não exceção** (`exportar` devolve resultado por item).

O que ela não previu: **é só ida.** Não há `sincronizar`, não há `lerStatus`,
não há como um item saber que o issue foi fechado. Estender a porta é a fatia
mais barata desta SPEC — e é onde a tentação de fazer errado é maior, porque
"só adicionar um método" esconde a pergunta da §1.2.

## 3. O que esta SPEC RECUSA

**Implementar Jira.** A tela já declara essa política e ela continua certa. O
Gerador fala MCP; quem fala Jira é o servidor MCP do time. Um conector nativo
por ferramenta é uma esteira de manutenção sem fim.

**Sincronização automática bidirecional sem arbitragem declarada.** Ver §1.2.
Enquanto não estiver escrito quem vence, não se escreve o `sync`.

**Servidor MCP sem escopo por organização.** Não é configurável, não é opção, e
não entra "por enquanto".

**Espelhar o modelo inteiro como ferramentas MCP.** Uma ferramenta por rota
seria uma superfície gigante que ninguém consegue revisar. As ferramentas são
poucas e nomeadas pelo que a pessoa quer — *"o que falta nesta demanda"* —, não
pelo que a tabela guarda.

**ADR importado virando decisão local.** É a recusa mais importante da §1.3. Se
a casa tem repositório de ADR, ele é a fonte; o que entra aqui entra marcado, e
`origem` é o campo que já existe para isso. Um produto que absorve a decisão
alheia e a reapresenta como sua corrompe o registro dos dois lados.

**Prosa alheia virando `Decisao` estruturada sem confirmação.** Mapear ADR em
formato livre para `alternativas`/`escolhida`/`porque` é trabalho de modelo, com
o risco de plausível-mas-vazio da SPEC-80 §2. Chega como proposta, com lacuna
contável — nunca como fato.

**Virar repositório de ADR da organização.** O produto escreve ADR ancorado em
modelo e em medição, e conversa com o repositório da casa. Substituí-lo é outro
produto, e um que ninguém pediu.

**Escrita destrutiva via MCP.** Um agente pode criar e comentar; apagar demanda
ou sobrescrever documento aprovado, não. O produto inteiro é construído em cima
de "nada vira pronto sem alguém confirmar" — a porta MCP não pode ser a exceção.

## 4. Fatias

- **A — a fronteira, antes de qualquer ferramenta.** Credencial de MCP por
  organização, com escopo e as mesmas permissões da API. Prova: uma credencial
  da organização A não enxerga nada da B — teste de servidor, com banco de
  verdade, no molde de `app.test.ts`.
- **B — o servidor: leitura.** As poucas ferramentas que respondem o que se
  pergunta de fora: itens da demanda, lacunas do documento, contrato de uma
  conexão, o que está bloqueando a derivação. Prova: um cliente MCP real obtém
  as mesmas respostas que a tela mostra — se divergirem, uma das duas mente.
- **C — o cliente: publicar.** O `ExportadorDeItens` ganha um adaptador MCP ao
  lado do webhook (o webhook **fica** — é o que funciona hoje). Prova: falha
  parcial continua sendo resposta por item, não exceção.
- **D — a volta, com arbitragem declarada.** Ler status do tracker e mostrar a
  divergência **sem resolver sozinho**, exatamente como a SPEC-77 fatia C fez
  com volumetria declarada × herdada. Prova: tracker e item discordando produzem
  divergência visível, e o item local não muda sozinho.
- **E — ADR de mão dupla** (§1.3). Ler os ADRs da casa como contexto, e devolver
  a `Decisao` tomada aqui no formato dela. **É a fatia de maior valor da SPEC**,
  e a mais barata em conceito — o tipo já existe inteiro, inclusive `status` e
  `substituidaPor`. Prova, e ela é dura: um ADR importado **não pode aparecer
  como decisão local**; `origem` distingue, e desligar a marca tem que derrubar
  o teste (§248). Segunda prova: um ADR que a casa marcou como substituído não
  volta a valer aqui.
- **F — arquitetura de negócio como contexto.** Alimentar `objetivo`,
  `regrasDeNegocio`, `sistemas`, `restricoes` e `glossario` a partir do
  repositório da casa. Ataca o gargalo do *"alguém tem que digitar o contexto"*
  (SPEC-75 §3.1). Prova: o que veio de fora chega marcado e **contável como
  lacuna enquanto ninguém confirma** — a máquina da SPEC-73 aplicada a contexto
  importado.

## 5. Perguntas em aberto

1. **Qual transporte, e qual SDK?** Não medimos. Antes da fatia A, uma medição
   de meia hora: o que o SDK oficial suporta hoje, e qual transporte cabe num
   produto hospedado atrás de nginx. **Não escrever a fatia A antes disso** — é
   o tipo de suposição que as sete rodadas anteriores mostraram custar caro.
2. **O servidor MCP mora no `packages/server` ou em pacote próprio?** O
   precedente do `packages/gateway-falso` (SPEC-74) diz que pacote próprio evita
   dependência vazar para a imagem de produção. Mas ali o dublê **não** era
   produção. Aqui é. Recomendação fraca: dentro do `server`, atrás da mesma
   autenticação, até haver motivo medido para separar.
3. **Consumir status do tracker vale a pena?** É a fatia D, a mais cara e a de
   valor menos certo. **Recomendação: fatiar a decisão** — fazer A, B, C, e só
   então perguntar a quem usa se a volta faz falta.
4. **A ordem mudou com a §1.3, e vale dizer em voz alta.** Escrita assim, a
   **fatia E é a de maior valor da SPEC** — ADR é o artefato de governança que a
   casa já tem, o produto já o produz nativamente, e é o que faz "camada perene"
   deixar de ser só a configuração *deste* produto. **Recomendação: A → B → E →
   C → F → D**, e não a ordem alfabética. A fatia A (a fronteira) continua
   primeiro porque nada entra ou sai antes de o escopo por organização existir.
5. **Qual formato de ADR na saída?** MADR, Nygard, o template da casa? Não
   medimos, e não dá para escolher por argumento. A saída é markdown, então
   **template configurável** é a resposta provável — e aí é o mesmo problema de
   template que a SPEC-80 resolve. Vale conferir se as duas podem dividir o
   mecanismo antes de construir dois.
4. **O que fica marcado no ciclo se a D não for feita?** Honestamente: `completo`
   é defensável com A+B+C, porque a mão dupla existe — entra e sai. Mas o texto
   do estágio precisa ser reescrito para dizer o que faz, não o que se sonhou.
   **Ponto verde sobre texto antigo é o defeito que a SPEC-76 existe para
   impedir.**
