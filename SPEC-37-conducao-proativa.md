# SPEC-37 — Condução proativa: o assistente percebe o momento

> **Status: aprovada no debate** (*"centro… pode seguir"*), com três acréscimos
> do usuário incorporados: o Derivar Quebra como CHIP de sugestão no
> assistente (M9), a comunicação explícita de que as conversas são **por
> texto ou por voz**, e a ANIMAÇÃO do bubble nos estágios de condução.
> Fase 1 implementada; ver §7.

## 1. Pedido

Do usuário: *"precisamos planejar uma feature que induza e facilite a
experiência — ex.: a IA terminou o preenchimento da revisão da quebra → leva
ao agente bolha, ele abre o chat sozinho e fala 'Pronto, todos os itens foram
gerados; agora você pode revisar e me avisar se for necessário alterar algo, e
eu te ajudarei a realizar as alterações e revisar a consistência entre os
itens da demanda'. Precisamos mapear esses fluxos e incrementar isso."*

## 2. Princípio

O assistente hoje é REATIVO: os bubbles esperam o clique. A condução proativa
inverte nos momentos certos — mas **conduzir não pode virar interromper**. A
régua proposta:

- **Abrir o chat sozinho** só na CONCLUSÃO de um processo que o próprio
  usuário iniciou (a esteira que ele disparou terminou). É o momento em que a
  atenção dele já está esperando um resultado.
- Nos demais momentos, o bubble **pulsa e mostra um balão curto dispensável**
  (badge) — convite, não sequestro de foco.
- Toda fala proativa é **determinística, do produto** (sem chamada de IA, sem
  custo, sem latência): o assistente "fala" a mensagem do momento como
  primeira mensagem do chat correspondente.
- **Uma fala por momento por quebra** (persistida em
  `localStorage gerador:momento:<id>:<quebraId>`); dispensar silencia. Um
  momento por vez, por prioridade.

## 3. Mecânica proposta

Uma lista declarativa `MOMENTOS` (mesmo espírito de `ABAS` do
`AssistenteFlutuante` — entrada nova = momento novo):

```
{ id, onde: "canvas" | "revisao" | "config", gatilho: descrição do evento,
  conduta: "abrir-chat" | "pulsar-balão", fala: string, acao?: rótulo do CTA }
```

Tudo no web, sem servidor: os gatilhos são estados que as telas já têm.

## 4. O mapa de momentos (ganchos verificados no código desta rodada)

| # | Momento | Gatilho (medido) | Conduta | Fala (rascunho) |
|---|---|---|---|---|
| M1 | **Esteira terminou de escrever as fichas** | `useEsteiraDeAgentes.rodando` true→false com a fila processada (ReviewScreen) | **abre o chat do bubble sozinho** | "Pronto — os N itens foram gerados. Revise cada um; se algo precisar mudar, me diga aqui que eu aplico a alteração e reviso a consistência dos itens que dependem dele." |
| M2 | Canvas vazio ao começar (pós-jornada) | `quebra.diagrama.nodes.length === 0` | pulsar + balão | "Quer começar conversando? Descreva a demanda e eu proponho o diagrama." |
| M3 | Diagrama proposto aplicado ao canvas | `onAplicar` do ConversaPanel | pulsar + balão | "Diagrama no canvas. Agora é preencher os campos de cada componente — o semáforo mostra o que falta; vermelho trava a derivação." |
| M4 | Revisão aberta sem credencial de IA | `/ia/status` sem gateway (a revisão já consulta) | pulsar + balão | "A esteira de IA está desligada — sem credencial de gateway. Configuro com você? (aba Modelo de IA)" |
| M5 | Derivou com Contexto do épico vazio | `demandInfo` vazio no derivar | pulsar + balão | "Sem o Contexto do épico, as sugestões de IA e o documento final saem mais pobres — quer colar o material da demanda?" |
| M6 | Alteração aplicada num item com dependentes | `onAplicar` da ConversaEspecificacao + dependências do grafo (o fluxo `oQueMudou` JÁ existe no produto) | fala no chat (já aberto) | "Aplicado. N itens dependem deste — mando revisar a consistência deles?" |
| M7 | Todos os itens refinados | contadores de status da revisão | pulsar + balão | "Tudo refinado. Quer gerar a especificação de solução?" |
| M8 | Configurações abertas numa instalação sem regras/campos do time | dados já carregados na ConfigScreen | pulsar + balão | "Este ambiente ainda está sem padrões do time — posso te ajudar a configurar conversando." |
| M9 | **Prontidão toda verde, nada derivado** (acréscimo do debate) | `vermelhos.length === 0 && nodes > 0 && !resultado` (App) | pulsar + balão com **chip "Derivar Quebra"** que executa a derivação | "Tudo verde — a quebra está pronta para derivar os itens de trabalho." |

Sobre os chips (acréscimo do debate): o balão pode carregar UMA ação primária
que executa de verdade (a mesma função do botão correspondente) — o chip não é
atalho novo de escrita, é o mesmo caminho com convite. E toda fala de conversa
diz que o canal é **texto ou voz (🎤)** — a voz existia e ninguém descobria.

## 5. Fases propostas

- **Fase 1** — a infraestrutura mínima (lista `MOMENTOS`, balão dispensável,
  persistência do visto) + **M1**, o momento do pedido, de ponta a ponta.
  Feito quando: derivar com IA ligada, esteira termina, o chat da revisão abre
  sozinho com a fala do M1 — provado no E2E com gateway falso, com mordida.
- **Fase 2** — **M6 e M7** (a continuação natural do M1: alterar com
  consistência e fechar o ciclo na especificação).
- **Fase 3** — M2–M5 e M8, priorizados após sentirmos as duas primeiras no
  uso real.

## 6. Decisões do debate

O usuário aprovou a proposta como estava ("centro… pode seguir"): M1 abre o
chat sozinho; Fase 2 = M6+M7; dispensar silencia por quebra; textos mantidos
como rascunho revisável. A decisão 5 (M6: automático × lista antes) fica para
a rodada da Fase 2, quando o fluxo estiver na mão.

## 7. Fase 1 — implementada

- Infra no `AssistenteFlutuante`: `chamando` (classe `assistente-fab--chamando`,
  pulso de anel em CSS puro) e `balao` (fala + chip de ação + "agora não").
- **M1** de ponta a ponta: transição `esteira.rodando` true→false na revisão
  abre a `ConversaEspecificacao` com a `falaInicial` do momento (e seleciona o
  primeiro item se nada estava selecionado); se a pessoa fechar o chat, o
  bubble segue pulsando.
- **M9**: balão com chip "Derivar Quebra" quando tudo verde e nada derivado;
  o chip chama a MESMA `derivarQuebra` do botão do header.
- **Voz explicada**: titles dos bubbles e primeiras falas das três conversas
  dizem "por texto ou por voz (🎤)".
