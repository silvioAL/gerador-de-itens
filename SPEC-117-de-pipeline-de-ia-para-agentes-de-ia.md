# SPEC-117 — De "Pipeline de IA" para "Agentes de IA": o que dá para editar, e o que não dá

> **Origem:** o usuário, depois de receber a aba de mapeamento por componente
> (§411), olhando a tela de configuração do pipeline:
>
> > *"eu tenho um certo agente pronto para isso, o problema é que não tenho
> > flexibilidade para editar os agentes do assistente na ferramenta,
> > precisamos de spec para atender isso, o caminho natural é evoluir essa
> > parte de pipeline de IA para Agentes de IA e ter uma sessão para editar o
> > pipeline"*
>
> Esta SPEC **não implementa nada** — mede o que existe, nomeia o que falta e
> faz as perguntas cuja resposta muda o desenho.

---

## 0. A medição, antes de propor

O produto chama **três coisas diferentes** de agente. Elas têm ciclos de vida,
donos e graus de configurabilidade distintos — e a queixa do usuário é
precisa: **só uma delas é editável.**

| | O que é | Onde mora | O que dá para editar hoje |
|---|---|---|---|
| **1. Papéis da esteira** | PO, Arquiteto, Especialista, QA — rodam em sequência sobre os ITENS, na tela de revisão | `PAPEIS_PADRAO` → config `pipelineAgentes` | ✅ nome, descrição, **preâmbulo**, grupo da ficha, contextos, ordem, ligado/desligado |
| **2. Conversas do assistente** | desenhar, decisões, script de mapeamento, alterar item, necessidades, cenários, configurar… | `pedidos.ts`, **prompt literal no código** | ❌ **nada** |
| **3. Agentes do gateway** | o outro lado das integrações: tracker, base de conhecimento, ADRs, spec do item | config `exportador` → `DestinoDoGateway` | ⚠️ endereço, cabeçalhos, método, envelope, espaço — **mas não o que o agente faz** |

### 0.1 O número que dimensiona o problema

`grep "export function montarPedido"` em `pedidos.ts` devolve **nove**:

```
montarPedidoPipeline           ← a esteira (parcialmente configurável)
montarPedidoDiagrama           ← "✦ Desenhar conversando"
montarPedidoAlterarItem        ← a conversa da especificação
montarPedidoSugerirConfig      ← o "✦ Sugerir" dos formulários
montarPedidoConfigurarConversa ← a aba "⚙ Configurar"
montarPedidoScriptDeMapeamento ← §411, a aba "🔎 Mapear componente"
montarPedidoDecisoes           ← propor decisões
montarPedidoCenariosDeLentidao ← a pauta do ensaio
montarPedidoNecessidades       ← propor propósitos
```

**Oito dos nove têm o prompt inteiro escrito em TypeScript.** Quem quiser
trocar o comportamento de qualquer um deles precisa de um deploy — que é
exatamente a frase *"não tenho flexibilidade para editar os agentes do
assistente na ferramenta"*.

### 0.2 A anatomia já existe, e ela já confessa

`ANATOMIA_DO_PROMPT_PIPELINE` classifica cada parte do prompt da esteira:

| Parte | Origem |
|---|---|
| Preâmbulo do papel | **`configuravel`** |
| Contexto do produto | `da-quebra` |
| Contexto da demanda | `da-quebra` |
| Instrução do lote | **`fixo`** |
| Contexto dos nós | `da-quebra` |
| O que os papéis anteriores definiram | `da-quebra` |
| Campos a responder | `da-quebra` |

**Uma parte configurável, uma fixa, cinco derivadas do trabalho.** Isso é
honesto e está certo para a esteira — mas repare que essa anatomia **só existe
para ela**. As outras oito conversas não têm nem a classificação: não há como
uma pessoa saber o que ali é dela e o que é do produto, porque nada é dela.

### 0.3 O que a aba de hoje faz bem, e por que ela não é o problema

A tela do print já resolve, para a esteira, quase tudo o que o usuário está
pedindo para o resto: ordem, ligado/desligado, prompt por papel, contextos,
confirmação obrigatória, e até **"✦ Sugerir"** um papel novo em linguagem
natural. O problema não é a qualidade da aba — é o **alcance** dela.

---

## 1. As duas leituras de *"tenho um agente pronto"*, e elas pedem coisas diferentes

Esta é a pergunta que decide o desenho inteiro, e a SPEC não deve escolher
sozinha.

### Leitura A — um PROMPT que já foi refinado

O usuário tem um texto de sistema que funciona bem para mapear componentes, e
quer colá-lo no lugar do que o produto escreve hoje.

**O que isso exige:** que cada conversa do assistente ganhe o mesmo
`preambulo` que os papéis da esteira já têm — um campo de texto, guardado na
config, que entra no prompt montado. A mecânica **já existe e está provada**;
o que falta é estendê-la.

**Custo:** baixo. **Risco:** o prompt do produto carrega regras que não são
estilo — `montarPedidoDecisoes` exige duas alternativas, `montarPedidoScriptDeMapeamento`
exige somente leitura e proíbe inventar endereço. Um preâmbulo que
**substitua** o prompt apaga essas regras em silêncio; um que **acrescente**
não dá a flexibilidade que o usuário quer. Ver §3.

### Leitura B — um AGENTE que já roda em outro lugar

O usuário tem um agente no gateway/MCP dele — com ferramentas, memória,
acesso ao repositório — e quer que a conversa do assistente fale com **ele**
em vez de com o modelo direto.

**O que isso exige:** que uma conversa do assistente possa ter um
`DestinoDoGateway` como executor, e não o provedor de IA. É novidade
arquitetural de verdade: hoje os destinos do gateway existem só para
**sair** (exportar, publicar) e **ler** (ADR, documento). Nenhum deles é
usado para *pensar*.

**Custo:** alto. **Ganho:** é o que torna real a frase que o usuário usou para
descrever o produto — *"integrado a um API gateway que pode ter agentes
integrados, além de ter seu próprio pipeline de agentes e assistente"*. As
duas coisas conviveriam, e a escolha seria por agente.

> **As duas não se excluem, e provavelmente as duas são verdade.** A pergunta
> em aberto é a ORDEM, não a escolha — ver §6.

---

## 2. O que muda de nome, e por que o nome importa

*"O caminho natural é evoluir essa parte de pipeline de IA para Agentes de
IA."* Concordo, e a razão é mais dura que estética: **"pipeline" descreve a
esteira, e só ela.** Uma tela chamada "Pipeline de IA" que passasse a
configurar também as conversas do assistente estaria mentindo no título —
conversa não é pipeline, não tem ordem, não roda em lote.

O nome novo precisa abrigar os três tipos da §0 sem achatá-los:

```
Agentes de IA
├── Esteira de itens     ← os papéis de hoje, em ordem (é o pipeline)
├── Conversas            ← as oito do assistente, cada uma com o seu recorte
└── Agentes externos     ← os destinos do gateway, quando forem executores
```

**O que esta divisão RECUSA:** uma lista única de "agentes" com um campo
`tipo`. Os três não compartilham nem ciclo de vida nem forma — a esteira tem
ordem e a conversa não; a conversa tem uma tela onde vive e o papel não; o
agente externo tem endereço e os outros dois não. Uma abstração que os
unificasse produziria um formulário com metade dos campos cinza.

---

## 3. ⚠️ A régua que não pode cair junto: prompt não é só estilo

É o ponto mais delicado desta SPEC, e ele vem de um defeito que o produto já
pagou.

Vários prompts carregam **regras de produto**, não preferências:

| Prompt | A regra que ele carrega | O que se perde se sumir |
|---|---|---|
| `montarPedidoDecisoes` | duas alternativas no mínimo, com consequência | proposta com uma opção só é opinião vestida de decisão |
| `montarPedidoScriptDeMapeamento` | **somente leitura**, não inventar endereço | um comando destrutivo colado num terminal com acesso |
| `montarPedidoDiagrama` | só os tipos configurados no projeto | um desenho com nó que o produto não sabe renderizar |
| `montarPedidoNecessidades` | lista vazia é resposta correta | cota preenchida com propósito inventado |
| todos | *"responda em português"* | metade do artefato noutro idioma |

E há a trava explícita: **`gerarSpec.trava.test.ts`** varre os arquivos que
orquestram IA e falha se algum passar a citar as seções de julgamento. Um
campo de prompt livre nas conversas é um caminho novo por onde um modelo
poderia escrever `recusas` — e a varredura de fonte não pegaria, porque o
texto estaria no **banco**, não no código.

> **A pergunta que a implementação precisa responder antes da primeira linha:**
> o preâmbulo configurável **acrescenta** ao prompt do produto, ou **substitui**
> ele? Ver §6, pergunta 2.

Três saídas, e nenhuma é gratuita:

| Saída | Custo |
|---|---|
| **Só acrescenta** (como a esteira faz hoje) | seguro, e não entrega a flexibilidade pedida — as regras do produto continuam mandando |
| **Substitui, com as regras reinjetadas** | o produto reimpõe o que é inegociável (somente leitura, português, esquema) por cima do texto de quem editou |
| **Substitui inteiro** | flexibilidade total, e o primeiro agente mal escrito produz spec plausível-e-vazia — exatamente o que a SPEC-80 §2 recusa |

**Recomendação: a do meio**, e ela precisa de uma lista explícita do que é
inegociável por conversa — o que transformaria a `ANATOMIA_DO_PROMPT_PIPELINE`
da §0.2 de documentação em **mecanismo**.

---

## 4. O que esta SPEC RECUSA

- **Um campo de prompt livre que apague as regras de produto em silêncio.**
  Se substituir, o que é inegociável volta por cima, e a tela diz que voltou.
- **Unificar os três tipos numa lista só.** Ver §2 — produziria formulário com
  metade dos campos inaplicáveis.
- **Executar agente externo sem dizer que é externo.** A régua do "modo sem
  custo" (SPEC-74) e do modo de demonstração (SPEC-115 fatia D) vale aqui: o
  que não foi escrito pelo modelo do produto chega marcado.
- **Deixar a esteira sem papel nenhum.** `normalizarPipelineAgentes` já cai em
  `PAPEIS_PADRAO` quando a lista fica vazia, e essa guarda não se perde na
  reorganização.
- **Uma segunda tela de configuração de IA.** A aba de modelo (`ModeloIaTab`)
  responde *com quem falamos*; esta responde *quem fala*. São perguntas
  diferentes na mesma casa, e o menu já as separa.

---

## 5. Fatias, para a conversa que implementa

- **A — a aba vira "Agentes de IA", com as três seções da §2.** Só
  reorganização e nome: a esteira continua funcionando byte a byte. **Prova:**
  a config salva antes da mudança abre igual, e o E2E de configuração passa
  sem alteração.
- **B — a anatomia do prompt existe para TODA conversa, não só para a
  esteira.** Estender `ParteDoPromptPipeline` às outras oito. **Prova:** a tela
  mostra, por conversa, o que é fixo, o que vem do trabalho e o que é editável
  — e é ela que torna a fatia C legível.
- **C — preâmbulo configurável por conversa** (Leitura A da §1). **Prova:** um
  preâmbulo salvo aparece no prompt montado, e as regras inegociáveis da §3
  continuam presentes — teste que falha se sumirem.
- **D — as regras inegociáveis viram DADO, não texto.** Hoje elas estão
  dissolvidas na string do prompt. Para a fatia C ser segura, elas precisam ser
  reinjetáveis. **Prova:** trocar o preâmbulo inteiro de
  `montarPedidoScriptDeMapeamento` e o "somente leitura" continuar lá.
- **E — agente externo como executor de conversa** (Leitura B da §1).
  **Depende de** a resposta à pergunta 1 da §6. **Prova:** uma conversa
  roteada para um destino do gateway produz o mesmo tipo de resultado que a
  conversa direta, marcada como vinda de fora.
- **F — o "✦ Sugerir" da esteira vale para as conversas também.** A aba já
  sabe propor um papel a partir de uma frase; propor um preâmbulo de conversa é
  o mesmo gesto.

---

## 6. Perguntas em aberto — o que muda o desenho

1. ~~**"Tenho um agente pronto" é um PROMPT ou um AGENTE EXTERNO?**~~
   ✅ **RESPONDIDO pelo usuário: é um PROMPT.** *"estava me referindo a um
   prompt."*

   Isso resolve a §1 inteira a favor da **Leitura A**, e as consequências são
   boas:

   - A **fatia E** (agente externo como executor de conversa) sai do caminho
     crítico. Ela continua sendo uma evolução defensável, mas deixa de ser
     pré-requisito de nada — e com ela sai a novidade arquitetural mais cara
     desta SPEC.
   - As fatias **C** (preâmbulo por conversa) e **D** (as regras inegociáveis
     viram dado) passam a ser o coração: a mecânica já existe na esteira, e o
     trabalho é estendê-la sem deixar cair o que a §3 mede.
   - A **pergunta 4** (agente externo escrevendo seção de julgamento) fica
     suspensa junto com a fatia E.

   **O que NÃO muda:** a §3 continua valendo inteira. Um prompt editável é
   exatamente o caminho por onde as regras de produto podem sumir em silêncio,
   e o texto morando no banco continua fora do alcance da varredura de fonte
   da SPEC-80 fatia D.
2. **O preâmbulo configurável acrescenta ou substitui?** (§3) Com as três
   saídas medidas e a recomendação dada, falta a decisão.
3. **A configuração de agente é por TIME ou global?** A config de papéis já é
   por time (`time-silvio` aparece no cabeçalho da aba). As conversas do
   assistente hoje não são de ninguém — passariam a ser do time, ou da
   organização?
4. **Um agente externo pode escrever seção de julgamento?** A trava da SPEC-80
   fatia D guarda os arquivos do repositório. Um agente de fora está fora do
   alcance da varredura — a régua vale por contrato, por marcação na resposta,
   ou não vale?

---

## 7. O que já está pronto e a implementação reaproveita

- `ConfigPipelineAgentes` / `sanearPapeis` / `normalizarPipelineAgentes` — a
  coerção que degrada campo a campo e nunca deixa a esteira vazia.
- `ANATOMIA_DO_PROMPT_PIPELINE` — a classificação `configuravel | da-quebra |
  fixo`, que a fatia B estende e a fatia D transforma em mecanismo.
- `PipelineAgentesTab` — ordem, ativo, contextos, preâmbulo e o "✦ Sugerir"
  já funcionam; a fatia A os reorganiza sem reescrever.
- `ALVOS_DA_CONVERSA_DE_CONFIG` — a conversa de configuração já sabe alterar
  `papel`. Estendê-la a "conversa" é acrescentar um valor à união, não uma
  migração (o mesmo achado que a SPEC-80 §0 fez para o template e a SPEC-114
  para as operações do gateway).
- `DestinoDoGateway` com `demonstracao` (SPEC-115 fatia D) — o precedente de
  um destino que se comporta diferente por configuração, e se anuncia.
