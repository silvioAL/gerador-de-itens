# SPEC-25 — Seleção de modelo e provedores de IA (local embarcado + conexão a provedores externos)

> **Desfecho da Fase 1 (leia §4.3 antes do resto)**: o plano era embarcar um segundo modelo local (DeepSeek R1-distill 8B) para ganhar raciocínio. Ao medir na máquina real, descobriu-se que o **Qwen3-4B já era raciocinador** — quem suprimia o `<think>` era o nosso próprio código. Com o raciocínio ligado ele ficou 5x mais rápido que o DeepSeek e suficiente pela barra do usuário, que decidiu ficar **só com o Qwen3-4B**. A abstração de provedores continua de pé — ela existe para o wrapper corporativo/Claude (Fase 2), não para a pluralidade de locais. Onde esta spec fala em "escolher entre os 2 modelos locais", leia como histórico do raciocínio.

## 1. Objetivo

Hoje a esteira de agentes roda sobre UM modelo fixo (Qwen3-4B local, via node-llama-cpp). Pedido do usuário (achado real, na sequência da discussão sobre profundidade das respostas): *"se necessário podemos usar o DeepSeek como modelo, mesmo demorando mais... poder escolher entre os 2 modelos (o que existe e o DeepSeek) ou conectar (ao Claude, por exemplo)"*. Esta spec desenha a seleção de modelo/provedor: dois modelos locais alternáveis + conexão a provedores externos (Anthropic primeiro), por configuração — incluindo, no futuro, modelo diferente POR PAPEL da esteira (sinergia direta com a Fase F da SPEC-24).

Design-only nesta rodada — implementação faseada (§7), cada fase com verificação própria, mesma disciplina da SPEC-23/24.

## 2. Contexto e motivação

- **Qualidade**: o Qwen3-4B responde raso por padrão (achado: "histórias com 2-3 linhas, muito distante da necessidade real"). Prompts mais prescritivos e o encadeamento entre papéis (SPEC-24, rodada do encadeamento) melhoram o piso, mas há um teto de capacidade do modelo de 4B. Um modelo maior/raciocinador (DeepSeek) ou um provedor de fronteira (Claude) sobe esse teto.
- **Trade-off explícito aceito pelo usuário**: "mesmo demorando mais" — velocidade não é o critério dominante; qualidade da especificação é.
- **Filosofia preservada**: local-first continua o default (SPEC-17/23 — `npm i -g` e funciona, sem chave, sem rede). Provedor externo é OPT-IN explícito, com o aviso de que o material da quebra sai da máquina.

## 3. Estado atual (o que já existe e é reaproveitado)

- `packages/llm`: `modelos.ts` (registro Qwen3-4B + Qwen3-Embedding), `cache.ts` (`~/.gerador/models`), `download.ts` (GGUF com progresso), `status.ts` (`verificarStatus`), `motor.ts` (`MotorChat.completar`/`completarComSchema` com GBNF + `onTexto` streaming).
- CLI: `gerador ia instalar`/`status`; rotas `/ia/status`, `/ia/sugerir` (texto livre), `/ia/pipeline/:papel` (JSON aninhado garantido por GBNF, streamado).
- Fase F (SPEC-24): `config/pipeline-agentes.json` com `papeis[]` — o lugar natural pro futuro `provedor` por papel.
- O contrato que TODA a UI consome é estável: "um prompt entra; texto streama; no fim, o corpo completo é um JSON válido no schema pedido". É esse contrato que a abstração de provedor precisa manter.

## 4. Decisões de arquitetura

### 4.1 Interface `ProvedorIa` (packages/llm)

```ts
interface ProvedorIa {
  id: string;                        // "qwen-local" | "deepseek-local" | "anthropic"
  status(): Promise<StatusProvedor>; // instalado/chave configurada/pronto + detalhe
  completar(prompt: string, opcoes?: { onTexto?: (pedaco: string) => void }): Promise<string>;
  /** JSON GARANTIDO no schema — cada provedor garante do seu jeito (§4.2). */
  completarEstruturado(prompt: string, schema: SchemaJson, opcoes?: { onTexto?: (pedaco: string) => void }): Promise<string>;
}
```

O motor atual vira a primeira implementação (`ProvedorLocalLlama`, parametrizado pelo modelo GGUF) SEM mudança de comportamento — refactor puro, Fase 0. As rotas do CLI passam a resolver o provedor pela config em vez de instanciar o motor direto.

### 4.2 Como cada provedor garante o JSON estruturado

| Provedor | Garantia de estrutura | Streaming |
|---|---|---|
| Local (Qwen3-4B, node-llama-cpp) | GBNF (como hoje) | texto cru do JSON, como hoje |
| Compatível-OpenAI (wrapper corporativo) | `json_object` + validação/retry | delta de `content`; `reasoning_content` vira "pensando…" |
| Anthropic (Claude) | tool use com `tool_choice` forçado — o input do tool É o JSON no schema | delta de `input_json` streamado |

A diferença fica ENCAPSULADA no provedor: quem chama (`/ia/pipeline/:papel`) continua recebendo "pedaços de texto + JSON válido no final". O extrator parcial da UI (`extrairRespostasParciaisAninhadas`) não muda.

### 4.3 Raciocínio × grammar — o achado que dispensou o DeepSeek

**A barra de qualidade, calibrada pelo uso real**: *"no meu uso da ferramenta o DeepSeek atendia bem (em alguns casos até o Rovo atende, que é mais fraco); posso tolerar que fique lento, desde que seja possível trabalhar sem toda essa limitação do modelo atual em termos de raciocínio"*.

Isso definiu o alvo (não é modelo de fronteira — é "nível DeepSeek", com piso ainda mais baixo), nomeou o gargalo (**raciocínio, não estilo**: prompt melhor já tinha tirado o que dava) e liberou o custo (**lentidão é tolerada**, então `<think>` não é custo a minimizar — é o recurso a preservar).

O plano original era embarcar **DeepSeek-R1-0528-Qwen3-8B** (~5GB) para conseguir esse raciocínio. Ao implementar, o achado real inverteu a conclusão:

> **O Qwen3-4B, que a ferramenta já usava, é um modelo híbrido raciocinador — ele pensa por padrão.** Quem matava o raciocínio não era o modelo: era o nosso código, que aplicava a grammar GBNF desde o primeiro token. GBNF restringe a amostragem desde o token zero, então o `<think>` nunca tinha como sair. A ferramenta vinha usando um raciocinador em modo mudo.

Medido na máquina real, mesmo prompt e mesmo lote: **Qwen3-4B com raciocínio ligado, 330s e 306s** em duas chamadas sequenciais, com critérios de aceite numerados citando número real de latência e status HTTP — a profundidade que faltava. **DeepSeek-R1 8B, >1500s** e a segunda chamada não terminou em 25 minutos. Cinco vezes mais rápido e suficiente pela barra declarada, com 5GB a menos de disco e sem segundo download.

Daí a decisão do usuário: **"faz muito mais sentido termos SOMENTE o Qwen3-4B"**. Um modelo local só, o registro (`MODELOS_CHAT`) fica com um item, e a pluralidade de provedores continua existindo pra Fase 2 (wrapper corporativo) — que é onde ela sempre importou de verdade (§4.6).

**Como o raciocínio e a grammar convivem** (`motor.ts`, `completarComSchema`): duas fases na MESMA sessão.

1. **Livre** — o modelo raciocina e rascunha, com `budgets: { thoughtTokens: 2000 }`. **Nada disso vai pro stream de saída**: o consumidor acumula pedaços e faz `JSON.parse` no fim, então prosa quebraria o parse. A UI já mostra "pensando…" nesse intervalo.
2. **Estruturada** — mesma sessão, agora com a grammar E `budgets: { thoughtTokens: 0 }`. Sem zerar o budget o modelo tenta raciocinar de novo e colide com a grammar.

O teto de 2000 tokens de raciocínio não é estético: **sem limite, uma única chamada levou 2563s (~42 min)**. E cada chamada faz `sessao.resetChatHistory()` antes de começar — ver §8.3.

### 4.4 Configuração e credenciais

- **`config/ia.json`** (novo, mesmo padrão de arquivo local): `{ "provedorPadrao": "qwen-local", "anthropic": { "modelo": "claude-sonnet-5" } }`.
- **Chave de API NUNCA no projeto** (config/ é versionável pelo usuário): `ANTHROPIC_API_KEY` por env var, ou `~/.gerador/credenciais.json` (home, fora de qualquer repo) — mesmo diretório-base do cache de modelos. `gerador ia conectar anthropic` grava a chave lá com aviso.
- **Privacidade explícita**: ao selecionar provedor externo, a UI mostra o aviso de que o conteúdo da quebra/épico é enviado ao provedor. Local continua default de fábrica.

### 4.5 Modelo por papel (sinergia Fase F)

`papeis[].provedor?: string` em `config/pipeline-agentes.json` — ausente usa o `provedorPadrao`. Caso de uso citado pelo usuário na prática: PO/QA no Claude (linguagem, critérios), Especialista no local (dados sensíveis de infra, volume alto). A rota `/ia/pipeline/:papel` já sabe o papel — só resolve o provedor dele. Fase 3, depois do resto estar de pé.

### 4.6 Wrapper corporativo — o provedor que mais importa na prática (achado real)

O usuário já usa, na empresa, **um wrapper interno: uma interface unificada para vários modelos**, e é por ele que a chamada ao DeepSeek acontece hoje. Isso muda o desenho para melhor: em vez de um `ProvedorDeepSeekApi` específico, a Fase 2 implementa um **`ProvedorCompativelOpenAI(baseUrl, chave, modelo, cabecalhosExtra?)`** genérico — o formato `POST {baseUrl}/chat/completions` é o de-facto desses gateways (DeepSeek oficial, wrappers corporativos, Ollama, vLLM, LiteLLM, OpenRouter). Uma implementação, N destinos: o DeepSeek oficial vira uma instância pré-configurada; o wrapper da empresa é outra, onde o usuário informa a base URL interna.

Consequência para a jornada: o card "Compatível com OpenAI (wrapper/gateway)" pede **base URL + chave + nome do modelo**, e nada mais. Sem rede externa nenhuma quando o gateway é interno — o que resolve de graça a objeção de privacidade corporativa (os dados não saem da empresa).

### 4.7 UI

- Aba nova **"Modelo de IA"** em Configurações: um card por provedor (status: instalado / baixar N GB / chave configurada ou não), radio de "usar como padrão", link "como conectar".
- `gerador ia instalar --modelo deepseek` baixa o segundo GGUF; `gerador ia status` lista os dois + estado da conexão externa.
- Aba Pipeline de IA (Fase F): select opcional de provedor por papel (Fase 3).

## 5. Jornada do usuário (planejada com o usuário: "escolher um modelo local, ou conectar-se ao DeepSeek ou ao Claude")

Tudo acontece numa aba nova **"Modelo de IA"** em Configurações: um card por provedor, cada um com estado, ação principal e o radio "usar como padrão". O mesmo fluxo existe em CLI (`gerador ia …`) pra quem não abre a UI.

### 5.1 Jornada A — modelo local (sem conta, sem rede além do download)

1. Card "Qwen3-4B (local)" — estado: `instalado ✓` (é o de fábrica) — e card "DeepSeek R1 (local)" — estado: `baixar ~5 GB`.
2. Clique em "Baixar e usar" → barra de progresso (mesmo mecanismo do `gerador ia instalar` de hoje) → ao concluir, o card vira `instalado ✓` e o radio pode ser marcado.
3. Marcar o radio grava `provedorPadrao` em `config/ia.json`. A próxima esteira já roda no modelo escolhido. Nenhum dado sai da máquina, nunca.

### 5.2 Jornada B — conectar ao DeepSeek (nuvem, API)

Registro honesto de mecanismo: **não existe OAuth de terceiros pra API do DeepSeek** — "entrar com Google" acontece NO SITE do DeepSeek (a plataforma deles aceita conta Google), não dentro do nosso app; o artefato que chega pra gente é sempre uma CHAVE de API. A jornada embrulha isso pra parecer um login guiado:

1. Card "DeepSeek (nuvem)" → botão **"Conectar"**.
2. O app abre o navegador na página de chaves da plataforma DeepSeek (lá o usuário entra como preferir — Google incluído — e cria/copia a chave).
3. De volta ao app: campo "cole a chave", botão "Validar e conectar" → uma chamada de teste barata confirma a chave.
4. Chave gravada em `~/.gerador/credenciais.json` (home, NUNCA em `config/` — que é versionável). Card vira `conectado (sk-…c12)` com botão "Desconectar".
5. Aviso permanente no card: "o conteúdo das quebras/épicos é enviado ao provedor; cobrança por token".

Se um dia o provedor oferecer OAuth de verdade pra API, a jornada troca os passos 2-3 pelo fluxo direto — o resto (armazenamento, aviso, card) não muda.

### 5.3 Jornada C — conectar ao Claude (Anthropic)

Idêntica à B, apontando pro console da Anthropic (chaves de API). Campo extra no card: o modelo (`claude-sonnet-5` default). Mesmo armazenamento, mesmo aviso.

### 5.4 Jornada E — wrapper/gateway corporativo (§4.6)

Card "Compatível com OpenAI": três campos (base URL, chave, modelo), botão "Validar e conectar" (mesma chamada de teste das outras). É o caminho que o usuário realmente usa na empresa. Sem aviso de "dados saem da máquina" quando a base URL é interna — o aviso é condicional ao destino, não fixo.

### 5.5 Modo "prompt único" — a ponte com o fluxo atual (`gerador_de_itens_2.html`)

O fluxo que o usuário roda hoje na empresa é: **um prompt único gigante** (template com `{{descricaoEpico}}`, `{{requisitosTecnicos}}`, `{{itensBreakDownContent}}`…) colado no wrapper, que devolve o markdown de todas as histórias. Registrado como MODO alternativo, não como futuro:

- **"Copiar prompt do breakdown"** (barato, sem integração): a tela de revisão renderiza o template — configurável, reusando o mecanismo de `{{variavel}}` que a aba "Especificação de solução" já tem — com épico, tecnologias, contextos e todos os itens derivados, e copia. O usuário cola onde já cola. Funciona sem provedor conectado nenhum.
- **Chamada única integrada** (com provedor conectado): mesmo prompt, chamada direta, markdown guardado como documento da quebra. **Sem parse de volta na v1**: reconstruir o parse do markdown seria reintroduzir a fragilidade que a esteira elimina (o próprio template diz "scripts de parsing dependem desta estrutura exata").

Comparação honesta registrada — não é "um substitui o outro":

| | Prompt único | Esteira de agentes |
|---|---|---|
| Chamadas | 1 | 4×⌈N/5⌉ |
| Saída | markdown linear | campo a campo, estruturado |
| Revisão | fora da ferramenta | dentro (confirmar/editar/re-rodar por campo) |
| Formato garantido | não (o template gasta ~metade do texto se defendendo de erro do modelo) | sim (GBNF/tool use) |
| Regras críticas (✍️, volumetria em branco, Task sem ciclo de teste, item 8 quebrado) | o modelo precisa obedecer | **o engine garante** — o modelo nem é consultado |
| Propagar mudança depois | recomeçar do zero | SPEC-26 |

Observação que orienta o roadmap: boa parte do template atual existe para conter alucinação (volumetria em branco, indicador literal, "NUNCA misturar teste com refinamento"). Tudo isso já é determinístico no motor — o valor do modelo se concentra no que é textual.

### 5.6 Jornada D — por papel (Fase 4, depois do resto)

Na aba Pipeline de IA (Fase F), cada papel ganha um select "Provedor: (padrão) | …" listando só os provedores prontos/conectados. Caso de uso: PO/QA no Claude, Especialista no local.

## 6. Trade-offs registrados

| | Qwen3-4B (local, atual) | DeepSeek R1 distill (local) | DeepSeek API (nuvem) | Claude (Anthropic) |
|---|---|---|---|---|
| Qualidade/profundidade | básica | boa (raciocínio) | muito boa (R1/V3 completos) | melhor |
| Velocidade | referência | ~2-3× mais lento + think | rápida (rede) | rápida (rede) |
| Custo | zero | zero | baixo (por token) | por token |
| Privacidade | total | total | dados saem da máquina | dados saem da máquina |
| Requisitos | ~2.5GB disco | ~5GB disco, mais RAM | conta + chave + rede | conta + chave + rede |

Nota da API DeepSeek: compatível com o formato OpenAI (`chat/completions`); a garantia de estrutura é mais fraca que GBNF/tool-use (`response_format: json_object` + validação + 1 retry no provedor); o R1 expõe o raciocínio em `reasoning_content` separado — encaixa direto no estado "pensando…" da UI.

## 7. Fora de escopo, deliberado

- OAuth próprio do app ("entrar com Google" DENTRO do gerador) — não existe suporte de terceiros nas APIs de DeepSeek/Anthropic hoje (§5.2); a jornada de conexão guiada entrega o mesmo resultado com o mecanismo que existe.
- Ollama/OpenAI/outros provedores — a interface `ProvedorIa` os comporta; registrados como extensão, não desenhados agora.
- Fine-tuning; benchmark automatizado (a medição da Fase 1 é manual e registrada no JOURNEY).
- Trocar o modelo de EMBEDDINGS (só chat/pipeline — o índice de retrospectivas da SPEC-23 continua como está).

## 8. Roteiro faseado

1. **Fase 0 — abstração**: interface `ProvedorIa` + `ProvedorLocalLlama` embrulhando o motor atual; rotas resolvem provedor pela config (`config/ia.json` com só o default); aba "Modelo de IA" nasce aqui mostrando só os cards locais. Zero mudança de comportamento; regressão prova.
2. **Fase 1 — raciocínio no modelo local** *(concluída, com desfecho diferente do planejado: ver §4.3 e §8.3)*: era "embarcar o DeepSeek"; virou "ligar o raciocínio que o Qwen3-4B já tinha". Um modelo local só.
3. **Fase 2 — conexão a provedores (Jornadas B, C e E)**: a infraestrutura de "Conectar" é UMA só (abrir navegador, colar chave, validar, `~/.gerador/credenciais.json`, aviso condicional de privacidade, `gerador ia conectar <provedor>`), com duas implementações: **`ProvedorCompativelOpenAI`** genérico (§4.6 — serve o wrapper corporativo, o DeepSeek oficial e qualquer gateway; `json_object` + validação/retry, `reasoning_content` → "pensando…") e `ProvedorAnthropic` (tool use forçado + streaming de `input_json`). **Prioridade dentro da fase: o compatível-OpenAI primeiro** — é o que o usuário usa na empresa. Verificação real com as chaves/base URL do usuário.
   - **Fase 2.1 (opcional, barata)**: modo "copiar prompt do breakdown" (§5.5) — ponte com o fluxo atual, não depende de provedor nenhum.
4. **Fase 3 — provedor por papel** (Jornada D): `papeis[].provedor` + select na aba Pipeline listando só provedores prontos.

### 8.1 Realidade que ordena as fases (achado real, e é o que manda)

*"Na empresa já tenho um endpoint, mas ainda não tenho o token para usá-lo; a ideia de embarcar um modelo é uma forma de contornar isso e poder validar a ferramenta no dia a dia."*

Consequências, registradas para não repetir a inversão de prioridade que eu mesmo cometi na rodada anterior (tinha promovido a Fase 2 a "pré-requisito duro" de tudo):

- **O modelo local não é plano B — é o único caminho disponível hoje.** A Fase 1 (DeepSeek local) deixa de ser "melhoria futura" e vira **a única alavanca de qualidade acionável agora**.
- **A Fase 2 não pode governar a sequência**, porque depende de algo fora do nosso alcance (a liberação do token). Ela é implementada como **soquete pronto e dormente**: `ProvedorCompativelOpenAI` + card na aba com os três campos (base URL, chave, modelo), testado contra um servidor falso na suíte. No dia em que o token sair, a validação real é colar e clicar — zero reescrita.
- **O que NÃO depende de modelo tem prioridade real**: SPEC-26 Bloco 1 (procedência/obsolescência) e Bloco 4a (checagens determinísticas do engine) entregam valor no dia a dia rodando com qualquer modelo — inclusive nenhum.
- **O chat (SPEC-26 Bloco 5) fica por último** e ganha um degrau intermediário (§5.5 da SPEC-26): o impacto é computado pelo app (determinístico) e o modelo só REDIGE o ajuste — isso funciona em modelo pequeno; tool use livre encadeado espera o provedor forte.

### 8.2 Dois ambientes, dois papéis — e por que o Claude sobe na fila

Complemento do usuário: *"poder logar e usar você lá seria uma forma de agilizar meus testes na minha máquina (na empresa só vou poder usar o embarcado)"*.

| | Máquina pessoal — **laboratório** | Empresa — **produção** |
|---|---|---|
| Provedor | Claude (chave própria, obtível HOJE) | modelo embarcado, e o wrapper quando o token sair |
| Papel | validar desenho e prompts em segundos | uso real no dia a dia |
| Efeito no ciclo | esteira completa em ~segundos | ~12 min por esteira (Qwen3-4B, medido) |

Três consequências de arquitetura, não só de agenda:

1. **A Fase 2/Anthropic sobe para logo depois da Fase 0** — não por qualidade em produção (que é o embarcado), mas como **acelerador do ciclo de desenvolvimento**: cada rodada de validação real desta conversa levou 12-25 minutos esperando o modelo local. Com Claude conectado, o mesmo teste roda em segundos, e a cadência de iteração de prompt/propagação/chat muda de patamar. A chave da Anthropic não depende do token corporativo.
2. **O Claude vira a referência de qualidade**: a saída dele no mesmo cenário é o alvo contra o qual se mede se o modelo embarcado está aceitável — em vez de julgar "está raso?" no vácuo, compara-se lado a lado.
3. **Princípio de projeto que passa a valer: nunca assumir capacidade do modelo.** O embarcado define o PISO do produto — mas a restrição é explicitamente **temporária** (*"por enquanto ao menos"*): pode cair quando o token sair ou a política mudar. Logo, o desenho **não otimiza PARA o modelo pequeno** (isso amarraria o produto a uma limitação passageira) — ele **degrada ATÉ** ele. Toda funcionalidade nasce com dois caminhos sobre a MESMA arquitetura: o de qualidade (provedor forte) e o de piso (embarcado), sem virar duas implementações paralelas. Daí o Bloco 5a "com trilhos" da SPEC-26 não ser consolo, e sim o modo que roda na empresa hoje — e que continua útil depois, porque é mais barato e previsível. Verificação passa a exigir os dois lados: nenhuma feature é dada por pronta sem rodar no embarcado.

### 8.3 Fases 0 e 1 — implementadas (e a Fase 1 terminou diferente do planejado)

**Fase 0 (abstração)**: `ProvedorIa` em `packages/llm/src/provedor.ts` — `completar`/`completarEstruturado`/`descartar`, com `criarProvedorLocal(modelo)` parametrizado pelo `ModeloRegistrado` (era fixo no Qwen). As rotas `/ia/*` do CLI falam só com a interface. `config/ia.json` (`{provedorPadrao}`) + `GET`/`PUT /config/ia`; **PUT com id desconhecido devolve 400** de propósito — cair no padrão em silêncio faria o usuário achar que trocou de modelo sem ter trocado. Trocar o provedor **descarta** o anterior (libera os GB de RAM em vez de manter dois carregados). `verificarStatus(baseDir?, idChat?)` lista os modelos de chat um a um, e `pronto` é uma afirmação sobre o modelo SELECIONADO.

Essa abstração continua valendo inteira com um modelo local só: ela existe para a Fase 2 (wrapper corporativo), não para a pluralidade de locais.

**Fase 1 — o DeepSeek foi implementado, medido e removido.** O caminho está em §4.3: o R1-distill 8B chegou a rodar de verdade, mas o achado de que o **Qwen3-4B já era raciocinador** o tornou desnecessário — 5x mais rápido, qualidade suficiente pela barra declarada, 5GB a menos. Decisão do usuário: só o Qwen3-4B. `MODELOS_CHAT` fica com um item; `raciocinador: true` no registro é o que liga o caminho de duas fases do `motor.ts`.

Dois bugs reais achados nessa medição, ambos invisíveis sem rodar:

- **A sessão acumulava histórico entre chamadas.** `LlamaChatSession` é singleton no servidor e vive o processo inteiro; cada papel da esteira ia empilhando prompt+resposta até estourar o contexto. Sintoma: **só o primeiro papel respondia**, e os seguintes falhavam em 4 segundos — tempo impossível para um raciocinador, e foi esse detalhe que denunciou. Correção: `sessao.resetChatHistory()` no início de cada chamada. Não é gambiarra: nenhum fluxo aqui depende de memória entre chamadas (todo prompt carrega épico, itens e respostas anteriores explicitamente).
- **As falhas eram silenciosas.** A rota engolia o erro e a UI só mostrava o pip apagado. Um `console.error` no catch expôs o bug acima — e, no mesmo dia, um erro meu: forçar `contextSize: {min: 16384}` estourava a VRAM ("context size too large") e derrubava todas as chamadas. O default do `createContext()` voltou, com o motivo em comentário para ninguém "melhorar" isso de novo.

CLI: `gerador ia instalar [--modelo <id>]`, `gerador ia usar <id>`, `status` listando os modelos de chat com o selecionado marcado. Web: aba **"Modelo de IA"** com card por modelo (estado real do disco, selo "raciocinador", tamanho) e radio que grava a escolha — pronta para receber o wrapper corporativo como segundo card na Fase 2.

### 8.4 Fase 2 (compatível-OpenAI) — implementada como soquete dormente

Feita exatamente como §8.1 mandou: **pronta e testada, sem depender do token corporativo**. O que existe:

- **`packages/llm/src/provedorOpenAI.ts`** — `criarProvedorCompativelOpenAI({baseUrl, chave, modelo, cabecalhos?, fetchImpl?})`. `POST {baseUrl}/chat/completions` com `stream: true`; SSE decodificado com **buffer entre leituras** (o gateway pode fechar o pacote TCP no meio de um `data:` — sem buffer, o pedaço vira JSON inválido e o texto some). `reasoning_content` é descartado da resposta, mesma regra do `<think>` local. `cabecalhos` extras existem porque wrapper corporativo costuma exigir os seus.
- **JSON sem GBNF**: `response_format: {type: "json_object"}` + o schema no prompt + **`validarContraSchema`** (chaves obrigatórias, tipos, `enum`) + **um** retry mandando a tentativa errada de volta com o defeito nomeado (`falta a chave "valor"`). Errar duas vezes com o defeito apontado é problema do gateway — insistir mais só gastaria o tempo do usuário. Isso é deliberadamente mais fraco que a grammar: lá o JSON inválido é *impossível*, aqui é *improvável*.
- **Credenciais (§4.4) — a regra dura, agora executável**: `packages/llm/src/credenciais.ts` grava em `~/.gerador/credenciais.json` com `mode 0o600`, e um teste falha se o caminho contiver `config/`. `config/` é versionável: chave ali é vazamento esperando um `git push`. A chave **nunca volta pela rede**: `resumirCredencial` devolve `sk-…7890`, e há teste de que o corpo da resposta não a contém.
- **Um espaço de ids só**: `ID_PROVEDOR_GATEWAY = "compativel-openai"` entra em `idsDeProvedorValidos()` (não em `MODELOS_CHAT`, que é a lista do que se **baixa**). `PUT /config/ia` passou a aceitá-lo; id inventado continua 400.
- **`pronto` sem embedding local**: quem roda tudo por gateway não precisa dos 650 MB do modelo de embedding (ele só serve ao RAG). O gate do gateway é a credencial, e só.
- **CLI**: `gerador ia conectar --url <base> --chave <chave> --modelo <nome>` (sem argumentos, mostra o configurado com a chave mascarada). **Web**: card "remoto" na aba com os três campos, **Salvar** e **Testar conexão** — chave vazia significa "manter a que já está lá", porque o campo mostra a máscara e exigir redigitá-la para mudar só a base URL seria hostil.
- **Testado contra HTTP real, não `fetch` mockado**: um `node:http` de mentira responde SSE de verdade, inclusive evento partido entre chunks, `[DONE]`, corpo inteiro sem streaming e 401/404. É o que precisa funcionar no dia do token — um mock de `fetch` provaria só que o código chama o que ele mesmo espera.

**Achado real da implementação**: `resposta.body` **sempre** existe no `fetch` do Node, então o caminho "gateway que não streama" nunca era alcançado por `if (!leitor)`. A detecção passou a ser pelo que chegou (nenhum `data:` no corpo → tenta `choices[0].message.content`), o que também cobre wrapper com `Content-Type` errado.

O que falta para dar a Fase 2 por completa é só o que não depende de nós: **validação real com a base URL e o token do usuário**, e o `ProvedorAnthropic` (§8.2).

## 9. Verificação

Fase a fase, contra o `gerador open` real (disciplina de sempre): Fase 0 = regressão intacta + aba renderizando; **Fase 1 = esteira completa no cenário real com raciocínio ligado, medindo tempo e profundidade contra a linha de base sem raciocínio (registrado no JOURNEY §85)**; Fase 2 = esteira completa via wrapper compatível-OpenAI e via Claude, com streaming e JSON válido, chave validada e guardada fora do projeto — **hoje verificada contra um gateway HTTP falso ponta a ponta (§8.4); a verificação com o gateway real fica pendente do token, e está explicitamente NÃO feita**; Fase 3 = esteira mista (papéis em provedores diferentes) num run só.
