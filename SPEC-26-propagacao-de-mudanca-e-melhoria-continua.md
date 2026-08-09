# SPEC-26 — Propagação de mudança, revisão assistida e melhoria contínua

## 1. Objetivo

Achado real do usuário, e o mais importante registrado até aqui: *"o problema é que eu preciso fazer ajustes e eles se tornam caros — mudou especificação na história X, aí preciso atualizar tudo manualmente depois"*. E a declaração do propósito do projeto: *"conseguir alterar as especificações no desenho e usar a IA para ajustar nos outros itens, ajudar a revisar, não esquecer coisas, fazer o processo ir melhorando gradualmente"*.

Esta spec desenha o SEGUNDO passe do refinamento — o que acontece depois que algo muda.

## 2. Diagnóstico

A ferramenta hoje é forte no **primeiro passe** (diagrama → itens derivados → esteira preenche campo a campo) e fraca no **segundo** (mudou uma decisão, e agora?). O custo real do refinamento na vida do time não está em escrever a primeira versão — está em **manter o conjunto coerente depois de cada mudança**, item por item, na mão, contando com a memória de quem mexeu.

É precisamente aqui que uma ferramenta que conhece o GRAFO da solução tem vantagem estrutural sobre um prompt único: ela sabe o que depende do quê. "O que ficou obsoleto quando X mudou?" deixa de ser lembrança e vira computação.

## 3. Base já existente (nada disso precisa ser inventado)

- **`derivar()`** determinístico: diagrama → atividades, com `chave` estável entre gerações.
- **`resolverDependencias()`**: o grafo de dependências ENTRE atividades, derivado das arestas do diagrama. **É o mecanismo central da propagação** — existe e é testado desde o MVP.
- **`respostasItens`** indexado pela chave estável: as respostas sobrevivem a uma nova derivação.
- **`origem`/`confirmado`** no `ValorSpec` + `calcularProntidao()`: a disciplina "nada sugerido conta até ser confirmado" já é infraestrutura.
- **Encadeamento intra-item + "↻ Re-rodar papéis seguintes"** (SPEC-24, rodada do encadeamento): propagar DENTRO de um item já funciona. Falta a propagação ENTRE itens — que é a cara do problema do usuário.

## 4. Blocos propostos

### Bloco 1 — Procedência de insumos e detecção de obsolescência (determinístico, sem IA)

Cada resposta gravada passa a carregar `baseadoEm`: um resumo (hash curto) dos insumos que a produziram — spec dos nós de origem, contexto do épico e as respostas encadeadas dos papéis anteriores. A qualquer momento o app recalcula o hash atual dos insumos; **divergiu = o campo está desatualizado**, com o "por quê" navegável (*"o campo `timeout` do nó `srv-fidelidade` mudou de 300ms para 150ms depois que esta resposta foi escrita"*).

Por que este bloco vem primeiro: é barato, é **determinístico** (não depende de qualidade de modelo) e sozinho resolve metade da dor — você para de precisar LEMBRAR o que ficou para trás. Sem ele, propagar é chutar o escopo.

UI: badge âmbar no campo e no item, contador "N campos desatualizados" no header da revisão, filtro "só desatualizados" na lista.

### Bloco 2 — Onda de impacto (a propagação de verdade)

Mudou o item X (ou o nó que o origina): o conjunto impactado sai do grafo que já existe — itens que dependem de X, mais os que compartilham o contrato/nó alterado. Botão **"Propagar mudança"**: roda a esteira **apenas nos campos desatualizados dos itens impactados**, com um bloco novo no prompt — *"o que mudou: de A para B. Ajuste apenas o que decorre disso; preserve o resto"*. A ordem de execução segue o grafo (produtor antes de consumidor), reaproveitando o encadeamento da SPEC-24.

É a generalização natural do "↻ Re-rodar papéis seguintes": de intra-item para inter-item.

### Bloco 3 — Revisão em diff (nunca sobrescrever em silêncio)

Toda propagação produz **propostas**, não escritas. Painel de diff campo a campo (antes/depois + motivo), aceitar/rejeitar individualmente ou em lote. Conteúdo confirmado só muda com aprovação explícita — a mesma disciplina de "nada sugerido conta até confirmado", agora aplicada a mudanças. Sem isso, propagação vira risco em vez de alívio.

### Bloco 4 — Revisor (o "não esquecer coisas"), em duas camadas nesta ordem

**(a) Checagens determinísticas no engine** — sempre confiáveis, sem modelo: item sem regra de teste aplicável; contrato divergente entre produtor e consumidor do mesmo fluxo; dependência apontando para item removido; campo obrigatório do tipo de nó em branco; volumetria sem valores; **item tamanho 8 não quebrado** (regra que existe no template atual do usuário e hoje depende do modelo obedecer).

**(b) Revisor por IA** — só para o que é semântico e não dá para computar: critérios de aceite que não cobrem um erro declarado no contrato; história que contradiz o épico; cenário Gherkin que não testa o critério que diz testar.

Saída: lista de achados clicáveis, cada um levando ao campo. O revisor **não escreve nada sozinho** — aponta.

### Bloco 5 — Chat de refinamento com ferramentas (a interface do segundo passe)

Achado real do usuário, que define a INTERFACE de tudo acima: *"hoje quando isso acontece eu vou tentando trabalhar no Jira direto com o Rovo, mas ainda dá muito trabalho; por isso, tendo todo material salvo, poderia alterar — mesmo que da mesma forma, conversando com um chat de IA com algum agente (melhor do que aqueles botões de sugerir que colocamos) + approve"*.

Por que a conversa vence os botões e vence o Jira:

- **Contra os botões "✨ Sugerir"**: o botão é *campo a campo* e exige que o usuário já saiba ONDE clicar. A conversa é no nível da INTENÇÃO — *"o timeout do fidelidade caiu pra 150ms, ajusta o que decorre disso"* — e quem descobre os campos é a ferramenta. Os botões continuam existindo (funcionam para um retoque pontual, sem gastar conversa), mas deixam de ser o caminho principal.
- **Contra conversar no Jira/Rovo**: lá o material é prosa espalhada em tickets — a IA relê tudo e **infere** o impacto a cada pedido. Aqui o material está estruturado (campos, chaves estáveis, procedência) e o impacto é **computado** no grafo (Bloco 2). A mesma conversa custa muito menos e erra muito menos.

**Desenho — o agente não escreve, o agente propõe.** Painel de chat na tela de revisão, com um conjunto fechado de ferramentas (tool use) sobre o material salvo:

| Ferramenta | O que faz |
|---|---|
| `listarItens(filtro?)` | inventário dos itens derivados (com status e campos desatualizados) |
| `lerItem(chave)` | ficha completa de um item |
| `listarImpactados(chave \| noId)` | quem depende — **computado no grafo**, não inferido (Bloco 2) |
| `proporAlteracao(chave, campo, valor, motivo)` | registra uma PROPOSTA (nunca escreve) |
| `proporQuebraDeItem(chave, partes[])` | item tamanho 8 → múltiplos itens (regra que hoje o modelo tinha que lembrar) |
| `rodarChecagens()` | achados determinísticas do revisor (Bloco 4a) |

Toda proposta cai no **mesmo painel de diff do Bloco 3** — aceitar/rejeitar, individual ou em lote. O `approve` do usuário é literalmente o mecanismo que já existe (`origem: "sugerido"` → `confirmado: true`): nada entra na quebra sem passar por lá.

**Pré-requisito honesto, em dois degraus** (revisto depois do achado da SPEC-25 §8.1 — o token do wrapper ainda não existe, então nada pode ficar refém dele):

- **5a — comando guiado (funciona em modelo pequeno)**: o usuário escreve a intenção em linguagem natural, mas quem **computa o impacto é o app** (`listarImpactados` no grafo, determinístico) e o modelo só **redige** o ajuste de cada campo — exatamente o que ele já faz bem hoje na esteira. Sem tool use livre, sem cadeia longa: uma chamada por campo, com o diff da mudança no prompt. É o chat "com trilhos".
- **5b — conversa livre com ferramentas (exige provedor forte)**: o agente escolhe e encadeia as ferramentas sozinho. Com o Qwen3-4B isso seria frustrante (modelos pequenos erram a escolha e os argumentos em cadeias longas). Espera a **SPEC-25 Fase 2** — wrapper corporativo ou Claude —, sem bloquear nada antes disso.

Relação com o histórico: este é o "Fluxo 1 — canvas em conversa" da SPEC-23, que foi desenhado e adiado por ser o mais arriscado. Ele volta agora **com o alvo trocado** — conversa sobre os ITENS já derivados (material estruturado, impacto computável), não sobre o desenho do canvas. É a versão de menor risco e maior valor imediato da mesma ideia; o canvas em conversa continua adiado.

### Bloco 6 — Aprendizado: o "ir melhorando gradualmente"

Toda edição humana sobre uma sugestão é sinal. Capturar o par (sugerido → editado), por papel e por contexto, e usar de três formas:

- **(a) Few-shot dos próprios acertos**: os N exemplos mais recentes aprovados pelo time entram no prompt daquele papel naquele contexto. O modelo passa a escrever no padrão do time sem ninguém redigir prompt.
- **(b) Promover a regra**: quando a mesma correção se repete, oferecer *"virar regra"* → vira item de checklist em `regras.json`. **Este é o ganho composto**: a cada rodada, mais coisa migra de "o modelo talvez lembre" para "o motor garante" — o caminho contrário ao do prompt único, que acumula instruções defensivas.
- **(c) Métrica honesta**: taxa de aceite por papel/contexto, visível na config. É o termômetro de "está melhorando?" e o gatilho objetivo para calibrar prompt (SPEC-24 Fase F) ou trocar de modelo (SPEC-25).

## 5. Sequência recomendada

Revista depois do achado da SPEC-25 §8.1 (*"já tenho o endpoint da empresa, mas ainda não tenho o token; embarcar um modelo é a forma de validar a ferramenta no dia a dia"*). Regra que passa a valer: **nada que dependa do token entra no caminho crítico** — e o que é determinístico vem antes, porque entrega valor com qualquer modelo.

1. **SPEC-25 Fase 0 + Anthropic** — abstração `ProvedorIa` (refactor puro) e conexão ao Claude na máquina pessoal. Primeiro por um motivo prático (SPEC-25 §8.2): é o que transforma um ciclo de validação de ~12 minutos em segundos. Tudo abaixo fica mais barato de construir depois disso. Não depende do token corporativo.
2. **Bloco 1** — procedência + obsolescência. Determinístico, barato, pré-requisito dos blocos 2/3 e com valor imediato: a tela passa a avisar o que ficou para trás mesmo sem IA nenhuma.
3. **Bloco 4a** — checagens determinísticas do engine. Independem de tudo, custam pouco, atacam direto o "não esquecer coisas".
4. **Blocos 2 + 3** — propagação e diff, casados. Desenhados no Claude, **validados também no embarcado** antes de fechar (princípio de §8.2: degradar até o piso, não otimizar para ele). O diff é justamente o que torna aceitável o modelo errar.
5. **SPEC-25 Fase 1 (DeepSeek local)** — sobe o piso do ambiente da empresa, medido contra a saída do Claude no mesmo cenário como referência.
6. **Bloco 5a** — chat com trilhos (impacto computado pelo app, modelo só redige). É o modo que roda na empresa.
7. **SPEC-25 Fase 2/wrapper** quando o token sair → destrava **5b** (conversa livre com ferramentas) sem mudar nada da arquitetura.
8. **Blocos 6 e 4b** — o flywheel, quando houver volume de edições reais para aprender.

## 6. Fora de escopo, deliberado

- Versionamento/histórico completo das quebras (tipo git) — o rastro aqui é de **procedência**, não de versões.
- Merge automático de mudanças conflitantes (duas pessoas editando o mesmo campo).
- Fine-tuning — o aprendizado é few-shot + promoção a regra determinística.
- Propagar para fora da ferramenta (atualizar o board/Jira) — segue fora de escopo, como em toda a SPEC-24.

## 7. Verificação

Cada bloco contra o `gerador open` real, disciplina de sempre: **Bloco 1** = mudar um campo de um nó e conferir que exatamente os campos derivados dele (e só eles) marcam desatualizado; **Bloco 2** = propagar e conferir por requisição que só os itens impactados foram chamados, na ordem do grafo; **Bloco 3** = diff mostrando antes/depois, rejeitar preservando o valor antigo; **Bloco 4a** = provocar cada checagem com uma quebra propositalmente inconsistente; **Bloco 5** = pedir em linguagem natural uma mudança com impacto cruzado ("o timeout caiu pra 150ms") e conferir, pelas requisições, que o agente chamou `listarImpactados` e propôs alteração só nos itens certos, sem escrever nada antes do approve; **Bloco 6** = editar, ver o exemplo aparecer no prompt seguinte e a correção recorrente virar regra.
