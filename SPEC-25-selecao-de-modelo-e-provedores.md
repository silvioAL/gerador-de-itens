# SPEC-25 — Seleção de modelo e provedores de IA (local Qwen, local DeepSeek, e conexão a provedores externos)

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
| Local (Qwen/DeepSeek, node-llama-cpp) | GBNF (como hoje) | texto cru do JSON, como hoje |
| Anthropic (Claude) | tool use com `tool_choice` forçado — o input do tool É o JSON no schema | delta de `input_json` streamado |

A diferença fica ENCAPSULADA no provedor: quem chama (`/ia/pipeline/:papel`) continua recebendo "pedaços de texto + JSON válido no final". O extrator parcial da UI (`extrairRespostasParciaisAninhadas`) não muda.

### 4.3 DeepSeek local — modelo e o problema do `<think>`

Candidato: **DeepSeek-R1-0528-Qwen3-8B** (distill sobre Qwen3-8B, GGUF Q4_K_M ~5GB) — roda no MESMO runtime (node-llama-cpp), mesmo mecanismo de download/cache. Alternativa menor: R1-Distill-Qwen-7B. Decisão final na Fase 1, medindo na máquina real.

**A barra de qualidade, calibrada pelo uso real (achado decisivo)**: *"no meu uso da ferramenta o DeepSeek atendia bem (em alguns casos até o Rovo atende, que é mais fraco); posso tolerar que fique lento, desde que seja possível trabalhar sem toda essa limitação do modelo atual em termos de raciocínio"*.

Três consequências que mudam o status desta fase:

- **O alvo não é modelo de fronteira — é "nível DeepSeek"**, e o piso aceitável é ainda mais baixo (Rovo às vezes basta). Ou seja: o R1-distill embarcado tem chance real de **atender de verdade** o ambiente da empresa, não só de servir de piso. A Fase 1 deixa de ser compromisso e vira **a aposta principal do ambiente de produção**.
- **O gargalo nomeado é raciocínio, não estilo.** Não é caso de continuar calibrando prompt do Qwen3-4B: um modelo de 4B sem cadeia de raciocínio tem teto, e o usuário já bateu nele. Prompt melhor (feito na rodada anterior) tirou o que dava; o resto exige o modelo.
- **Lentidão é explicitamente tolerada**, então o `<think>` do R1 **não é custo a minimizar — é o recurso a preservar**. Isso decide o desenho de §4.3 abaixo: em nenhuma hipótese forçar a grammar desde o primeiro token; melhor pagar o tempo do raciocínio e aplicar a estrutura depois.

Risco central documentado: modelos R são RACIOCINADORES — emitem `<think>…</think>` antes da resposta. GBNF forçando JSON desde o primeiro token **mata o raciocínio** (perderia justamente o que se busca no DeepSeek). Estratégia da Fase 1: deixar o think correr livre e aplicar a grammar só após o fechamento do think (node-llama-cpp tem suporte a reasoning budget/segmentos; se a versão instalada não expuser, fallback: geração livre com instrução de JSON + validação + 1 retry). O streaming do think pode aparecer na UI como "pensando…" (o painel ao vivo já tem esse estado) — o texto do think NÃO entra no JSON final.

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
2. **Fase 1 — DeepSeek local**: registro do modelo, download pela aba/`ia instalar --modelo deepseek`, seleção (Jornada A completa), tratamento do `<think>` (§4.3). Verificação: mesma esteira no cenário de crédito com os dois modelos, comparação de profundidade/tempo registrada no JOURNEY.
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

## 9. Verificação

Fase a fase, contra o `gerador open` real (disciplina de sempre): Fase 0 = regressão intacta + aba renderizando; Fase 1 = comparação lado a lado dos dois modelos locais; Fase 2 = esteira completa via DeepSeek API e via Claude, com streaming e JSON válido, chave validada e guardada fora do projeto; Fase 3 = esteira mista (papéis em provedores diferentes) num run só.
