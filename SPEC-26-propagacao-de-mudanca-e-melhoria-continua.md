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

### Bloco 5 — Aprendizado: o "ir melhorando gradualmente"

Toda edição humana sobre uma sugestão é sinal. Capturar o par (sugerido → editado), por papel e por contexto, e usar de três formas:

- **(a) Few-shot dos próprios acertos**: os N exemplos mais recentes aprovados pelo time entram no prompt daquele papel naquele contexto. O modelo passa a escrever no padrão do time sem ninguém redigir prompt.
- **(b) Promover a regra**: quando a mesma correção se repete, oferecer *"virar regra"* → vira item de checklist em `regras.json`. **Este é o ganho composto**: a cada rodada, mais coisa migra de "o modelo talvez lembre" para "o motor garante" — o caminho contrário ao do prompt único, que acumula instruções defensivas.
- **(c) Métrica honesta**: taxa de aceite por papel/contexto, visível na config. É o termômetro de "está melhorando?" e o gatilho objetivo para calibrar prompt (SPEC-24 Fase F) ou trocar de modelo (SPEC-25).

## 5. Sequência recomendada

1. **Bloco 1** — procedência + obsolescência. Determinístico, barato, pré-requisito de tudo, com valor imediato mesmo sem modelo melhor.
2. **SPEC-25 Fase 0 + 2** (em paralelo/na sequência curta) — conectar ao wrapper corporativo destrava a QUALIDADE: propagar mudança com um modelo de 4B produziria ajustes ruins e sabotaria a confiança no recurso.
3. **Blocos 2 + 3** juntos — propagação e diff nascem casados; um sem o outro é perigoso ou inútil.
4. **Bloco 4a** — checagens determinísticas: barato e de alto valor, independe de tudo acima.
5. **Blocos 5 e 4b** — o flywheel, depois que houver volume de edições reais para aprender.

## 6. Fora de escopo, deliberado

- Versionamento/histórico completo das quebras (tipo git) — o rastro aqui é de **procedência**, não de versões.
- Merge automático de mudanças conflitantes (duas pessoas editando o mesmo campo).
- Fine-tuning — o aprendizado é few-shot + promoção a regra determinística.
- Propagar para fora da ferramenta (atualizar o board/Jira) — segue fora de escopo, como em toda a SPEC-24.

## 7. Verificação

Cada bloco contra o `gerador open` real, disciplina de sempre: **Bloco 1** = mudar um campo de um nó e conferir que exatamente os campos derivados dele (e só eles) marcam desatualizado; **Bloco 2** = propagar e conferir por requisição que só os itens impactados foram chamados, na ordem do grafo; **Bloco 3** = diff mostrando antes/depois, rejeitar preservando o valor antigo; **Bloco 4a** = provocar cada checagem com uma quebra propositalmente inconsistente; **Bloco 5** = editar, ver o exemplo aparecer no prompt seguinte e a correção recorrente virar regra.
