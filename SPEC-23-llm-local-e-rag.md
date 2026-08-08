# SPEC-23 — LLM local + RAG integrado à ferramenta

**Depende de/relacionado a:** SPEC-01 (`FieldSpec`, `ValorSpec`, proveniência), SPEC-04 (semáforo de prontidão), SPEC-17 (CLI local-first — princípio que este desenho segue), SPEC-20 (checklist de processo, `Condicao`), SPEC-21 (forms de conexão, `EdgePanel`), SPEC-22 (checklist técnico por status do nó).

**Status: Fase 0 (infra) e Fase 1 (fluxo 3 — checklist técnico/volumetria) implementadas. Fases 2-5 não iniciadas.**

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

## 6.2 Fase 0 — implementada

Pacote novo `packages/llm` (workspace, TS, dependência real `node-llama-cpp`) com quatro módulos:

- **`modelos.ts`** — registro único dos dois modelos (`MODELO_CHAT`/`MODELO_EMBEDDING`, repositório Hugging Face + nome de arquivo GGUF Q4_K_M/Q8_0), fonte de verdade pro download e pro status.
- **`cache.ts`** — resolve `~/.gerador/models` (`os.homedir()`, funciona nas 3 plataformas), fora do pacote npm de propósito (modelos são GB, não fazem sentido reinstalados a cada `npm install`). Aceita `baseDir` opcional só pra teste, mesmo padrão de `dirProjeto` já usado em `openApiLocal.ts`.
- **`download.ts`** — baixa pro cache com retomada simples via `.part` (só renomeia pro nome final quando termina por completo, pra `verificarStatus()` nunca enxergar um download pela metade como "instalado"). Integridade verificada por tamanho (`Content-Length` batendo com o que foi escrito), não por hash — decisão explícita pra não hardcodar um sha256 sem forma confiável de verificá-lo nesta rodada; registrado como evolução possível, não bloqueante.
- **`status.ts`** — `verificarStatus()` checa se os dois arquivos existem e não estão vazios, devolve `{chatInstalado, embeddingInstalado, pronto, caminhoModelos}`.
- **`motor.ts`** — wrapper fino sobre `node-llama-cpp` (`getLlama`, `loadModel`, `createContext`/`createEmbeddingContext`, `LlamaChatSession`, `llama.createGrammarForJsonSchema` pra saída GBNF-constrained). Sem cache/singleton escondido — quem chama decide se guarda o resultado entre chamadas. Sem teste automatizado (única forma real de testar é com o binário nativo + modelo GGUF de verdade — contradiria "nunca baixar modelo real em CI"); validado manualmente.

**Wiring:** `packages/cli` ganhou `gerador ia instalar`/`gerador ia status` (`commands/ia.ts`) e a rota `GET /ia/status` em `openApiLocal.ts`. `node-llama-cpp` entrou como dependência real (não dev) de `packages/cli`, e `@gerador/llm` foi adicionado ao `noExternal` do `tsup.config.ts` (mesmo motivo de `@gerador/engine`: workspace TS-fonte sem build próprio) — `node-llama-cpp` continua de fora do bundle de propósito, pra manter o binário nativo resolvível em `node_modules` de verdade.

**Achado real, decisão confirmada com o usuário antes de implementar:** `node-llama-cpp` baixa binários nativos pré-compilados no `npm install` — deixa a instalação mais pesada mesmo pra quem nunca usa IA. Confirmado explicitamente: `@gerador/llm` fica como dependência direta do `packages/cli` nesta primeira versão (mais simples de implementar/testar); um pacote separado com instalação sob demanda fica registrado como opção se o peso incomodar depois — não é decisão irreversível.

**Achado técnico:** `node-llama-cpp` exige Node ≥20 — `packages/cli` teve `engines.node` atualizado de `>=18` pra `>=20` (Node 18 já estava fora de suporte, bump razoável).

**Validação real:** `npm install` na raiz baixou e compilou `node-llama-cpp` de verdade (binário nativo `.node` confirmado em `node_modules/@node-llama-cpp/win-x64`), `npm run build --workspace=packages/cli` produziu um `dist/cli.js` que roda e resolve `node-llama-cpp` corretamente (`gerador ia status` funcionando contra o binário real).

`gerador ia instalar` de verdade encontrou dois problemas reais no caminho (nenhum deles previsível por teste com fake): a primeira tentativa foi interrompida no meio do download (terminal aberto interferindo), e a tentativa seguinte falhou com HTTP 404 no modelo de embedding — nome de arquivo errado em `modelos.ts` (`qwen3-embedding-0.6b-q8_0.gguf`, minúsculo, por analogia ao nome do modelo de chat). Consulta direta à API da Hugging Face revelou o nome real, com maiúsculas: `Qwen3-Embedding-0.6B-Q8_0.gguf`. Corrigido, documentado em comentário no código. Depois da correção, os dois modelos (~3,15GB) baixaram com sucesso e `gerador ia status` confirmou os dois instalados.

Validação foi além do status: `motor.ts` (único módulo sem teste automatizado, por depender do binário nativo + modelo real) foi exercitado ponta a ponta contra os modelos de verdade — completar texto livre, completar com JSON Schema obrigatório via GBNF (saída estruturada válida), e gerar embedding (vetor de 1024 dimensões) — os três funcionaram corretamente. Regressão completa: engine 122, llm 11, web 131, cli 35.

## 6.3 Fase 1 — detalhamento (fluxo 3: apoio na construção dos itens completos)

Escopo real investigado direto no código (não assumido): os placeholders marcados hoje NÃO são um campo genérico `campo -> valor` uniforme — são três formas heterogêneas, todas em `packages/engine/src/refinamento/gerarRefinamento.ts` e `especificacao/gerarEspecificacaoEntrega.ts`:

1. **Checklist técnico** (`gerarChecklistTecnico`, linha por `Requisito.texto`, uma por tech aplicável) — termina em `<- ✍️ especificar` (`MARCADOR_ESPECIFICAR`, linha 30). Sem id próprio no `Requisito`; a única identidade estável disponível é o próprio `texto` (curado à mão em `regras.json`, sem duplicata dentro do mesmo `porTech`).
2. **Volumetria** (`gerarVolumetria`) — 4 campos fixos e nomeados (`CAMPOS_VOLUMETRIA`: Response time/Max error/RPS/Test duration), um bloco por tech que declara `volumetria`.
3. **`historiaPo`/`definitionOfReady`/`definitionOfDone`** (`gerarEspecificacaoEntrega.ts`) — esqueletos de **documento inteiro** (não por atividade), preenchidos por texto livre.

**Achado importante, corrige a investigação original do SPEC-23:** essas três formas nunca passam por `calcularProntidao()` — são texto markdown, fora do sistema de prontidão do `No.spec`. Reusar `ValorSpec{valor, origem, confirmado}` aqui é reuso de **forma** e da disciplina "nada sugerido conta até confirmado", não reuso do semáforo em si (não existe hoje um semáforo pra esses itens, e esta fase não cria um).

**Decisão de escopo desta fase:** cobrir só (1) e (2) — checklist técnico e volumetria, ambos por-atividade, ambos já convergem no mesmo `renderizarItemEspecificacao`. `historiaPo`/DoR/DoD (documento inteiro) ficam fora — não têm hoje nenhum widget na UI da revisão (`ReviewScreen.tsx` só expande o texto de `renderizarItemEspecificacao`; o resto do documento só existe no `.md` baixado), então dar suporte a eles exigiria desenhar uma seção de UI nova que não existe — escopo maior, registrado como extensão natural de Fase 1 (usar exatamente o mesmo mecanismo abaixo, chave nova no nível do documento em vez de por-atividade), não como parte desta rodada.

### Modelo de dados (engine)

```ts
// model/types.ts — Quebra ganha um campo novo, opcional
export interface Quebra {
  // ...campos existentes...
  /** Respostas (humanas ou sugeridas por IA) aos placeholders "<- ✍️ especificar"
   * do refinamento técnico/volumetria (Fase 1, SPEC-23). Sobrevive a uma nova
   * derivação porque mora na quebra, chaveada por Atividade.chave (estável) +
   * a chave do próprio placeholder — nunca pelo índice/posição. */
  respostasItens?: Record<string, Record<string, ValorSpec>>;
}
```

Chave do placeholder (segundo nível do map): `${tech}::${requisito.texto}` pro checklist técnico, `${tech}::volumetria::${campo}` pra volumetria — namespaced por tech de propósito (evita colisão entre techs na mesma atividade, mesmo padrão de blocos já usado na renderização).

### Engine: nova função de enumeração + assinaturas estendidas

```ts
// refinamento/gerarRefinamento.ts
export interface PlaceholderRefinamento {
  chave: string;
  tech: string;
  secao: "checklistTecnico" | "volumetria";
  rotulo: string; // texto do requisito, ou nome do campo de volumetria — o que mostrar na UI e mandar pro LLM
}

export function listarPlaceholders(
  regras: RegrasConfig, techs: string[], contextos: string[], nos: No[], arestas: Aresta[]
): PlaceholderRefinamento[];
```

Reusa a MESMA filtragem (`contextoBate`/`condicaoBate`) já usada dentro de `gerarChecklistTecnico`/`gerarVolumetria` — sem duplicar a lógica de "esse item se aplica a essa atividade", só extraída pra uma função compartilhada.

`gerarChecklistTecnico`/`gerarVolumetria` ganham um 6º/4º parâmetro opcional `respostas?: Record<string, ValorSpec>` (mapa já escopado pra UMA atividade, isto é, `quebra.respostasItens?.[atividade.chave]`). Regra de interpolação: só entra na linha renderizada se `resp.origem === "manual" || resp.confirmado === true` — sugestão não confirmada não aparece no documento, só no painel interativo (mesma disciplina "nunca verde sem alguém olhar" já usada em `calcularProntidao`, aplicada aqui por convenção, não pelo mesmo código). O marcador `<- ✍️ especificar` **nunca** é removido, respondida ou não — contrato do agente validador (Confluence) é imutável:

```
- DLQ configurada e monitorada <- ✍️ especificar                          (sem resposta confirmada)
- DLQ configurada e monitorada: sim, via política X no tópico Y <- ✍️ especificar   (respondida)
```

`renderizarItemEspecificacao` ganha um parâmetro opcional a mais (`respostas?: Record<string, ValorSpec>`) repassado pra `gerarChecklistTecnico`/`gerarVolumetria`. `gerarEspecificacaoEntrega`'s `OpcoesGerarEspecificacao` ganha `respostasItens?: Record<string, Record<string, ValorSpec>>` (chave = `atividade.chave`), repassado por-atividade na hora de chamar `renderizarItemEspecificacao` dentro do loop de itens.

### CLI (`packages/cli/src/commands/openApiLocal.ts`)

**Correção de bug real encontrada durante a investigação, não relacionada a IA:** `comoQuebraSalva()` (usada tanto por `GET /quebras/:id` quanto pela listagem) só devolve `{id, titulo, time, diagrama, criadoEm, atualizadoEm}` — **qualquer campo novo em `Quebra`, incluindo `respostasItens`, seria persistido no arquivo mas nunca devolvido por `GET /quebras/:id`**, então o cliente web nunca veria a resposta salva ao recarregar a quebra. Corrigir isso é pré-requisito, não opcional: `comoQuebraSalva` passa a incluir `respostasItens: quebra?.respostasItens ?? {}`.

**Nova rota `POST /ia/sugerir`:**
- Request: `{ tech: string, rotulo: string, contextoNo: string }` (`contextoNo` = descrição compacta da spec do(s) nó(s) de origem da atividade, já disponível via `descreverEspecificacaoNo` — dá ao modelo o contexto mínimo pra sugerir algo específico, não genérico).
- Response: `{ valor: string }`, gerado via `completarComSchema` de `packages/llm` com schema GBNF fixo `{type:"object", properties:{valor:{type:"string"}}, required:["valor"]}`.
- Prompt fixo no handler (não configurável nesta fase): instrui o modelo a responder curto, em português, específico ao `rotulo`+`contextoNo` recebidos.
- **Decisão de wiring:** o handler mantém um `MotorChat` carregado **uma vez por processo** (módulo-level, lazy — carrega no primeiro `POST /ia/sugerir`, não no boot do `gerador open`), não um por requisição — carregar o GGUF a cada chamada custaria segundos por sugestão. Sem cache de resposta entre chamadas diferentes (`motor.ts` já não tem cache escondido, por design de Fase 0; o processo local é o único "cache" — reiniciar `gerador open` descarrega o modelo).
- Se `verificarStatus().pronto` for `false`, responde `503 { erro: "modelos de IA não instalados — rode `gerador ia instalar`" }` antes de tentar carregar.

### Web (`packages/web`)

- `api/client.ts`: `QuebraSalva`/`Quebra`-shape ganham `respostasItens` (repassa o tipo do engine, sem duplicar). Novo `apiIa.sugerir({tech, rotulo, contextoNo}): Promise<{valor: string}>`.
- `state/useQuebra.ts`: novo updater `responderItem(atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec)` seguindo o mesmo padrão de spread já usado pelos outros updaters do hook (linha ~96-179 hoje).
- `review/ReviewScreen.tsx`: dentro do bloco `{expandido && ...}` (linha 255-259 hoje), abaixo do `<pre>` existente, novo painel listando `listarPlaceholders(...)` filtrado aos que AINDA não têm resposta confirmada pra aquela atividade — cada linha com: rótulo, campo de texto (edição manual), botão "✨ Sugerir" (chama `apiIa.sugerir`, preenche o campo com `origem: "sugerido", confirmado: false`), botão "Confirmar" (seta `confirmado: true`, o texto passa a aparecer no `<pre>` acima na próxima renderização — sem re-fetch, é o mesmo `renderizarItemEspecificacao` sendo chamado de novo com o `respostasItens` atualizado). Mesmo padrão visual de destaque "sugerido, não confirmado" já usado alhures na revisão de spec (cor de aviso), sem inventar um novo.

### Critério de pronto (§6.1)

- Automatizado: `listarPlaceholders` (casos de filtragem tech/contexto/`when`, espelhando os testes existentes de `gerarChecklistTecnico`/`gerarVolumetria`); `gerarChecklistTecnico`/`gerarVolumetria`/`renderizarItemEspecificacao`/`gerarEspecificacaoEntrega` com `respostas` (não confirmada não aparece; `origem: "manual"` aparece; `origem: "sugerido", confirmado: true` aparece; marcador nunca some); `comoQuebraSalva` devolve `respostasItens`; rota `/ia/sugerir` com `@gerador/llm` mockado (padrão de `ia.test.ts`) cobrindo 503 sem modelo instalado e o formato de request/response; painel novo em `ReviewScreen` com `apiIa.sugerir` mockado.
- Manual, com o modelo real (mesma disciplina de `motor.ts` na Fase 0, nunca só mock): rodar `gerador open`, abrir uma quebra com pelo menos um requisito de checklist técnico aplicável, clicar "✨ Sugerir", conferir que a resposta volta em poucos segundos e faz sentido pro contexto do nó, confirmar, conferir que o texto aparece no documento final (`<pre>` e no `.md` baixado) mantendo o marcador.

## 6.4 Fase 1 — implementada

Seguiu exatamente o desenho da §6.3, sem desvio: `listarPlaceholders()` novo em `gerarRefinamento.ts` (reusa a mesma filtragem tech/contexto/`when` de `gerarChecklistTecnico`/`gerarVolumetria`, extraída pra função compartilhada); as duas funções ganharam parâmetro `respostas?: Record<string, ValorSpec>` e interpolam a resposta na linha (marcador `<- ✍️ especificar` nunca removido); `renderizarItemEspecificacao`/`gerarEspecificacaoEntrega` repassam `respostasItens` por atividade; `Quebra.respostasItens?: Record<atividadeChave, Record<chavePlaceholder, ValorSpec>>` novo no model.

**Achado real, fora do escopo de IA, encontrado investigando a persistência:** `comoQuebraSalva()` em `openApiLocal.ts` só devolvia `{id, titulo, time, diagrama, criadoEm, atualizadoEm}` pro `GET /quebras/:id` — qualquer campo novo em `Quebra` seria persistido no arquivo mas nunca devolvido de volta ao recarregar. Corrigido antes de implementar `respostasItens`, senão a resposta salva sumiria ao reabrir a quebra. Validado com `curl` real (POST com `respostasItens` → arquivo em disco → GET devolve o mesmo objeto de volta).

Rota `POST /ia/sugerir`: schema fixo `{valor: string}` via GBNF, motor de chat carregado como singleton por processo (lazy, primeiro request), 503 se `verificarStatus().pronto` for falso. Web: `apiIa.sugerir`, `useQuebra.responderItem`, e um painel novo em `ReviewScreen` (dentro do item expandido) listando placeholders sem resposta confirmada, com "✨ Sugerir" + confirmação manual — sugestão não confirmada nunca entra no documento final, só no painel (mesma disciplina "nada sugerido conta até confirmado").

**Validação real, não só testes:** com `gerador open` rodando de verdade contra os modelos já instalados (Fase 0), `POST /ia/sugerir` com um requisito real (`"DLQ configurada e monitorada"`, tech Backend, contexto de uma fila Rabbit) devolveu uma sugestão coerente e específica em português, via GBNF/JSON Schema, em poucos segundos. Regressão completa: engine 132, llm 11, web 135, cli 37.

### Achado real pós-publicação: instalação global sem `--allow-scripts` + rejeição não tratada derrubava o processo

Usuário instalou `v0.1.23` de verdade (`npm install -g gerador-de-itens`, sem flag) e recebeu um aviso do Windows ("Parte deste aplicativo foi bloqueado") ao carregar `ggml-cpu-icelake.dll`. Causa raiz, confirmada passo a passo:

1. `npm` (versões recentes) pula por padrão o postinstall de pacotes não aprovados — o próprio `npm install -g` avisou: `node-llama-cpp@3.19.1 (postinstall: node ./dist/cli.js postinstall)` não coberto por `allowScripts`. Sem esse postinstall rodar, `node-llama-cpp` não passa pelo processo próprio dele de instalação/verificação do binário nativo pra plataforma — daí o Windows Defender não reconhecer o `.dll` resultante como confiável.
2. **Bug real encontrado ao verificar a afirmação "o resto do app continua funcionando" antes de documentá-la**: `tratarIaSugerir` (`openApiLocal.ts`) não tinha `try/catch`, e `open.ts` chama `tratarApiLocal` dentro de uma IIFE assíncrona (`void (async () => {...})()`) sem `.catch()` nenhum. Se `carregarModeloChat`/`completarComSchema` lançasse (exatamente o caso de um binário nativo bloqueado), a rejeição virava **rejeição de promise não tratada**, que em versões recentes do Node.js **derruba o processo inteiro** — não só a requisição de `/ia/sugerir`, o `gerador open` inteiro caía.

**Correção:** `tratarIaSugerir` ganhou `try/catch`, devolvendo `500 { erro }` tratado em vez de propagar; o singleton do motor (`motorChatSingleton`) é descartado na falha, permitindo tentar carregar de novo na chamada seguinte sem reiniciar o servidor (ex.: usuário desbloqueia o binário e tenta de novo, sem precisar fechar/reabrir `gerador open`). README raiz e `packages/cli/README.md` atualizados com o comando correto (`npm install -g gerador-de-itens --allow-scripts=node-llama-cpp`) e uma nota de solução de problemas explicando o aviso do Windows e que só a chamada de verdade ao modelo fica indisponível sem a flag — o resto do app (`init`/`derive`/`implementar`/`open`/`import-graphify`, incluindo `ia instalar`/`status`, que só baixam/checam arquivo) não depende do binário nativo carregar com sucesso.

## 6.5 Correção pós-feedback: Fase 1 redesenhada (fluxo 3 era outra coisa)

Depois de testar a Fase 1 de verdade (v0.1.24, com o crash já corrigido), o usuário deu retorno claro: o desenho que implementei — botões "✨ Sugerir" pequenos, um por placeholder de checklist técnico — **não é o fluxo que ele pediu**. O fluxo real, já praticado hoje FORA da ferramenta (colar a especificação de solução gerada num chat de IA externo pra ele estruturar Histórias/Tasks), precisa acontecer DENTRO da ferramenta, sobre a **quebra inteira**, com feedback visual rico (tipo conversar com um agente: streaming, cores, sensação de "está trabalhando") — não campo a campo. Achados adicionais da rodada de teste real:

- **Bug real de corrupção de encoding**: caracteres acentuados (`ã`, `ç`) ocasionalmente saem como `�` (U+FFFD) na saída do modelo sob GBNF. Isolado com dado real: não é bug de HTTP/Node (testes diretos contra `motor.ts`, mesmo prompt, 3/3 tentativas saíram limpas) — é um artefato raro e não-determinístico da amostragem restrita por gramática GBNF do llama.cpp/node-llama-cpp com caracteres multi-byte UTF-8, mais provável em gerações mais longas. Mitigação real e barata a aplicar: detectar `�` na resposta e tentar de novo automaticamente (limite de tentativas) antes de devolver — não dá pra "consertar" a causa raiz (é upstream), mas dá pra nunca deixar o usuário ver o artefato.
- **Falta lugar pro contexto da demanda**: hoje `Quebra.demandInfo` é um textarea simples só de texto, sem anexos, e não é usado como insumo pro modelo — só entra na seção "Contexto" do documento final. O usuário precisa de um lugar pra colar/anexar material do épico (texto + anexos) **antes** de gerar, que alimente a geração de verdade.
- **Pesquisa de padrões de UX generativa (2026)** confirma a direção: streaming token-a-token é o padrão esperado (não all-or-nothing), regra de ouro "chat pra tarefa aberta, formulário pra dado com forma clara" — estruturar histórias/tasks a partir de uma especificação é claramente tarefa aberta, merece tela dedicada em estilo geração/chat, não widgets pequenos espalhados.

**Referência de design fornecida pelo usuário**: `gerador-itens-prototipo-v2.html` (protótipo HTML funcional, sem IA real — animação simulada) define a experiência-alvo em detalhe. Elementos centrais, todos a preservar no desenho real:

1. **Barra de fase** no topo: texto narrando o passo atual ("Lendo o canvas" → "Reconhecendo os N nós" → "Mapeando dependências" → "Escrevendo história 3 de 8 · nome-do-nó" → "Aplicando regras de Tech · contexto"), caret piscando, barra de progresso, contadores vivos (rascunho/revisar/refinado), controles de velocidade/pausa/gerar-de-novo.
2. **Diagrama animado em sincronia**: nós "acendem" ao serem reconhecidos, arestas desenham, um "cometa" percorre a conexão do item sendo escrito no momento — reusa o mesmo `gerarDiagramaHtml`/diagrama animado já existente (SPEC-21) como base visual, não um componente novo do zero.
3. **Itens "pousando"** numa lista (rail) conforme são escritos — animação de entrada, chips (nó/tamanho/tech/status) e barra de preenchimento de requisitos.
4. **Ficha estruturada por abas** (Especificação / Contrato / Refinamento / Testes) — hoje é um markdown único (`renderizarItemEspecificacao`); precisa virar dado estruturado editável por clique em qualquer campo, com o markdown final continuando a existir como *view* derivada dele (nunca duas fontes de verdade — `implementar`/export continuam funcionando a partir do mesmo dado).
5. **Requisito de refinamento vazio** vira um CTA claro (`"＋ Preencher — ou peça pro agente"`) — meus botões "✨ Sugerir" absorvem essa forma, dentro da ficha rica, não soltos num painel genérico.
6. **Funil único de proposta**: toda sugestão de IA (venha do botão "Sugerir" por item ou de um chat livre "Peça uma alteração ao agente") passa pelo mesmo caminho — proposta com diff, aprovar/descartar, confirmação explícita antes de aplicar. Generaliza a regra já implementada ("nada sugerido conta até confirmado") pra qualquer tipo de mudança, não só checklist técnico/volumetria.
7. **Contexto do épico (decisão confirmada com o usuário)**: uma tela/passo **antes** do botão "Gerar" — cola texto longo + anexa arquivos, salvo junto com a quebra, usado como insumo real do prompt em toda a geração que segue.

**Escopo revisado da Fase 1** (substitui o roteiro anterior; o que já está em produção — `respostasItens`, `listarPlaceholders`, `/ia/sugerir`, painel na `ReviewScreen` — continua funcionando e é absorvido pela ficha rica, não descartado nem refeito do zero):

- **1a — Dado estruturado por atividade no engine (implementada)**: hoje só existia a string markdown (`renderizarItemEspecificacao`). Escopo real entregue, mais preciso que a intenção inicial: `estruturarEspecificacaoNo()` (campos escalares/lista de `No.spec` como dado bruto, não texto pré-formatado) + `montarFichaItem()` (agrega os nós de origem estruturados com o checklist técnico/volumetria via `listarPlaceholders` + respostas já anexadas). `checklistProcessoMarkdown`/`ciclosTesteMarkdown`/`criteriosAceiteMarkdown` ficam markdown puro de propósito — são gerados por regra, não por resposta humana/IA, estruturá-los agora seria especulativo sem consumidor. `renderizarItemEspecificacao` foi refatorado pra usar `estruturarEspecificacaoNo` internamente (formatador de markdown separado do dado), mantendo o texto **byte-idêntico** ao anterior — validado pelos 22 testes de markdown existentes, todos verdes sem alteração. Regressão: engine 138 (+6), llm 11, web 135, cli 37.
- **1d-i — Reestilizar a `ReviewScreen` seguindo o protótipo (implementada)**: layout trocado — tema escuro, lista de itens à esquerda (com dot de status), ficha à direita com abas (Especificação/Contrato/Refinamento/Testes), contadores de status (rascunho/revisar/refinado) no cabeçalho quando há `regras`. Diagrama continua atrás do botão de alternar (decisão mantida: `gerarDiagramaHtml` gera página própria completa, embutir só o SVG cortaria o chrome). Sem animação de geração fake e sem chat livre (1e), como planejado. Ficha consome `montarFichaItem()` (Fase 1a) — Especificação/Contrato somente leitura, Refinamento interativo (mesmo `/ia/sugerir`/`responderItem`, visual novo: card com check verde quando confirmado), Testes só leitura. Status por item derivado na própria UI (sem persistência nova): `refinado` = zero placeholders pendentes (ou nenhum aplicável), `revisar` = tem alguma resposta (mesmo sugerida não confirmada) mas ainda falta algo, `rascunho` = nenhuma resposta ainda.

  **Validação real com Playwright** (não só testes automatizados): `gerador open` de verdade, carregado um cenário pronto, "Derivar Quebra" real, selecionado um item, navegado pelas 4 abas — Contrato mostrou a tabela de campos do nó com proveniência correta, Refinamento mostrou o card de requisito pendente. Clicado "✨ Sugerir" de verdade contra o modelo local: resposta coerente em ~40s, "Confirmar" aplicado, dot do item mudou pra verde e o contador foi de "4 rascunho" pra "3 rascunho · 1 refinado" — o funil completo (sugerir → confirmar → refletir no status) funcionando de ponta a ponta com o modelo real, não mockado.

  **Achado real, fora do escopo direto**: o texto de onboarding (`Jornada.tsx`, passo "Especificação de solução") ainda dizia "expanda cada item pra ver a spec técnica completa" — desatualizado pela mudança de interação (agora é "selecionar", não "expandir"). Corrigido junto.

  Testes: 20 (era 15) — reescritos pro novo modelo de interação (selecionar item → abas), cobrindo as 4 abas, contadores de status, e o funil sugerir/confirmar já existente. Regressão completa: engine 138, llm 11, web 140 (+5), cli 37.
- **1b — Contexto do épico (detalhamento abaixo)**.
- **1c — Streaming real (detalhamento abaixo)**.
- **1d — Geração ao vivo: orquestração real sobre 1c (detalhamento abaixo)**.
- **1e — Funil unificado de proposta**: "Sugerir" + chat livre convergindo pro mesmo componente de proposta/diff/aprovar/confirmar, generalizando o mecanismo já existente.

Ordem confirmada com o usuário: **1d-i primeiro** (tela visível, sem esperar streaming/contexto do épico), depois 1b (contexto do épico plugado na tela pronta), depois 1c/1e.

Cada sub-fase segue a regra já estabelecida (§6.1): sem código antes de deixar claro o que muda, testável e validável com dado real.

### Correção pós-1d-i: a animação de verdade depende de 1c existir, não é cosmética a adiantar

Usuário testou `v0.1.26` e reportou: "está MUITO diferente do protótipo... parece que não rodou IA ainda". Esclarecido em seguida: o que falta são as animações — o protótipo descreve como deve ser o **processo de geração ao vivo pela IA**, não só o layout estático. Isso bate com a leitura original (1d-i explicitamente não incluiu a barra de fase/diagrama sincronizado/itens "pousando", por decisão registrada acima).

Perguntado como fechar essa lacuna o mais rápido possível sem simular um processo que não existe, três opções foram postas: (a) orquestrar em lote as chamadas reais de `/ia/sugerir` já existentes, animando por cima; (b) só enriquecer visualmente o botão "Sugerir" individual; (c) esperar 1c (streaming token-a-token) existir antes de construir qualquer animação de geração. **Escolhida: (c)** — a animação de verdade fica condicionada a 1c. Confirmada em seguida a ordem: **1b continua o próximo passo** (não adiantar 1c), como já estava combinado.

### 1b — Contexto do épico (detalhamento antes de codar, §6.1)

**Achado real ao investigar antes de desenhar** (mesma disciplina de sempre — verificar o código, não assumir): `Quebra.demandInfo` já existe no modelo (`packages/engine/src/model/types.ts:87`, comentário "a descrição longa do contexto") — é exatamente o campo de texto que faltava, não precisa duplicar. Mas hoje é **campo morto**: inicializado como string vazia em `factory.ts:5`, nunca tem UI de edição em lugar nenhum do app, e só é *lido* (nunca escrito) em `ReviewScreen.tsx:27/184` pra seção "Contexto" do documento final exportado. Mais grave: `comoQuebraSalva()` (`packages/cli/src/commands/openApiLocal.ts:105`) nem devolve esse campo no `GET /quebras/:id` — mesma classe de bug já achada e corrigida pra `respostasItens` na Fase 1 (persiste no arquivo via `POST`/`PUT`, mas some silenciosamente ao recarregar a quebra, porque o `GET` usa uma lista fixa de campos).

**Dado**:
- `Quebra.demandInfo?: string` — já existe, reusado como o texto do contexto do épico, sem mudança de forma.
- `Quebra.anexosContexto?: { nome: string; conteudo: string }[]` — novo. Só anexos de texto (`.txt`/`.md`/`.json`), lidos via `FileReader.readAsText` (mesmo padrão já usado em `ImportarGraphify.tsx`). Sem parsing de PDF/binário nesta rodada — sem lib disponível, sem consumidor real hoje, seria especulativo.

**Mudanças**:
- `packages/engine/src/model/types.ts`: `Quebra` ganha `anexosContexto?: { nome: string; conteudo: string }[]`.
- `packages/cli/src/commands/openApiLocal.ts:105` (`comoQuebraSalva`): incluir `demandInfo` e `anexosContexto` no objeto devolvido pelo `GET` — corrigir o bug de round-trip antes de qualquer UI depender dele.
- `packages/web/src/App.tsx` (~linha 571, junto do botão "Derivar Quebra"): novo botão "📎 Contexto do épico" abrindo um painel. Decisão de escopo: não é uma tela cheia dedicada nem bloqueia "Derivar Quebra" — entra como passo opcional no header, reusando a decisão já confirmada ("antes de Gerar") sem inventar navegação nova pra uma tela que ainda não tem geração de verdade por trás (essa é 1c/1e).
- Novo componente `packages/web/src/review/ContextoEpicoPanel.tsx`: textarea pro texto (`demandInfo`), lista de anexos (nome + remover), `<input type="file" multiple accept=".txt,.md,.json">` + `FileReader.readAsText`. Salva direto via `setQuebra` (mesmo padrão já usado pro campo `titulo` em `App.tsx:470` — sem função nova no `useQuebra`).
- `packages/web/src/review/ReviewScreen.tsx`: `contextoDoPlaceholder()` (linha 82) ganha um parâmetro `contextoEpico` opcional, concatenado antes do contexto do nó no texto mandado pro `/ia/sugerir` real — o contexto da demanda passa a alimentar a sugestão de hoje, não só o documento final.
- `packages/web/src/api/client.ts`: `PedidoSugestaoIa` ganha `contextoEpico?: string`.
- `packages/cli/src/commands/openApiLocal.ts` (`tratarIaSugerir`, linha 433): prompt passa a incluir o contexto do épico quando presente.

**Fora de escopo, deliberado**: anexos binários/PDF; tela cheia dedicada (protótipo mostra isso, mas sem geração real por trás ainda seria só decoração); geração em lote/streaming usando esse contexto (1c/1e, próximos passos).

**Feito quando**: contexto do épico e anexos sobrevivem a salvar+recarregar a quebra (fix do bug de round-trip, validado com dado real via `curl`/UI, não só teste); o texto colado + conteúdo dos anexos aparece de fato no prompt enviado ao `/ia/sugerir` real; regressão completa verde.

**(implementada)**. Escopo entregue exatamente como detalhado acima, sem desvio. **Validação real, não só testes**: com `gerador open` de verdade, abri o painel "📎 Contexto do épico", colei texto e anexei um arquivo `.md` real (via `input[type=file]` + `FileReader`), salvei, fechei e reabri o painel — texto e anexo sobreviveram no estado da UI. Salvei a quebra de verdade (`POST /quebras`) e chamei `GET /quebras/:id` contra o servidor real: `demandInfo` e `anexosContexto` vieram de volta intactos, confirmando o fix do bug de round-trip (mesma classe do achado de `respostasItens` na Fase 1) contra o servidor de verdade, não só a suíte de testes. A inclusão do contexto no prompt real de `/ia/sugerir` ficou coberta por teste de integração HTTP (server real + modelo mockado, mesma disciplina já usada pro resto de `/ia/*`) em vez de round-trip com o modelo de verdade nesta rodada — o mecanismo de chamada real ao modelo (`completarComSchema` via GBNF) já tinha sido validado ponta a ponta na Fase 1 e de novo na 1d-i; testar de novo aqui só provaria o mesmo call site, não o campo novo. Testes: cli +2 (round-trip de `demandInfo`/`anexosContexto`, prompt inclui/omite o contexto do épico), web +5 (`ContextoEpicoPanel` × 4, wiring do `contextoEpico` no `ReviewScreen` × 1). Regressão completa: engine 138, llm 11, web 145 (+5), cli 39 (+2).

### 1c — Streaming real (detalhamento antes de codar, §6.1)

**Decisão de simplificação, achada investigando antes de desenhar**: o schema de `/ia/sugerir` (`SCHEMA_SUGESTAO`, `openApiLocal.ts:416`) é `{valor: string}` — um único campo texto. GBNF/JSON Schema faz sentido pra estrutura com múltiplos campos/tipos (evita "parsear na sorte"), mas pra um campo único a "estrutura" é decorativa — `valor` já É a resposta inteira. Streamar token a token um JSON sendo montado mostraria pontuação aparecendo primeiro (`{`, `"`, `v`, `a`, `l`, `o`, `r`, `"`, `:`, `"`...) antes do texto de verdade começar — pior visualmente que não ter streaming nenhum. Decisão: a rota passa a usar `completar()` (texto livre, já suporta `onTexto` em `motor.ts:15/39-40`, nunca usado até agora) em vez de `completarComSchema()` — o texto streamado é a resposta pura, sem wrapper JSON. Registrado como limite explícito: essa simplificação só vale enquanto o schema de sugestão for um único campo string; se um fluxo futuro precisar de streaming de múltiplos campos estruturados ao mesmo tempo, o problema volta e precisa de solução própria (não resolvido aqui).

**Mudanças**:
- `packages/llm/src/motor.ts`: nenhuma mudança — `completar()` já é suficiente.
- `packages/cli/src/commands/openApiLocal.ts` (`tratarIaSugerir`, hoje linha 437): troca `completarComSchema(prompt, SCHEMA_SUGESTAO)` por `completar(prompt, {onTexto: pedaco => res.write(pedaco)})`. Resposta deixa de ser JSON `{valor}` — vira `text/plain; charset=utf-8`, escrita em pedaços conforme o modelo gera (o `http` do Node faz chunked transfer sozinho ao chamar `res.write()` várias vezes sem `Content-Length`). Erros antes de `res.writeHead` (modelo não instalado, falha ao carregar) continuam devolvendo status HTTP normal (503/500), como hoje — só depois que o streaming começa é que não dá mais pra trocar o status code; falha nessa janela (rara — mesma raridade do achado do corrompimento `�` na Fase 1) termina a resposta sem sufixo de erro formatado; o cliente trata stream incompleto como falha, com a mesma mensagem genérica de erro de hoje.
- Prompt (já inclui `contextoEpico` desde a Fase 1b) não muda — só a forma como a resposta chega.
- `packages/web/src/api/client.ts`: `apiIa.sugerir` para de usar o helper `requisitar()` (que assume corpo JSON — usado por todas as outras rotas do arquivo, não mexer nele) — passa a ter implementação própria com `fetch()` direto + `response.body.getReader()`, decodificando pedaços via `TextDecoder` e entregando via um callback `onPedaco` opcional enquanto acumula o texto completo; resolve com `{valor: string}` no final (mesma forma de retorno de hoje, quem não passar `onPedaco` continua funcionando igual).
- `packages/web/src/review/ReviewScreen.tsx` (`AbaRefinamento`, função `sugerir`): passa o callback novo, atualizando `rascunhos[p.chave]` a cada pedaço — o texto aparece sendo digitado no campo em tempo real, não pulando pronto no fim. `onResponder` (sugerido, não confirmado) continua disparando só ao final, como hoje.

**Achado real esperado, a confirmar ao implementar**: os testes de `/ia/sugerir` já existentes em `openApiLocal.test.ts` fazem `await fetch(...).then(r => r.json())` — quebram contra uma resposta `text/plain`, precisam virar `r.text()`. O mock do motor precisa trocar de `completarComSchemaMock` pra um `completarMock` que aceita `onTexto` e chama o callback com pedaços simulados, senão os testes de streaming não testam nada de verdade.

**Fora de escopo, deliberado**: retry automático em `�` (limitação conhecida desde a Fase 1, streaming não piora nem resolve — decidir "tentar de novo" só é possível depois que a geração termina, igual no buffer completo); chat livre (1e).

**Feito quando**: clicar "✨ Sugerir" mostra o texto sendo escrito progressivamente no campo (não "Gerando..." seguido de pop-in do texto inteiro), validado com Playwright contra o modelo real; suíte cli/web atualizada pro novo contrato (`text/plain` em vez de JSON); regressão completa verde.

**(implementada)**. Escopo entregue como detalhado — o achado real esperado (testes precisando trocar `.json()` por `.text()`, mock trocando de `completarComSchemaMock` pra `completarMock`) se confirmou exatamente como previsto. Achado adicional durante o teste do streaming: pedaços escritos via `res.write()` em sequência apertada (sem yield entre eles) podem coalescer num único read do lado do cliente em `localhost` sem latência real — o teste que prova streaming de verdade precisou de um pequeno delay artificial entre pedaços simulados pra provar múltiplos reads (achado de mecânica de teste, não do código de produção, que já lida bem com qualquer chunking real). Testes: cli +1 (prova de múltiplos pedaços chegando via `ReadableStream`, não um corpo de uma vez), web +1 (`ReviewScreen` — texto intermediário aparece no campo antes do final, via promise controlada manualmente). Regressão completa: engine 138, llm 11, web 146 (+1), cli 40 (+1).

### 1d — Geração ao vivo: orquestração real sobre 1c (detalhamento antes de codar, §6.1)

Usuário compartilhou um recorte do protótipo mostrando o estado-alvo em detalhe: barra de fase ("Escrevendo história 5 de 8 · decisao-score-credito"), diagrama compacto sempre visível no topo (não atrás de alternância) com nós numerados e arestas rotuladas, faixa de legenda por tipo de nó, lista de itens à esquerda com chips (tamanho/tech/status) e barra de progresso de requisitos, ficha à direita com abas — e pediu fidelidade visual+comportamental próxima disso, prosseguindo com a implementação. Isso substitui a suposição anterior (1d-i) de que a versão estática bastaria antes de 1c existir — ficou claro que o "parece que não rodou IA" persistia porque faltava a orquestração real em cima do streaming, não só o streaming isolado.

**Diferença deliberada do protótipo, pra não fabricar processo que não existe**: no protótipo (mock, sem IA real), os itens "pousam" um a um porque a animação inteira é fake. Aqui os itens (`Atividade[]`) já são 100% conhecidos e reais assim que `derivar()` roda — síncrono, determinístico, sem IA. O que é real e vale animar é o preenchimento dos requisitos de refinamento via IA. Decisão: todos os itens aparecem na lista imediatamente após "Derivar Quebra" (porque já existem de verdade), e a orquestração real percorre os placeholders pendentes de cada um, chamando o `/ia/sugerir` (streaming, 1c) de verdade, um de cada vez — a barra de fase, o destaque no diagrama e o "seguindo a geração" acompanham esse progresso real, não um roteiro fabricado.

**Dado/estado novo** (só em memória, no `ReviewScreen`, nada persistido de novo):
- Fila de trabalho: `{ atividadeChave, chavePlaceholder }[]`, construída percorrendo `resultado.atividades` em ordem e, pra cada uma, seus placeholders pendentes (via `montarFichaItem`/`listarPlaceholders`, já existentes).
- Estado da orquestração: índice atual na fila, texto parcial (pedaços do streaming), rodando/pausado, item atualmente selecionado (auto-segue a fila, a menos que o usuário clique manualmente em outro item — quebra o auto-follow, mesmo padrão de "seguir automaticamente até o usuário interagir" já visto noutros lugares do app).

**Mudanças**:
- Novo hook `packages/web/src/review/useGeracaoAoVivo.ts`: recebe `fichas`/`atividades`/`onResponderItem`, monta a fila, expõe `{ rodando, pausado, atual, progresso: {feito, total}, textoParcial, pausar(), continuar(), reiniciar() }`. Chama `apiIa.sugerir` (já streaming, 1c) em sequência — nunca em paralelo (um modelo local, uma sessão, chamadas concorrentes disputariam o mesmo contexto). "Reiniciar/Gerar de novo" reconstrói a fila do zero e roda de novo, inclusive placeholders já respondidos (regenera tudo, não só o que falta — combina com o rótulo "Gerar de novo").
- Auto-start: dispara sozinho quando a `ReviewScreen` monta, se houver pelo menos um placeholder pendente E o `/ia/status` disser que o modelo está pronto (`verificarStatus` já existente) — sem modelo instalado, cai no comportamento de hoje (nada dispara sozinho, botões "✨ Sugerir" manuais continuam funcionando like sempre).
- `packages/web/src/review/ReviewScreen.tsx`: cabeçalho ganha a barra de fase (texto do passo atual, barra de progresso, os contadores que já existem, botão Pausar/Continuar, botão "🔄 Gerar de novo"). O item da fila em andamento fica auto-selecionado (badge "Seguindo a geração" — clicar em outro item na lista quebra o auto-follow, mesmo padrão do resto do app). `AbaRefinamento` passa a mostrar o `textoParcial` da orquestração pro placeholder ativo, em vez de/além do fluxo manual de clique em "✨ Sugerir" (que continua existindo pros placeholders que o usuário quer responder fora de ordem, ou depois que a orquestração termina).
- Novo componente `packages/web/src/review/DiagramaCompacto.tsx`: SVG simplificado, só leitura (sem zoom/pan/clique-pra-filtrar — isso já existe na versão completa, mantida atrás do botão "🔍 Ver diagrama completo", renomeado do antigo "Ver diagrama animado"), nós posicionados por `No.x/y` como hoje, aresta como linha reta rotulada. Recebe `noAtivoId` e desenha esse nó destacado (a mesma disciplina de fidelidade real: o destaque segue o item de verdade sendo processado, não uma sequência decorativa). Embutido sempre visível no topo da lista+ficha (não mais atrás de alternância) — decisão que substitui a de 1d-i (lá o motivo de manter atrás do botão era não ter processo real pra sincronizar; agora existe).

**Fora de escopo, deliberado**: faixa de legenda clicável por tipo de nó pra filtrar itens (nice-to-have visual do protótipo, sem valor central pro "sensação de que está gerando de verdade" — fica pra uma rodada de polish futura, não bloqueia esta); controle de velocidade "1x/2x" (no protótipo controla a velocidade de uma animação fake; aqui cada passo é uma chamada de rede real com latência real — fingir "2x mais rápido" numa chamada real seria voltar a fabricar comportamento, exatamente o que este projeto evita; fica só Pausar/Continuar/Gerar de novo, que são controles reais); caixa de texto livre "Peça uma alteração ao agente" no rodapé (isso é o funil unificado de proposta, 1e — implementar um campo real sem o mecanismo de diff/aprovar por trás seria widget solto, mesma disciplina já aplicada ao não construir UI sem consumidor real).

**Feito quando**: depois de "Derivar Quebra" com o modelo instalado, a tela mostra a orquestração real rodando sozinha — barra de fase avançando, diagrama compacto destacando o nó certo, itens preenchendo o refinamento um a um, contadores subindo de rascunho pra revisar/refinado — validado com Playwright contra o modelo real (não mock), capturando pelo menos dois momentos da sequência pra confirmar progresso de verdade (não só o estado final); Pausar interrompe antes da próxima chamada de rede (não corta uma chamada em andamento); regressão completa verde.

**(implementada)**. Escopo entregue como detalhado, sem desvio. **Validação real, não só testes**: com `gerador open` de verdade e o modelo já instalado, carreguei o cenário "Fila Rabbit" e cliquei "Derivar Quebra" — a orquestração disparou sozinha (18 requisitos pendentes na fila), a barra de fase mostrou "Escrevendo requisito 1 de 18 · 01", o diagrama compacto destacou `srv-checkout` (o nó de origem do item em andamento) com anel azul, o item 01 ficou auto-selecionado com o badge "● Seguindo a geração", e a aba Refinamento mostrou o card do requisito com "✨ gerando…" — 3 capturas em sequência (logo após derivar, alguns segundos depois, e depois de mais tempo) confirmaram o texto crescendo de "..." pra uma resposta técnica completa e coerente em português (recomendação real sobre pontos de log, decisão/erro/correlação, dados sensíveis) — prova de streaming real, não um estado fixo. Não esperei a fila inteira terminar (18 itens reais levariam vários minutos) — a validação já provou o mecanismo ponta a ponta com dado real, esperar o resto só repetiria o mesmo caminho de código 17 vezes. Testes: web +14 (`useGeracaoAoVivo` × 6, incluindo não-paralelismo e cancelamento por token; `DiagramaCompacto` × 3; `ReviewScreen` — geração ao vivo × 5). Regressão completa: engine 138, llm 11, web 160, cli 40.

## 7. Verificação

Fase 0 e Fase 1 (infra + fluxo 3 v1): testes automatizados com fake determinístico do modelo/HTTP (nunca modelo real em CI) + validação manual contra o modelo de verdade, seguindo a disciplina já estabelecida no projeto — nenhuma exceção. Fase 1 segue em redesenho (§6.5, sub-fases 1a-1e) e as fases 2-5 seguem a mesma regra (§6.1) quando começarem: detalhamento nesta spec antes de qualquer código.
