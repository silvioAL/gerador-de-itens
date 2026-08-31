# SPEC-96 — Avaliação: onde está o ganho, e como medi-lo

> **Origem:** três correções do usuário, em sequência, sobre a proposta de
> métricas da SPEC-94. Cada uma desmontou a anterior, e a ordem importa:
>
> 1. > *"quando falamos de processos estamos falando de mais do que validação de
>    > ensaios, não é por aí, precisamos avaliar como medir impacto."*
>
> 2. > *"sabendo que em software tudo é custo cognitivo, precisamos saber se
>    > realmente as coisas chegarão aos desenvolvedores de forma clara, onde por
>    > algum grau de confiança etc. Mas tenho sensação de que isso ficaria mais do
>    > lado do issue tracker (…) podemos pensar em adaptadores, modelo de
>    > métricas."*
>
> 3. > *"precisamos revisar o nosso fluxo de valor para ver onde teria ganho para
>    > definir isso, e não simplesmente delimitar em desenvolvedor mais rápido,
>    > quais métricas coletar."*
>
> **Esta é uma SPEC de AVALIAÇÃO**, no formato da SPEC-55, 56, 75 e 82: existe
> para decidir *se* e *como*, antes de alguém construir. **Não manda implementar
> nada.**

---

## 0. Três propostas erradas, e por que cada uma estava

Registro o caminho porque ele é o argumento: cada erro foi de **escopo estreito
demais**, e o padrão só fica visível na sequência.

| Proposta | O erro |
|---|---|
| **Tabela `medicoes`** com prontidão, lacunas, violações (SPEC-94 §2.3) | mede o **artefato**, e é **circular** — a prontidão é calculada pelas regras que nós mesmos definimos. Melhorar a nota do exame que você escreveu não prova nada. |
| **Bounce-back do tracker** (primeira escrita desta SPEC) | mede a **chegada ao desenvolvedor** — real e importante, mas é exatamente *"delimitar em desenvolvedor mais rápido"*. |
| **Escolher métricas antes de olhar o fluxo** | é o defeito que o **GQM** foi criado para evitar: coletar o que está à mão em vez do que responde a uma pergunta. |

**A ordem certa é a inversa, e tem nome.** A literatura que combina *Value Stream
Mapping* com GQM diz: métricas devem ser **ancoradas no fluxo de valor**, não
coletadas arbitrariamente — mapeie o fluxo, estabeleça o objetivo, formule as
perguntas, e **só então** escolha o que medir.

---

## 1. O fluxo de valor já está mapeado — e ninguém percebeu

Esta é a descoberta que economiza a parte cara do trabalho.

**VSM pede que se mapeie o fluxo ponta a ponta, com as etapas e os handoffs.**
`packages/web/src/demo/ciclo.ts` **já é isso**: 13 estágios, agrupados em 6 fases,
com o percurso desenhado em raias (`OFluxoDoProcesso`) marcando onde o trabalho
cruza a fronteira do sistema.

| Fase | Estágios |
|---|---|
| **Negócio e produto** | captar o que é perene · declarar o volume ◇ |
| **Arquitetura técnica** | analisar o contexto técnico |
| **Desenho da solução** | desenhar a solução · medir o que está pronto |
| **Ensaio e decisão** | ensaiar o que pode dar errado ◇ · registrar o porquê ◇ |
| **Entrega** | derivar os itens · especificar com a IA · conferir processo e testes · gerar specs · integrar com as ferramentas ◇ |
| **A volta** | fechar o ciclo |

> **Não precisamos mapear o fluxo de valor: ele é dado, é versionado e já está
> desenhado na primeira tela.** O que falta é **anotá-lo** com as métricas de VSM
> — que é a parte barata, e a que ninguém fez.

E há uma coisa que só se vê olhando o mapa inteiro: **o produto não executa quase
nenhuma dessas etapas.** Ele não desenha a arquitetura, não decide, não constrói.
**Ele opera nas passagens entre elas** — o que leva ao §3.

---

## 2. As métricas do fluxo, e o número que muda a conversa

O VSM tem quatro medidas, e três delas dizem coisas que "velocidade" não diz:

| Métrica | O que é |
|---|---|
| **Lead time** | tempo decorrido da etapa, incluindo espera |
| **Process time** | o tempo em que se trabalhou de fato |
| **Flow efficiency** (*activity ratio*) | `process ÷ lead` — tipicamente **baixíssimo**: a maior parte do tempo é espera, não trabalho |
| **%C&A** (*percent complete and accurate*) | **das vezes que a etapa recebeu trabalho, quantas vieram completas e corretas** — julgado por **quem recebe**, não por quem entrega |

### 2.1 O Rolled %C&A, e por que ele desmonta "desenvolvedor mais rápido"

`%C&A` composto ao longo do fluxo. Com seis fases a 85% cada:

> `0,85⁶ ≈ **38%**`

Ou seja: **62% do trabalho precisa de retrabalho em algum ponto** — e a
literatura reporta *rolled %C&A* típico entre **1% e 10%** em fluxos reais, isto
é, 90–99% do trabalho é retocado em algum handoff.

**Nenhum desses pontos percentuais está dentro da etapa de programar.** Eles estão
**entre** as etapas.

> É a prova numérica da correção do usuário: acelerar quem constrói não move o
> `rolled %C&A`. **Reduzir o retrabalho nas passagens move.**

---

## 3. Onde está o ganho — a tese de valor que sai daí

Cruzando o §1 com o §2:

> ### **O produto não acelera nenhuma etapa. Ele melhora o %C&A dos handoffs.**

Essa é a frase de valor, e ela é diferente, verificável e honesta. Onde ela
acontece, estágio a estágio — e note que **a maioria não tem nada a ver com
desenvolvedor**:

| Handoff | O desperdício de hoje | O que o produto faz |
|---|---|---|
| **nada → negócio** | o contexto do produto **se recola a cada demanda** | a camada perene não se recola — está escrito no próprio `ciclo.ts` como o que o estágio existe para resolver |
| **negócio → técnica** | a regra da casa vive em wiki e costume | vira dado consultável |
| **técnica → desenho** | "isto segue o padrão?" é opinião | o motor mede a cada mudança |
| **desenho → ensaio** | "e se der errado?" é conversa | aritmética sobre o grafo |
| **ensaio → entrega** | a decisão se perde, e o que foi recusado some | `Decisao` com alternativas descartadas |
| **entrega → construção** | **o item chega ambíguo** | lacuna contável antes de sair (§4) |
| **construção → volta** | o aprendizado não retorna | PDCA — **e o laço não fecha** (§6) |

**O primeiro e o último são os mais valiosos e os menos falados.** O primeiro é
onde o `CONCEITO.md` diz que *"o atrito cognitivo realmente mora"*; o último é o
que separa ciclo de esteira.

E o penúltimo — o que eu havia proposto como se fosse o único — é **um handoff
entre sete**.

---

## 4. A clareza na chegada, e o "grau de confiança"

Continua sendo o handoff mais mensurável, e o vocabulário existe.

O **DevEx framework** (Noda, Storey, Forsgren, Greiler — *ACM Queue*) reduz
experiência de desenvolvimento a três dimensões, e o produto opera em duas:
**cognitive load** (*"em software tudo é custo cognitivo"*, na frase do usuário) e
**feedback loops** — a lacuna contável **é** um feedback loop, porque diz o que
falta antes de a pessoa começar.

A métrica de mercado é o **ticket bounce-back rate**: o item volta por falta de
informação. Que é `%C&A` medido num handoff específico — a mesma família, e é
por isso que ela encaixa no §2 em vez de competir com ele.

### 4.0 ⚠️ A ressalva ao DevEx, e por que ela reordena esta seção

> Do usuário: *"DevEx parece falar de produtividade, mas tenho certas ressalvas:
> se passa muito mais tempo tentando entender o que deve ser feito — em reuniões,
> codebase atual, regras — do que apertando botões."*

**A ressalva procede em duas frentes, e a segunda muda o vocabulário desta SPEC.**

**Primeira: o enquadramento é mesmo de produtividade.** O paper se chama *"DevEx:
What Actually Drives Productivity"*, e o framework é vendido por fornecedores de
*developer productivity*. Nesse enquadramento a carga cognitiva entra como
**variável explicativa da saída** — mede-se para explicar por que a saída não sobe.
Aqui ela não é meio: **é o objeto**.

**Segunda, e a que importa: a premissa do usuário é empiricamente verdadeira.**

| Estudo | Achado |
|---|---|
| Xia et al. (2018), 3.148 horas de 78 profissionais | **~58%** do tempo em compreensão de programa |
| Minelli et al. (2015), 740 sessões de 18 desenvolvedores | **~70%** |

E os dois medem apenas o que acontece **dentro da IDE**. Reunião, caça à regra da
casa e descoberta de decisão anterior **não entram nessas contas** — o que empurra
o total ainda mais para cima. *"Apertar botões"* é a minoria clara do tempo, e
otimizá-la é otimizar o pedaço pequeno.

### 4.0.1 O vocabulário que serve melhor: os três tipos de carga

O DevEx trata *cognitive load* como **uma coisa só**, e por isso não diz o que
fazer com ela. **Sweller distingue três**, e o *Team Topologies* (Skelton & Pais)
as aplica a times de software — é essa distinção que torna a coisa acionável:

| Tipo | O que é | Como se trata | O produto |
|---|---|---|---|
| **Intrínseca** | fundamental ao problema — *"como funciona uma classe Java?"* | treino, escolha de tecnologia, contratação | **não toca**, e não deveria |
| **Extrínseca** | do ambiente — *"como configuro este serviço mesmo?", "qual a regra da casa para isto?", "onde ficou registrado que decidimos X?"* | **eliminar**; boa parte é automatizável | **é exatamente o que ele ataca** |
| **Germane** | o pensamento que agrega valor — *"como este serviço deve conversar com o ABC?"* | **liberar espaço para ela** | é o que sobra quando a extrínseca sai |

> ### A tese fica mais precisa: **o produto reduz carga extrínseca para liberar germane.**

Isso é literalmente a receita do *Team Topologies* — *minimizar a intrínseca,
eliminar a extrínseca, deixar espaço para a germane* — e as perguntas que a camada
perene responde são todas da coluna do meio: *qual é o padrão da casa · que campos
este tipo exige · o que já foi decidido e recusado · este caminho estoura a régua*.

**Cada uma dessas é uma pergunta que hoje se responde em reunião ou lendo código.**

E há uma consequência de escopo: **a unidade certa não é o desenvolvedor.** A
compreensão que este produto ataca acontece antes e fora dele — no negócio, na
arquitetura, na decisão. *Team Topologies* fala em **carga cognitiva do time**, e é
essa a unidade. É a mesma correção do §3, chegando por outro caminho.

### 4.1 A calibração — a melhor ideia desta avaliação

O usuário disse *"onde por algum grau de confiança"*, e **o produto já emite esse
grau sem saber que emite.** `ItemDeTrabalho` carrega:

```ts
/** Quantos campos ainda pedem `✍️ especificar` no corpo — 0 = pronto. */
pendencias: number;
/** Quantas respostas entraram como sugestão da esteira, aguardando confirmação. */
sugestoes: number;
```

Isso é uma **previsão**. O bounce-back é o **resultado**.

> Um item com `pendencias: 0` **deveria** gerar menos dúvida que um com
> `pendencias: 5`. Se gerar a mesma, **a medida de prontidão não vale nada** — e
> isso é testável contra o mundo real.

É o que quebra a circularidade do §0: a prontidão deixa de ser a nota do exame que
nós escrevemos e passa a ser **uma previsão que a realidade confirma ou
desmente**. Não exige modelo estatístico nem inferência causal — só o item, o
número que ele já carrega, e o que aconteceu com ele.

E é a tese do produto virada contra ele mesmo: *"uma medida que ninguém consegue
contestar vira ruído ou dogma"*. Hoje a prontidão é incontestável — não por ser
certa, mas porque **nada a confronta**.

### 4.2 O que o dado de sistema não alcança

O DevEx é explícito: o método combina dado de sistema com **percepção declarada**,
porque carga cognitiva é vivida, não observada. Um item pode ter zero bounce-backs
e ter custado três horas de leitura.

**Medir só pelo tracker captura o atrito que teve consequência visível, e perde o
silencioso — que é a maior parte.** Fica dito como limite, não escondido.

---

## 5. A regra como unidade de análise

Um degrau além, e é o que quase ninguém pode fazer.

**Cada regra da casa é uma hipótese:** *"seguir isto produz resultado melhor"*.
Toda ferramenta de governança **cobra** a regra; **nenhuma pergunta se a regra
serve.** O produto sabe, por construção: que regra gerou cada apontamento
(`Requisito`/`Checagem`), onde foi violada (`violacoesEmAberto()`), e **onde foi
excecionada de propósito, com motivo e autor** (`ExcecaoDePadrao`).

Ligado a resultado externo, isso responde: **"esta regra vale a pena?"** — na
forma *"nos componentes onde a exceção X foi aceita, aconteceu mais Y"*. Pequena,
contestável, útil.

E paga uma dívida: o `CONCEITO.md` promete *"se cinco times violam o mesmo padrão,
o padrão está errado, não os times"*, e a SPEC-94 §2.3 mediu que **não existe
código que compute isso** — ganho sem mecanismo dentro do arquivo que estabelece a
regra de que todo ganho tem mecanismo.

> **A inversão que resolve o conflito de interesse:** *"o produto teve impacto"* é
> juiz em causa própria; *"o time mede o efeito das próprias regras"* é
> instrumento. A segunda é feature, a primeira é marketing — e a segunda vende
> melhor: um produto disposto a mostrar que uma regra da casa **não** serve é um
> produto em que se acredita quando diz que outra serve.

---

## 6. A lacuna dura: o laço não fecha, e a porta que falta

> *"tenho sensação de que isso ficaria mais do lado do issue tracker (…) podemos
> pensar em adaptadores, modelo de métricas."*

**A sensação está certa, e a arquitetura sugerida é a que o sistema já tem.**

### 6.1 Nenhuma conexão traz resultado de volta

As cinco conexões de `demo/conceito.ts`: **ADRs da casa** (entra), **Arquitetura
de negócio** (entra, ausente), e três que **saem** — itens → tracker, documento →
base de conhecimento, spec → desenvolvimento com IA.

O produto empurra itens para o tracker e **nunca sabe o que aconteceu com eles**.

> **Medir impacto é impossível hoje por falta de CANAL, não por falta de
> cálculo.** Nenhuma tabela `medicoes` resolve: o dado não existe do nosso lado da
> fronteira.

### 6.2 A simetria que falta é literal

O sistema é hexagonal desde a SPEC-31, com **27 portas** em
`packages/aplicacao/src/portas/`. Existe `exportadorDeItens.ts` — a ida. **Não
existe a volta.**

Uma porta, e **um adaptador por tracker**. É o padrão que o produto já usa para
gateway de IA, cofre de segredos, ADRs e publicação de documento. E o nome já
está lá: **SPEC-81, "MCP de mão dupla"** — usado hoje numa direção só.

### 6.3 O modelo de métricas: o mínimo que a porta devolve

Não "o Jira inteiro". Cada campo existe porque uma pergunta acima precisa dele:

| Campo | Responde a |
|---|---|
| identidade lá fora, ligada à `Atividade.chave` | sem isto nada se liga — e a chave já é estável |
| estado, e **quando** mudou | lead time e process time (§2) |
| **voltas** (bounce-back / reabertura) | %C&A do handoff, e a calibração (§4.1) |
| causa declarada da volta, quando houver | *requirements defect · test gap · communication failure · tech debt* |

**Quatro campos.** Um modelo maior seria modelar o tracker dos outros — e a
tradução é justamente o trabalho do adaptador.

---

## 7. O vocabulário de mercado, pesquisado

| Framework | O que traz |
|---|---|
| **VSM** (lead/process time, flow efficiency, **%C&A**, rolled %C&A) | **a espinha desta avaliação** — e o número que desmonta "dev mais rápido" (§2.1) |
| **GQM / GQ(I)M** (Basili) | o método: objetivo → perguntas → métricas, **ancorado no fluxo** |
| **Carga cognitiva** (Sweller: intrínseca · extrínseca · germane) via **Team Topologies** | **o vocabulário central do §4** — e a única distinção que torna "custo cognitivo" acionável, porque separa o que se trata com treino do que se elimina com design |
| **DevEx** (feedback loops · cognitive load · flow state) | os *feedback loops* e o alerta de que dado de sistema não basta. **Com ressalva (§4.0):** o enquadramento é de produtividade, e trata carga cognitiva como uma coisa só |
| **DORA** (deploy, lead time, taxa de falha, restauração) | o padrão que um CTO conhece — e **as quatro exigem dado de fora**, confirmando o §6.1 |
| **SPACE** | o alerta contra **métrica única** e contra medir **indivíduo** |
| **EBM** (Scrum.org) | valor e capacidade em linguagem de gestão — **fala com o público não técnico** da SPEC-95 §1.1 |

### 7.1 O GQM vira configuração

**O objetivo é da organização, não nosso.** O produto **não deve ter lista fixa de
métricas de impacto**: o time declara o objetivo e as métricas se ligam ao que
existe. Mesmo padrão do resto do produto — a regra é dado, não código —, e é o que
impede isto de virar painel genérico, que é ruído que se aprende a ignorar junto
com o que importava.

---

## 8. O que esta SPEC RECUSA

- **"Desenvolvedor mais rápido" como tese de valor.** O §2.1 mostra por quê pelo
  lado do fluxo, e o §4.0 pelo lado do tempo: **58–70% dele é compreensão**, e
  esses estudos nem contam reunião.
- **Tratar "carga cognitiva" como uma coisa só.** Sem separar extrínseca de
  intrínseca (§4.0.1), a medida não diz o que fazer — e o produto passaria a
  reivindicar redução de carga que é de treino e contratação, não dele.
- **Uso apresentado como impacto.** "500 itens derivados" é atividade.
- **Métrica por pessoa.** DORA e SPACE são explícitos, e aqui o risco é concreto:
  *"quem escreveu itens que voltaram"* é fácil de extrair do modelo do §6.3, e é a
  pergunta errada.
- **Métrica única.** *"O índice da sua empresa é 68"* é consultoria com aparência
  de medição.
- **Meta sobre a métrica.** Quando a medida vira meta, deixa de medir — e este
  produto **deriva itens de trabalho a partir de apontamentos**, ou seja, tem
  caminho pronto para transformar métrica em cobrança automática sem ninguém
  decidir isso. **É o risco mais concreto desta SPEC.**
- **Correlação como causa.**
- **Modelar o tracker dos outros** (§6.3).
- **Prometer o contrafactual** — *"sem isto teria sido pior"* exige comparação
  pareada que quase nenhuma organização vai montar.

---

## 9. O que precisa ser decidido antes de construir

1. **Anotar o fluxo de valor existente vem antes de tudo?** Esta avaliação diz que
   sim: os 13 estágios já estão lá, e ninguém sabe onde está a espera e onde está
   o retrabalho. **É a fatia mais barata e a que decide as outras.**
2. **Com que evidência se anota?** Medir `%C&A` de cada handoff exige dado que não
   temos. **Um VSM inicial é feito com o time, numa sala** — é assim na indústria,
   e não é derrota: é o passo que revela onde vale instrumentar.
3. **A volta do tracker vem antes da tabela de medições?** Sim (§6.1), contrariando
   a ordem da SPEC-94 §2.3.
4. **O primeiro sinal é o bounce-back?** É o mais barato, o mais ligado ao output
   do produto, e habilita a calibração do §4.1. **Recomendação: sim** — mas
   **depois** do §1, para não repetir o erro de escolher métrica antes de olhar o
   fluxo.
5. **A calibração é feature ou instrumento interno?** As duas são legítimas, e a
   segunda vem primeiro: se a prontidão não calibrar, não há o que mostrar.
6. **Survey entra?** Sem ele se perde o atrito silencioso (§4.2). Mas survey dentro
   de ferramenta de trabalho é intrusivo, e mal feito produz dado pior que nenhum.
   **Recomendação: fora desta avaliação**, com o limite dito.
7. **O que fazer quando a medição disser que uma regra não serve?** É o caso de
   sucesso, e o mais desconfortável — alguém escreveu aquela regra. O PDCA tem o
   caminho; **a conversa social não se resolve por código.**

---

## 10. Recomendação

**Não construir a tabela `medicoes` como a SPEC-94 a desenhou**, e **não começar
pelo tracker.** A ordem:

1. **Anotar o fluxo de valor que já existe** — `%C&A`, espera e retrabalho por
   handoff, feito com o time. **Barato, e é o que diz onde instrumentar.** Sem
   isto, qualquer métrica é palpite com número.
2. **A porta de volta** — simétrica ao `exportadorDeItens`, quatro campos (§6.3),
   **um** adaptador para começar, escolhido pelo handoff que o passo 1 apontar.
3. **A calibração da prontidão** (§4.1) — o menor experimento que produz
   conhecimento real: *o número que emitimos prevê alguma coisa?* Se não prevê,
   essa é a descoberta mais valiosa desta linha, e é melhor sabê-la cedo.
4. **Série temporal**, quando houver o que guardar.
5. **A regra como unidade de análise** (§5) — o diferencial, e o que paga a
   promessa dos cinco times.
6. **GQM como configuração** — depois de existir dado, nunca antes.

> **E enquanto isso não existir, a página pública não afirma impacto.** Ela afirma
> o que o produto faz, que é bastante — e a conexão de volta aparece **marcada
> como ausente** no mapa, que é o mecanismo que esta casa já usa para não mentir
> (SPEC-76). Uma landing que prometesse medição de impacto antes de o laço fechar
> seria a maior promessa falsa que este produto já teria feito, e ele tem uma peça
> na primeira tela dizendo que não faz isso.

---

## 11. Para quem for avaliar em seguida

- `packages/web/src/demo/ciclo.ts` — **o fluxo de valor, já mapeado**: 13
  estágios, 6 fases. O §1 vive aqui.
- `packages/web/src/demo/conceito.ts` — as cinco conexões e seus sentidos: a prova
  do §6.1, e onde a volta apareceria marcada.
- `packages/aplicacao/src/portas/exportadorDeItens.ts` — a ida, e o molde da volta.
- `packages/engine/src/especificacao/gerarItensDeTrabalho.ts` — `pendencias` e
  `sugestoes`: a previsão que ninguém confrontou com a realidade (§4.1).
- `packages/engine/src/remedicao/remedicao.ts` — a remedição prospectiva, e o
  contraste com a retrospectiva que falta.
- `packages/engine/src/decisao/decisoes.ts`, `ExcecaoDePadrao` — as exceções com
  motivo e autor: o dado mais valioso do §5, ainda não analisado.
- `SPEC-31` (portas e adaptadores) · `SPEC-81` (MCP de mão dupla) · `SPEC-39`
  (PDCA, onde a conclusão vira ajuste).
- `CONCEITO.md`, *"Por que é um ciclo, e não uma esteira"* — a promessa dos cinco
  times, ainda sem mecanismo.

### As fontes

- Value Stream Mapping, métricas e `%C&A` — <https://www.harness.io/blog/value-stream-mapping-guide> · <https://strategicmanagementinsight.com/tools/value-stream-mapping-vsm/>
- VSM + GQM (métricas ancoradas no fluxo) — <https://arxiv.org/pdf/2601.03574>
- GQM, Basili — <https://en.wikipedia.org/wiki/GQM>
- **DevEx: What Actually Drives Productivity** (Noda, Storey, Forsgren, Greiler), ACM — <https://cacm.acm.org/practice/devex-what-actually-drives-productivity/>
- **Measuring Program Comprehension: A Large-Scale Field Study with Professionals** (Xia et al., IEEE TSE) — <https://baolingfeng.github.io/papers/tsecomprehension.pdf>
- Carga cognitiva de time (Sweller aplicado por *Team Topologies*) — <https://itrevolution.com/articles/cognitive-load/> · <https://www.devopsinstitute.com/team-cognitive-load/>
- Ticket bounce-back rate — <https://www.minware.com/guide/metrics/ticket-bounce-back-rate>
- DORA × SPACE × DX Core 4 — <https://www.swarmia.com/blog/comparing-developer-productivity-frameworks/>
