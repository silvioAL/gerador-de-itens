# SPEC-57 — O fluxo de trabalho da mesa de projeto

> **Este documento existe para ser discordado antes de virar código.** Pedido do
> usuário: *"o fluxo de trabalho deve ficar claro antes de codarmos"*.
>
> A [SPEC-56](SPEC-56-avaliacao-simarch.md) definiu **o que falta** (a cadeia
> propósito → decisão → elemento → item → spec, as dimensões de medida, a
> divisão de trabalho com o agente). Este define **como se trabalha** com isso
> — momento a momento, quem age, o que aparece na tela e o que fica registrado.
>
> Nenhuma linha de produção muda por causa dele.

---

## 1. As três regras que o fluxo inteiro obedece

Antes dos momentos, as invariantes. Se algum passo abaixo violar uma delas, o
passo está errado — não a regra.

1. **O engine mede e acusa. O agente explica e propõe. A pessoa decide.**
   O agente nunca produz um número; ele lê o que o engine mediu. A pessoa nunca
   recebe uma mudança que não aprovou.
2. **Nada conta até ser confirmado.** Valor `sugerido`/`inferido` não confirmado
   não fecha semáforo, não entra em medida, não vira item. Já é assim
   (`prontidao.ts`), e continua sendo para tudo que nascer daqui.
3. **Violar o padrão é permitido — e fica registrado.** Com quem decidiu e por
   quê. Sem essa saída, a pessoa aprende a ignorar o vermelho, e a medição
   inteira morre junto.

---

## 2. O fluxo em uma tela

```
        ┌───────────────────────────────────────────────────────────┐
        │                                                           │
        ▼                                                           │
 M1 ABRIR ──► M2 DESENHAR ──► M3 MEDIR ──► M4 CONVERSAR ──► M5 DECIDIR
 propósito    (a 4 mãos)      (contínuo)   (sobre o medido)  (+ ADR)
                   ▲                                            │
                   └────────────────────────────────────────────┘
                              o laço da sessão
                                     │
                                     ▼
                              M6 LIGAR propósito ⇄ elemento
                                     │
                                     ▼
                          ╔══════════════════════╗
                          ║  M7 PORTÃO: derivar  ║  vermelho bloqueia
                          ╚══════════════════════╝
                                     │
                                     ▼
                      M8 REVISAR ──► spec gerada ──► tracker
                                     │
                                     ▼
                        M9 O QUE FICA PARA A PRÓXIMA
                        (padrão novo, ADR, emenda)
```

O laço M2→M5 é onde a sessão passa a maior parte do tempo. M7 é o único portão
duro. M9 é o que faz a segunda sessão ser melhor que a primeira.

---

## 3. Momento a momento

Legenda de estado: **✓ existe hoje** · **± existe parcialmente** · **✗ novo**

### M1 — Abrir a demanda: o propósito antes do desenho

| | |
|---|---|
| **Gatilho** | "Nova quebra", ou abrir uma existente |
| **Pessoa faz** | dá um título, escolhe o produto, descreve o contexto — e **lista os requisitos** |
| **Engine mede** | nada ainda: sem elemento não há o que medir |
| **Agente faz** | lê o contexto do produto e o glossário; ajuda a transformar a descrição solta em **requisitos discretos** |
| **Fica registrado** | requisitos como itens, cada um com proveniência (quem escreveu / o agente propôs) |

**Hoje:** ✓ título, produto, glossário, contexto do épico (`demandInfo`, aba
📎 do assistente). **✗** requisito como objeto — hoje o propósito é prosa num
campo, e prosa não se liga a nada nem se confere.

**A decisão de desenho aqui:** requisito é do **produto** ou da **demanda**?
Proposta: da demanda, podendo *referenciar* um requisito recorrente do produto.
Requisito de produto que vive só na demanda se perde; requisito de demanda
forçado no produto polui.

> **Regra 2 aplicada:** requisito proposto pelo agente entra como `sugerido` e
> não conta em gap analysis até alguém confirmar. Senão o agente inventa
> propósito, e propósito inventado contamina tudo o que vem depois.

### M2 — Desenhar, a quatro mãos

| | |
|---|---|
| **Gatilho** | mesa vazia, ou nova parte de um desenho existente |
| **Pessoa faz** | arrasta componentes, conecta, ou **descreve em conversa/imagem** |
| **Agente faz** | propõe nós e conexões **nos tipos que existem na config** |
| **Engine mede** | a cada mudança — é M3, que roda junto e não como etapa |
| **Fica registrado** | nó/aresta; o que veio do agente com `origem: sugerido` |

**Hoje:** ✓ tudo isto existe — canvas, conversa, imagem, proposta com
confirmação nó a nó.

**O incremento:** a proposta do agente aparece **com o efeito medido**, não só
com a forma. Ver M4, interação 2.

### M3 — A medição contínua

| | |
|---|---|
| **Gatilho** | qualquer mudança no desenho ou num campo |
| **Engine mede** | as dimensões da SPEC-56 §0.6, por nó, por aresta e no total |
| **Pessoa vê** | semáforo no nó (como hoje) e o **placar** no topo |
| **Fica registrado** | nada — medida é derivada, nunca persistida |

**Hoje:** ± existe uma dimensão (completude) com semáforo por nó e contador no
topo. **✗** as outras cinco: conformidade, propósito, consistência, confiança,
forma.

**Que medida ganha destaque quando?** Regra proposta: **a que bloqueia primeiro.**
Vermelho de completude antes de amarelo de conformidade, porque campo vazio
impede até saber se há violação. O "Próximo pendente", que já existe, passa a
navegar por qualquer dimensão, na mesma ordem.

> **Cuidado que decide se isto funciona:** medida que não cabe em uma frase de
> explicação não entra. Se o produto não sabe dizer *por que* deu esse número,
> a pessoa não tem como discordar — e medida indiscutível vira ruído ou dogma.

### M4 — Conversar sobre o medido

O coração do fluxo, e o que a SPEC-56 §0.7 chama de dança. Quatro interações,
todas partindo de **um fato medido**, nunca de uma impressão do agente:

| # | O engine diz | O agente diz | A pessoa faz |
|---|---|---|---|
| 1 | *"`gateway.timeout` = 800ms viola o padrão ≤ 500ms"* | **por que** o padrão existe (lendo o ADR que o originou) | ajusta, ou decide violar (→ M5, caso 3) |
| 2 | — | propõe: *"posso pôr um cache aqui"* | vê o **delta do placar** antes de aceitar |
| 3 | *"2 requisitos sem componente"* | mostra quais, e sugere onde eles caberiam | liga, ou marca como fora de escopo |
| 4 | *"retry 3× sob timeout de 400ms do chamador"* | *"o retry nunca completa: o chamador desiste antes da 2ª tentativa"* | corrige um dos dois |

**A interação 2 é a mais barata de todas, e é a que o usuário chamou de
incrível.** O mecanismo já existe: proposta do agente entra como `sugerido`, e
a prontidão **já a ignora** até confirmar. Então basta medir duas vezes — só o
confirmado, e o confirmado + sugerido — e mostrar a diferença:

```
     placar agora          com a proposta
     fan-out máximo   9  →  4
     violações        3  →  1
     confiança      72%  →  68%   ← e este número piora, de propósito:
                                     aceitar sugestão sem conferir baixa
                                     a confiança do desenho
```

Esse último número é o que impede a interação de virar "aceitar tudo": o preço
de aceitar sem olhar fica **visível na mesma tela** em que se aceita.

**Hoje:** ± a conversa existe (SPEC-27) e a condução proativa existe (SPEC-37).
**✗** o que o agente lê: hoje ele lê o desenho, passaria a ler o desenho
**medido**.

### M5 — Decidir, e quando a decisão vira ADR

Três casos, e a diferença entre eles é o que evita que ADR vire wiki:

| Caso | Exemplo | Onde fica |
|---|---|---|
| **Preencher um campo** | `timeout = 300ms` | valor com proveniência — como hoje |
| **Escolher entre alternativas** | "Rabbit e não Kafka, porque X" | **ADR ancorado no nó**, com as opções |
| **Violar um padrão de propósito** | "800ms aqui porque o parceiro é lento" | **emenda ao ADR do padrão**, com autor e motivo |

**A régua:** ADR nasce de **escolha entre alternativas ou de exceção
consciente** — nunca de "preencher um campo". Sem essa régua, todo campo vira
ADR e o mecanismo morre de excesso.

**Hoje:** ✓ o primeiro caso. **✗** os outros dois.

> O caso 3 é o que fecha a **regra 3**. E ele tem um efeito colateral bom: a
> exceção registrada é dado de melhoria — se o mesmo padrão é violado por cinco
> times, o padrão está errado, não os times. Isso conversa direto com o PDCA
> que já existe (SPEC-39/45).

### M6 — Ligar propósito a elemento

| | |
|---|---|
| **Gatilho** | pessoa liga requisito ↔ nó/aresta/percurso, ou o agente sugere a ligação |
| **Engine mede** | gap dos dois lados: requisito sem elemento **e** elemento sem requisito |
| **Pessoa vê** | a dimensão "propósito" no placar; a lista dos dois gaps |
| **Fica registrado** | o vínculo, com proveniência |

**Elemento sem requisito também é sinal** — pode ser infraestrutura legítima,
pode ser componente que ninguém sabe por que está ali. O produto não decide
qual: mostra, e a pessoa marca.

**Hoje:** ✗ inteiro.

### M7 — O portão: derivar

| | |
|---|---|
| **Gatilho** | "Derivar Quebra" |
| **Regra do portão** | **vermelho bloqueia, amarelo avisa** — como hoje, agora sobre todas as dimensões |
| **Engine faz** | derivação determinística: itens por nó, por aresta e — novo — **por percurso** e **por violação de padrão** |
| **Agente faz** | a esteira preenche os campos textuais dos itens (SPEC-24), como hoje |
| **Fica registrado** | itens gerados, com chave estável |

**Hoje:** ✓ o portão, a derivação por nó/aresta, a esteira. **✗** itens de
percurso e de conformidade.

**A decisão de desenho aqui, e ela importa:** violação de padrão vira **item**
ou **bloqueio**? Proposta: **item**, salvo se a violação for não-decidida.
Violação decidida (M5 caso 3) não bloqueia — já foi resolvida por uma pessoa.
Violação não olhada é vermelho. A diferença entre as duas é exatamente o que a
proveniência já sabe registrar.

### M8 — Revisar e gerar a spec

| | |
|---|---|
| **Pessoa faz** | revisa item a item, confirma o que a esteira escreveu, exporta |
| **Engine faz** | monta a especificação de solução |
| **O incremento** | cada item passa a citar: **qual requisito atende, qual decisão implementa, qual padrão aplica** — e, se for o caso, qual foi violado, por quem e por quê |

**Hoje:** ✓ revisão, esteira, markdown, exportação pro tracker (SPEC-49).
**✗** a rastreabilidade dentro da spec.

É aqui que "padrões consistentes que **chegam** até os itens" deixa de ser
intenção e vira texto verificável: quem lê a spec confere a cadeia inteira sem
abrir a ferramenta.

### M9 — O que a sessão deixa para a próxima

| Saiu da sessão | Vira |
|---|---|
| decisão entre alternativas | ADR — que o agente vai **citar** na próxima vez que o assunto voltar |
| exceção registrada | emenda; e, repetida, evidência de que o padrão precisa mudar |
| valor preenchido à mão num tipo de nó | candidato a padrão do time — **já existe** (`perfis-time.json`) |
| requisito recorrente | candidato a requisito de produto |

**Hoje:** ± o terceiro caso existe. **✗** os outros.

É este momento que torna a mesa um lugar onde o padrão é **ensinado** e não só
cobrado: o que uma pessoa decidiu hoje é o que o agente explica para a próxima.

---

## 4. O que muda em cada tela que já existe

| Tela | Incremento | Some algo? |
|---|---|---|
| **Mesa (canvas)** | semáforo do nó com mais razões no popover que já existe; sinal na aresta; placar no lugar do `VERMELHO/AMARELO` | não |
| **Painel de propriedades** | seção de padrões aplicáveis àquele nó, com o estado de cada um | não |
| **Assistente (3 abas)** | a aba de conversa passa a abrir citando o placar; nova origem de assunto: violação medida | não |
| **Revisão** | rastreabilidade por item | não |
| **Menu** | requisitos e ADRs precisam de casa — provavelmente da demanda, não da configuração | não |
| **Painel inferior** | **novo** — onde a conta se explica passo a passo | — |

Nada é substituído. O visual atual é a linguagem; o incremento é de dimensões.

---

## 5. As perguntas que precisam de resposta antes do primeiro commit

Honestas, e cada uma muda o desenho:

1. **Requisito é da demanda ou do produto?** (M1) Minha proposta: da demanda,
   com referência opcional ao produto. Mas isso decide onde a tabela vive e
   quem edita.
2. **Padrão vive onde?** Hoje há `regras.json` (checklist por tech),
   `camposNo` (padrões por componente) e `perfis-time.json` (stack do time).
   Padrão verificável é um quarto lugar ou é extensão de um destes? **Se for um
   quarto, provavelmente está errado.**
3. **Violação bloqueia ou vira item?** (M7) Minha proposta acima é "item, salvo
   se não-decidida" — mas é a decisão que mais muda a sensação de usar.
4. **Percurso é declarado ou inferido?** Declarar dá precisão e custa trabalho;
   inferir do grafo é grátis e erra. Talvez: inferir e pedir confirmação — que
   é o padrão de proveniência que a casa já usa.
5. **Quantas dimensões cabem num semáforo?** Seis dimensões numa cor só podem
   virar um vermelho permanente que ninguém lê. Pode ser que o placar precise
   ser por dimensão e o nó continue com uma cor.

---

## 6. Um caso concreto, do começo ao fim

Validar fluxo no papel é mais barato que validar em código. Um checkout com
pagamento externo:

| Momento | O que acontece |
|---|---|
| **M1** | Requisitos: *R1 "o pedido não pode ser cobrado duas vezes"*, *R2 "o cliente vê confirmação em até 2s"* |
| **M2** | Pessoa desenha: `web → api-pedidos → fila → worker-pagamento → parceiro externo`. Agente sugere DLQ na fila (`sugerido`) |
| **M3** | Placar: completude 4 vermelhos · conformidade 1 violação (`parceiro externo` sem timeout) · propósito **R1 sem elemento** · confiança 60% |
| **M4** | Agente: *"R1 é idempotência e nenhum componente responde por ela — normalmente fica no `worker-pagamento`, com chave de idempotência. O padrão veio do ADR-07, depois do incidente de cobrança dupla"* |
| **M5** | Pessoa marca idempotência no worker (campo) e liga a R1 (vínculo). Escolhe fila em vez de chamada direta → **ADR novo**, com as duas opções |
| **M4'** | Agente: *"com fila, R2 (2s) depende do consumo — o pior caso do caminho passa de 2s"*. Pessoa decide confirmar assíncrono na UI → **emenda**: R2 satisfeito de outro jeito |
| **M6** | R1 → worker; R2 → web + fila. Nenhum gap |
| **M7** | Verde. Deriva: itens por nó, + *"implementar chave de idempotência no worker (R1, ADR-08)"*, + *"definir timeout da chamada ao parceiro (viola padrão P-03)"* |
| **M8** | Spec sai com cada item citando requisito, ADR e padrão |
| **M9** | ADR-08 fica; da próxima vez que alguém puser pagamento externo, o agente cita ele |

O que esse passeio revela, e que a tabela de momentos não revelava: **M4 acontece
duas vezes**, e a segunda é depois de uma decisão. O laço não é "medir uma vez e
conversar" — é medir, conversar, decidir, **remedir**. Foi por isso que o §2
desenhou M2→M5 como ciclo, e não como fila.

---

## 7. Fatiamento: o menor pedaço que já vale sozinho

Cada fatia entrega um fluxo **completo e usável**, não um pedaço de encanamento:

| Fatia | Momentos | Entrega sozinha? |
|---|---|---|
| **A — Propósito** | M1 + M6 + gap no placar (M3) + citação na spec (M8) | **Sim.** Requisito ligado ao desenho, gap visível, spec rastreável. Não precisa de padrão, ADR nem percurso |
| **B — Padrão conferível** | padrão + M3 conformidade + M4 interação 1 + M7 item | **Sim.** Mas fica melhor com C |
| **C — Por quê** | M5 casos 2 e 3 + ADR + o agente citando | **Sim**, e é o que transforma B de cobrança em ensino |
| **D — Proposta medida** | M4 interação 2 | **Sim**, e é a mais barata de todas — o mecanismo de `sugerido` já existe |
| **E — Percurso** | M2/M7 por jornada | depende de A–C para ter o que verificar no caminho |

**Recomendação: A primeiro, D em seguida.** A fecha a cadeia da frente, que é o
objetivo declarado, e não depende de nada. D custa pouco e é a interação que
melhor demonstra a tese — se ela não encantar na prática, o resto do plano
merece nova conversa antes de continuar.

---

## 8. O que este documento não resolve

- **A UI de cada momento.** Aqui está o *quê* e o *quando*; o *como se parece*
  é desenho de tela, e vem depois de as cinco perguntas da §5 terem resposta.
- **O custo do agente por sessão.** M4 é conversa, e conversa é token. Se o
  ciclo for a cada mudança, a conta importa — provavelmente o agente só fala
  quando chamado ou quando o placar **piora**, não a cada tecla.
- **O que acontece com quebras que já existem** quando requisitos e padrões
  passarem a existir. Nenhuma quebra antiga tem requisito, e todas vão nascer
  com gap. Isso precisa de uma resposta que não seja "todo mundo fica vermelho".
