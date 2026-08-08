# SPEC-23 — LLM local + RAG integrado à ferramenta

**Depende de/relacionado a:** SPEC-01 (`FieldSpec`, `ValorSpec`, proveniência), SPEC-04 (semáforo de prontidão), SPEC-17 (CLI local-first — princípio que este desenho segue), SPEC-20 (checklist de processo, `Condicao`), SPEC-21 (forms de conexão, `EdgePanel`), SPEC-22 (checklist técnico por status do nó).

**Status: arquitetura registrada, implementação não iniciada.**

---

## 1. Objetivo

Reduzir a fricção cognitiva e aumentar a produtividade nos fluxos principais da ferramenta usando um LLM local + RAG, sem depender de serviço externo, chave de API paga, nem infraestrutura hospedada — mantendo a filosofia "local-first, um `npm install -g` e funciona" já estabelecida em SPEC-17. Cinco fluxos-alvo, pedidos explicitamente pelo usuário:

1. Apoio no desenho do canvas em conversa.
2. Apoio a ajustes e configurações.
3. Apoio na construção dos itens completos (histórias e tasks).
4. Corrigir e alterar esse material após mudanças em requisitos ou especificações.
5. Apoio à configuração dos checklists de processo — nichados por contexto, hoje sem UI nenhuma — mediante inserção de material de retrospectivas (RAG).

## 2. Contexto

A ferramenta já resolve a parte determinística do problema (diagrama → itens de trabalho → especificação), mas boa parte do valor de cada item final ainda depende de texto humano: o marcador `<- ✍️ especificar` no checklist técnico, os placeholders de história/DoR/DoD, os campos de configuração criados um a um à mão, e o `config/regras.json` — que nichado por tech+contexto é exatamente o tipo de conteúdo que se acumula em retrospectivas de time e nunca chega a virar checklist reusável, porque não existe hoje nenhuma tela para isso.

Modelo sugerido pelo usuário: **Qwen3-4B + llama** — confirmado com o usuário que "llama" se refere ao motor **llama.cpp** (via `node-llama-cpp`), não a um modelo da família Llama como alternativa. Confirmado também que esta rodada entrega **só a arquitetura**, sem código — a implementação é faseada e começa quando uma fase específica for pedida.

## 3. Investigação (o que já existe e pode ser reusado)

### 3.1 UI web — estado atual de cada fluxo

- **Fluxo 1 (canvas em conversa):** não existe hoje nenhuma interação por texto com o canvas. Toda mutação do diagrama passa por funções puras e síncronas em `packages/web/src/state/useQuebra.ts` — `adicionarNo(tipo, x, y)`, `tentarConectar(source, target, ...)` (já resolve o tipo de aresta via `edgeRules` e rejeita conexões inválidas com motivo), `definirValorSpec`/`definirValorSpecAresta`, `alternarStatus`, etc. É exatamente a API que um copiloto conversacional chamaria por trás de um chat — não precisa de nenhum mecanismo de mutação novo.
- **Fluxo 2 (ajustes e configurações):** `ConfigScreen.tsx` tem 5 abas (`perfis`, `campos`, `camposAresta`, `membros`, `especificacao`), todas seguindo o mesmo padrão: formulário → API local (`packages/cli/src/commands/openApiLocal.ts`) → arquivo JSON em `config/`.
- **Fluxo 3 (itens completos):** `renderizarItemEspecificacao()` (`packages/engine/src/especificacao/gerarEspecificacaoEntrega.ts`) já separa o que é determinístico (specs dos nós, checklist filtrado por tech/contexto) do que espera preenchimento humano — o marcador `MARCADOR_ESPECIFICAR` (`<- ✍️ especificar`, `packages/engine/src/refinamento/gerarRefinamento.ts:30`) aparece ao final de todo item de checklist técnico e de cada campo de volumetria; `historiaPo`/`definitionOfReady`/`definitionOfDone` são placeholders fixos sem marcador, mas semanticamente equivalentes.
- **Fluxo 4 (corrigir após mudança):** **não existe nenhum diff/versionamento hoje.** `derivar()` e `gerarEspecificacaoEntrega()` são funções puras — sempre recomputam do zero a partir do diagrama atual, sem olhar pra nenhuma geração anterior. `no.spec`/`no.specNA` sobrevivem a uma nova derivação porque moram no próprio nó (não em algo derivado) — mas texto digitado nos marcadores/`historiaPo`/DoR/DoD **não é persistido em lugar nenhum**: é regenerado como markdown puro a cada chamada de `gerarEspecificacaoEntrega()`. Esse é o buraco real a fechar antes do fluxo 4 fazer sentido — não é só "chamar o LLM de novo", é ter onde guardar a resposta.
- **Fluxo 5 (checklist de processo):** confirmado sem UI nenhuma. `config/regras.json` não tem rota em `openApiLocal.ts` (o roteador trata `/auth/*`, `/quebras*`, `/perfis-time*`, `/campos-no*`, `/campos-aresta*`, `/especificacao-template` — nada de `/regras`) — é só arquivo editado à mão.
- **Lição da skill removida:** a skill do Claude Code foi removida numa rodada anterior (`JOURNEY.md §41`) porque virou uma ferramenta paralela desconectada do pipeline real — o usuário queria itens publicados de verdade num sistema de tracking, e uma skill isolada não servia a esse destino. Lição aplicada aqui: a integração de LLM tem que escrever nos dados que alimentam `derivar()`/`gerarEspecificacaoEntrega()`, nunca um canal solto que não sobrevive ao pipeline determinístico existente.

### 3.2 Engine — achado central: a infraestrutura de "sugestão não-humana" já existe

- **`Origem` (`packages/engine/src/model/types.ts:8`) já inclui `"sugerido"`**: `type Origem = "manual" | "extraido" | "inferido" | "sugerido"`. Não é preciso inventar nada novo no modelo de dados.
- **`calcularProntidao()` (`packages/engine/src/readiness/prontidao.ts`) já trata `"sugerido"` sem `confirmado: true` como não-resolvido** — comentário explícito no código, referenciando uma regra de negócio já registrada (§4.3): *"nada sugerido conta até ser confirmado nó a nó"*. Um campo obrigatório com valor `origem: "sugerido"` e `confirmado` ausente/`false` empurra o semáforo pra vermelho, exatamente como um campo vazio empurraria — e a UI de confirmar/descartar em `PropertiesPanel.tsx` já existe e já funciona pra `"inferido"`.
- **Conclusão prática:** os fluxos 1, 2 e 3 não precisam de nenhum mecanismo de aprovação novo. Um valor sugerido pelo LLM é gravado como `ValorSpec` com `origem: "sugerido"` — e toda a UI de "isso ainda não é verde até alguém confirmar" já está construída, testada e em produção. Esta é a peça de reuso mais importante de todo o desenho.
- `Condicao` (union completo de 10 operadores — `field/equals`, `field/notEquals`, `field/preenchido`, `hasIncomingEdge`, `hasOutgoingEdge`, `nodeStatus`, `nodeType`, `listaContem`, `allOf`, `anyOf`, `not`; `packages/engine/src/config/types.ts:14-25`) e `RegrasPorTech` (`checklistTecnico`, `checklistProcesso`, `testes`, `volumetria`) têm forma exata mapeada — é o schema-alvo do fluxo 5.
- Zero dependência de LLM/embeddings/vetor em qualquer `package.json` do monorepo hoje (`engine`, `cli`, `web`, `server`) — greenfield completo, sem conflito a resolver.
- `openApiLocal.ts` é um roteador `node:http` cru, sem streaming — todo handler lê o corpo inteiro e responde de uma vez. Para chat (fluxo 1), com respostas de alguns segundos num modelo 4B em CPU, vale a pena um handler dedicado com streaming (chunked), diferente do padrão das rotas atuais.

### 3.3 Modelo e runtime — pesquisa externa

- **Qwen3-4B**: 32K de contexto, disponível em GGUF (Q4_K_M ~2,5GB), roda via llama.cpp/`node-llama-cpp`. Supera Llama 3.2 3B em instruction-following (IFEval) — confirma que a escolha do usuário é adequada pro caso de uso (seguir instrução + gerar saída estruturada).
- **`node-llama-cpp`**: binding TS nativo pra llama.cpp, roda **embutido no mesmo processo Node** de `gerador open` — sem instalar aplicativo separado (ao contrário de Ollama, que exige um serviço rodando à parte). Encaixe direto com "um `npm install -g` e funciona". Suporta **saída estruturada via GBNF/JSON Schema** (`llama.createGrammarForJsonSchema(...)`) — mecanismo genérico do llama.cpp, funciona com qualquer modelo, incluindo Qwen3. Isso resolve a fragilidade conhecida de modelos pequenos gerando JSON solto sem decodificação restrita.
- **Qwen3-Embedding-0.6B**: modelo de embeddings da mesma família, multilíngue (cobre português), ~1,5GB, roda no mesmo runtime — evita uma segunda stack de embeddings.
- **Vector store**: dado o corpus esperado (retrospectivas + config de um time — não milhões de documentos), busca por similaridade em memória/arquivo plano (cosine brute-force sobre embeddings salvos em JSON) é suficiente pra v1. Nenhuma lib de vetor dedicada (hnswlib-node, LanceDB, sqlite-vec) é necessária de cara — fica registrada como upgrade futuro se o corpus crescer muito, não como dependência do dia um.

## 4. Arquitetura proposta

### 4.1 Princípio central

Tudo roda local, embutido no mesmo processo de `gerador open` — sem serviço externo, sem servidor separado. Todo valor sugerido pelo LLM entra no modelo de dados existente como `ValorSpec` com `origem: "sugerido"`, reusando 100% do semáforo de prontidão e da UI de confirmar/descartar já existentes — sem inventar um mecanismo de aprovação novo.

### 4.2 Novo pacote `packages/llm`

TS, mas com I/O (diferente do `packages/engine`, que é zero I/O por princípio — aqui é aceitável, é a camada de infraestrutura de IA):

- **Gestão de modelo**: download sob demanda (não bundlado no pacote npm — ~3GB é grande demais) pra `~/.gerador/models/`, com verificação de integridade. Comando novo `gerador ia instalar` (baixa Qwen3-4B-GGUF + Qwen3-Embedding-0.6B-GGUF) e `gerador ia status` (reporta se já está instalado; avisa se não detectar GPU — CPU-only funciona, mas é mais lento).
- **Wrapper de chat** sobre `node-llama-cpp`: completar texto livre (fluxo 1) e completar com **schema JSON obrigatório** via GBNF (fluxos 2/3/5 — saída sempre no formato `CampoNo`, `ValorSpec`, `{texto, contextos, when}`, etc.).
- **Wrapper de embeddings** sobre o mesmo runtime (Qwen3-Embedding-0.6B).
- **Índice de retrospectivas**: ingestão (chunking por parágrafo/heading) + embedding + busca por similaridade em arquivo plano — sem lib de vetor nova nesta v1.
- Tudo atrás de uma interface testável com um **fake determinístico**, pra não depender do modelo real nos testes de CI — só a validação manual final usa o modelo de verdade.

### 4.3 Rotas novas em `openApiLocal.ts`

Seguindo o padrão já existente (`tratarX()` + registro em `tratarApiLocal()`), com uma exceção — a rota de chat precisa de handler com streaming (chunked), diferente do padrão buffer-completo das rotas atuais:

| Rota | Fluxo | Forma |
|---|---|---|
| `GET /ia/status` | infra | modelo instalado? pronto? |
| `POST /ia/chat` | 1 | streaming |
| `POST /ia/sugerir` | 2, 3 | schema-constrained (GBNF) |
| `POST /ia/retrospectivas` | 5 | ingestão de documento |
| `POST /ia/checklist-sugerir` | 5 | RAG — recupera trechos + gera `{texto, contextos, when}` citando a fonte |

### 4.4 Fechando o buraco do fluxo 4

`Quebra` ganha um campo novo opcional `respostasItens?: Record<atividadeChave, Record<campo, ValorSpec>>`, persistido junto com o resto da quebra (`quebras/<id>.json`, já existente). `gerarEspecificacaoEntrega()` ganha um parâmetro opcional pra splicar essas respostas no lugar do marcador, em vez de deixá-lo em branco. Como `Atividade.chave` já é documentada como estável entre gerações, isso resolve a maior parte do fluxo 4 de graça — a resposta sobrevive a uma nova derivação, contanto que a atividade não tenha sido removida. Uma função pura nova `diffAtividades(antigas, novas)` (comparação por `chave`) sinaliza o que mudou (item removido, ou tech/contexto diferente da atividade) pra oferecer revisão assistida por LLM só onde faz sentido, em vez de re-perguntar tudo do zero.

### 4.5 Fluxo por fluxo — resumo do que cada um usa

1. **Canvas em conversa**: chat panel novo → `/ia/chat` com tool-calling restrito a um schema fixo de "ferramentas" espelhando `useQuebra.ts` (`adicionarNo`, `tentarConectar`, `definirValorSpec`...) → aplica via as MESMAS funções que um clique humano usaria, com confirmação antes de aplicar no diagrama.
2. **Config assistida**: botão "Sugerir" nas abas de `ConfigScreen` → `/ia/sugerir` com schema `CampoNo`/`CampoAresta` → pré-preenche o formulário já existente (`FormularioCampoNo`/`FormularioCampoAresta`); usuário revisa/salva normalmente, sem caminho de escrita novo.
3. **Itens completos**: botão "✨ Sugerir" em cada marcador da `ReviewScreen` → `/ia/sugerir` com schema `ValorSpec` → grava em `respostasItens` com `origem: "sugerido"` → semáforo/confirmação reusam a infra existente sem mudança.
4. **Corrigir após mudança**: `diffAtividades()` + revisão assistida reusando o mesmo mecanismo do fluxo 3, só nos itens que de fato mudaram.
5. **Checklist de processo (RAG)**: nova aba em `ConfigScreen` dando UI de verdade pra `config/regras.json` pela primeira vez, com ingestão de retrospectivas + `/ia/checklist-sugerir` propondo `{texto, contextos, when}` citando o trecho de origem — nunca uma sugestão sem rastro de onde veio.

## 5. Fora de escopo, deliberado

- **Fine-tuning do modelo** — só prompt engineering + RAG.
- **Suporte a GPU específico** — `node-llama-cpp` já detecta automaticamente, sem trabalho nosso.
- **Modo hospedado/multi-usuário** — só local, um modelo por máquina, mesma filosofia do `gerador open`.
- **Ollama como runtime alternativo** — registrado como possível otimização futura (detectar se já está rodando e reusar), não faz parte desta arquitetura inicial. Adicionaria "duas formas de rodar o mesmo LLM" sem necessidade clara agora.
- **Lib de vetor dedicada** (hnswlib-node, LanceDB, sqlite-vec) — só se o corpus de retrospectivas crescer muito além do razoável pra busca em memória.

## 6. Roteiro faseado

Registrado aqui como plano — **nenhuma fase foi implementada nesta rodada**.

1. **Fase 0 — infra**: `packages/llm`, `gerador ia instalar`/`gerador ia status`, rota `/ia/status`. Sem UI ainda.
2. **Fase 1 — fluxo 3** (menor superfície nova, maior valor imediato): `respostasItens` no engine + botão "Sugerir" na `ReviewScreen`. Valida a infra ponta a ponta com o caso de uso mais simples.
3. **Fase 2 — fluxo 5**: RAG de verdade (ingestão + busca por similaridade) + UI nova pra `config/regras.json`, fechando a lacuna "invisível" identificada em rodadas anteriores.
4. **Fase 3 — fluxo 2**: reusa a mesma infra estruturada da Fase 1; extensão pequena.
5. **Fase 4 — fluxo 1**: o mais novo e arriscado (chat, tool-calling, streaming) — por último, com a infra já validada nas fases anteriores.
6. **Fase 5 — fluxo 4**: `diffAtividades()` + revisão assistida — depende da Fase 1 (`respostasItens`) já existir.

### 6.1 Regra de processo pra cada fase: especificar antes de implementar

Pedido explícito do usuário: ir gradualmente, especificando cada fluxo antes de implementar agentes/interfaces — mesma disciplina já usada na rodada do diagrama animado (protótipo/desenho validado antes de código real, SPEC-21 §3.1). Aplicado aqui: **o resumo de um parágrafo por fluxo na §4.5 não é suficiente pra começar a codar uma fase.** Antes de implementar qualquer fase do roteiro acima, a fase ganha sua própria seção de detalhe (neste documento ou numa spec-filha) cobrindo, no mínimo: forma exata dos dados de entrada/saída do LLM pra aquele fluxo (schema JSON completo, não só o nome do tipo), os pontos exatos da UI que mudam (arquivo:linha, não só o nome do componente), e o critério de "pronto" (que teste automatizado + que validação manual prova que funciona). Só depois disso o código começa — a mesma ordem que evitou retrabalho na rodada do diagrama animado.

## 7. Verificação

Esta rodada não gera código, então não há teste automatizado a rodar. Verificação = revisão deste documento pelo usuário, confirmando se o roteiro faseado bate com a expectativa antes da Fase 0 começar. Quando a implementação começar (qualquer fase), a disciplina já estabelecida no projeto se aplica sem exceção: testes automatizados com fake determinístico do modelo (nunca baixar o modelo real em CI) + validação manual com o modelo de verdade contra um cenário real antes de considerar a fase pronta.
