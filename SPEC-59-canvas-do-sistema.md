# SPEC-59 — O canvas do sistema

> **Origem:** *"temos um pipeline de IA, motor, PDCA, tudo em sessões separadas,
> entendo que tudo (ou quase tudo) isso poderia ficar em um canvas único onde se
> configura agentes, motor de rules, etc do próprio sistema, os agentes podem ter
> 'avatares' para ficar mais user friendly"*.

---

## 1. O que o pedido acerta, e é mais do que ergonomia

A configuração vive hoje em **12 telas de formulário**. Três delas descrevem um
**fluxo** — e formulário mostra os campos e esconde a ligação entre eles:

| Fluxo | Como aparece hoje | O que fica invisível |
|---|---|---|
| **Esteira de agentes** | lista de papéis com preâmbulo e contextos | que eles rodam **em sequência** sobre o mesmo item, cada um escrevendo uma parte |
| **Motor de regras** | quatro seções em abas | a cadeia `tech × contexto → requisito → checagem → item derivado` |
| **PDCA** | lista de feedbacks e propostas | que é um **laço**: uso → feedback → proposta → aplicar → muda a config → volta ao uso |

A palavra "ciclo" está no nome do PDCA e o ciclo não aparece em lugar nenhum.
A esteira se chama esteira e é mostrada como lista. **O canvas não é enfeite: é
a forma que já corresponde ao conteúdo.**

E há um ganho conceitual maior: a mesa de projeto ensina uma linguagem — nós
tipados, conexões com regra, painel de propriedades, proveniência, medição.
Quem aprendeu a desenhar o sistema **já sabe** configurar a ferramenta, se a
ferramenta se configurar do mesmo jeito.

## 2. A régua que decide o que entra: fluxo, não tudo

> **Só vai para o canvas o que tem fluxo.** O resto continua onde está.

"Tudo vira nó" é o erro clássico deste tipo de unificação, e ele custa caro:
troca telas boas por uma metáfora forçada, e a pessoa passa a arrastar caixinha
para editar o que era um campo.

| Fica FORA, e por quê |
|---|
| **Membros e acessos** — é tabela de pessoas × nível. Grafo não acrescenta nada e a tabela é ótima |
| **Contexto do produto** — é uma ficha de texto. Um nó "produto" ligado a nada é um formulário com borda arredondada |
| **Stacks conhecidas** — é catálogo, consultado por chave |
| **Modelo de IA** — é uma credencial e um endereço |
| **Modelos de documento e item** — é edição de template, com validação de variável |

Restam exatamente os três da tabela do §1. **É pouco, e é o certo:** três fluxos
bem mostrados valem mais que doze caixinhas.

## 3. O que o canvas do sistema mostra

Um diagrama, três regiões, todas ligadas ao mesmo centro — **o item de
trabalho**, que é o que a ferramenta produz:

```
   ┌── REGRAS ──────────┐        ┌── ESTEIRA ─────────────┐
   │ tech × contexto    │        │ 🧑‍💼 PO  → 🏛 Arquiteto │
   │   → requisito      │        │   → 🔧 Especialista    │
   │   → checagem ⚖     │        │   → 🧪 QA              │
   └─────────┬──────────┘        └───────────┬────────────┘
             │  derivam                      │  escrevem
             ▼                               ▼
          ┌──────────────────────────────────────┐
          │          O ITEM DE TRABALHO          │
          └──────────────────┬───────────────────┘
                             │  uso real
                             ▼
              ┌── PDCA ──────────────────┐
              │ feedback → proposta →    │
              │ aplicar ─┐               │
              └──────────┼───────────────┘
                         └──► volta a mudar REGRAS e ESTEIRA
```

A seta que fecha o laço do PDCA de volta nas regras é a coisa que **hoje não
existe em tela nenhuma**, e é o que faz alguém entender por que responder o
feedback importa.

## 4. Os avatares: o que eles precisam codificar para não serem adesivo

Avatar bonito que não diz nada é decoração, e decoração numa tela de
configuração é ruído. Cada avatar carrega **três** informações, ou não vale o
espaço:

1. **O papel** — PO, Arquiteto, Especialista técnico, QA. É o que a pessoa
   procura quando pergunta "quem escreve os critérios de aceite?";
2. **O estado** — ativo, desligado, **sem credencial de IA**, **falhou na
   última execução**. Um papel configurado que nunca roda é o defeito mais
   silencioso da esteira, e hoje só se descobre olhando o resultado vazio;
3. **O escopo** — global ou deste time. A mesma distinção que o resto da config
   já tem, e que hoje só aparece em texto miúdo.

**A linha que os avatares não podem cruzar:** eles não podem sugerir autonomia
que o agente não tem. Todo agente aqui **propõe**; ninguém decide. Um avatar
com cara de colega autônomo contradiz a regra 2 da SPEC-57, que é a espinha do
produto. O desenho tem que dizer "assistente", não "funcionário".

## 5. A descoberta técnica que decide o custo

**O canvas já é dirigido por configuração.** `Canvas` recebe `config:
DiagramaConfig` e desenha o que esse documento declarar — tipos de nó, tipos de
aresta, regras de conexão, campos do painel. Um canvas do sistema é, no papel,
**um segundo `DiagramaConfig`** (`sistema.json`) — não um segundo canvas.

**Mas** `Canvas` também recebe `quebraState: UseQuebra`, e `UseQuebra` é o
estado de uma **quebra**: diagrama + necessidades + decisões + percursos +
respostas de item. Ou seja: o componente é genérico na *forma* e acoplado ao
*domínio*.

> **O trabalho real desta SPEC não é desenhar o canvas do sistema. É separar
> "estado de um diagrama" de "estado de uma quebra".**

Isso é refatoração de fronteira, e é a maior parte do custo — e também o maior
ganho colateral: hoje qualquer coisa que queira um segundo diagrama (um mapa de
contexto, um desenho de referência) esbarra na mesma parede.

## 6. Riscos, ditos em voz alta

1. **Config quebrada quebra a ferramenta.** A mesa de projeto erra o desenho de
   uma demanda; o canvas do sistema erra a ferramenta inteira. Precisa do
   portão que o PDCA já tem: **ver o efeito antes de aplicar** — o preview num
   item de exemplo (SPEC-45) é o modelo a seguir, não a exceção.
2. **Canvas não é bom para editar campo.** Ele mostra a ligação; quem edita é o
   painel de propriedades — exatamente como na mesa. Se alguém acabar
   arrastando caixinha para trocar um texto de preâmbulo, o desenho falhou.
3. **Canvas único esconde o que existe.** Doze itens de menu são feios e
   *descobríveis*. Um canvas é bonito e mudo. Ou ele nasce com o conteúdo já
   desenhado (não com a tela vazia), ou ninguém acha nada.
4. **O tour de configuração tem 13 passos ancorados nessas telas.** Trocar as
   telas sem trocar o tour transforma a demonstração em mentira — o §234 já
   cobrou esse preço uma vez.
5. **Duas verdades.** Enquanto as abas e o canvas coexistirem, os dois editam a
   mesma config. Isso é aceitável em transição e insustentável como destino:
   uma das duas tem que sair (fatia E).

## 7. O que esta SPEC NÃO faz

- **não cria programação visual.** Sem condicional, sem laço desenhado, sem
  "arraste para criar uma regra nova de negócio". O canvas mostra e liga o que
  a config já expressa;
- **não mexe** em membros, acessos, produtos, stacks, modelo de IA nem
  templates;
- **não substitui o painel de propriedades** — ele continua sendo onde se
  edita;
- **não promete um canvas por time** nesta rodada (ver §9).

## 8. Fatiamento

| Fatia | O que entrega | Vale sozinha? |
|---|---|---|
| **A — Ver** | o canvas do sistema em **leitura**: os três fluxos desenhados a partir da config real, com o laço do PDCA fechado | **Sim.** Hoje ninguém consegue ver a esteira como sequência nem o ciclo como ciclo |
| **B — Avatares** | papel + estado + escopo no nó do agente, incluindo "sem credencial" e "falhou na última" | **Sim**, e é o que responde "por que meu item saiu vazio?" |
| **C — Separar o estado** | `UseDiagrama` extraído de `UseQuebra`; o canvas deixa de conhecer quebra | Não entrega tela, mas **destrava** D e qualquer segundo diagrama futuro |
| **D — Editar** | mover, ligar, criar papel e regra pelo canvas, com preview do efeito antes de aplicar | **Sim**, e depende de C |
| **E — Aposentar as abas** | as três telas que o canvas substitui saem do menu e do tour | **Sim**, e só depois de D |

**Recomendação: A primeiro, e por bastante tempo.** Ver o fluxo já resolve a
maior parte da dor descrita ("tudo em sessões separadas") sem nenhum risco de
quebrar config — é leitura. Se a vista não convencer em uso, D e E não merecem
ser construídos, e isso terá custado uma fatia em vez de cinco.

## 9. As perguntas que precisam de resposta antes do primeiro commit

1. **O canvas do sistema é por time ou global?** As configs que ele mostra são
   mistas: `regras` e `pipeline-agentes` são globais hoje (`__global__`),
   `camposNo` é por time. **Proposta:** o canvas mostra o escopo em cada nó (o
   avatar carrega isso) e não inventa um escopo novo — inventar aqui obrigaria
   a migrar config existente, que é a lição do §244.
2. **Onde ele vive?** **Proposta:** rota própria (`#/sistema`), ao lado de
   `#/documento` e `#/itens` — não dentro de `#/config`, porque ele não é mais
   uma aba: é a vista que as reúne.
3. **`UseQuebra` vira genérico, ou nasce um `UseDiagrama` ao lado?**
   **Proposta:** extrair `UseDiagrama` (nós, arestas, seleção, conexão) e fazer
   `UseQuebra` compô-lo. Genérico por parâmetro de tipo espalharia domínio no
   canvas; composição mantém a fronteira nítida.
4. **O que acontece com o tour de configuração?** Ele tem 13 passos hoje.
   **Proposta:** a fatia A acrescenta **um** passo (o canvas em leitura) e não
   remove nenhum; a fatia E é que reescreve o tour, junto com as telas que
   saírem — no mesmo commit, nunca depois.
