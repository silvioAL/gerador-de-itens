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

Risco central documentado: modelos R são RACIOCINADORES — emitem `<think>…</think>` antes da resposta. GBNF forçando JSON desde o primeiro token **mata o raciocínio** (perderia justamente o que se busca no DeepSeek). Estratégia da Fase 1: deixar o think correr livre e aplicar a grammar só após o fechamento do think (node-llama-cpp tem suporte a reasoning budget/segmentos; se a versão instalada não expuser, fallback: geração livre com instrução de JSON + validação + 1 retry). O streaming do think pode aparecer na UI como "pensando…" (o painel ao vivo já tem esse estado) — o texto do think NÃO entra no JSON final.

### 4.4 Configuração e credenciais

- **`config/ia.json`** (novo, mesmo padrão de arquivo local): `{ "provedorPadrao": "qwen-local", "anthropic": { "modelo": "claude-sonnet-5" } }`.
- **Chave de API NUNCA no projeto** (config/ é versionável pelo usuário): `ANTHROPIC_API_KEY` por env var, ou `~/.gerador/credenciais.json` (home, fora de qualquer repo) — mesmo diretório-base do cache de modelos. `gerador ia conectar anthropic` grava a chave lá com aviso.
- **Privacidade explícita**: ao selecionar provedor externo, a UI mostra o aviso de que o conteúdo da quebra/épico é enviado ao provedor. Local continua default de fábrica.

### 4.5 Modelo por papel (sinergia Fase F)

`papeis[].provedor?: string` em `config/pipeline-agentes.json` — ausente usa o `provedorPadrao`. Caso de uso citado pelo usuário na prática: PO/QA no Claude (linguagem, critérios), Especialista no local (dados sensíveis de infra, volume alto). A rota `/ia/pipeline/:papel` já sabe o papel — só resolve o provedor dele. Fase 3, depois do resto estar de pé.

### 4.6 UI

- Aba nova **"Modelo de IA"** em Configurações: um card por provedor (status: instalado / baixar N GB / chave configurada ou não), radio de "usar como padrão", link "como conectar".
- `gerador ia instalar --modelo deepseek` baixa o segundo GGUF; `gerador ia status` lista os dois + estado da conexão externa.
- Aba Pipeline de IA (Fase F): select opcional de provedor por papel (Fase 3).

## 5. Trade-offs registrados

| | Qwen3-4B (atual) | DeepSeek R1 distill 7-8B | Claude (Anthropic) |
|---|---|---|---|
| Qualidade/profundidade | básica | boa (raciocínio) | melhor |
| Velocidade (CPU local) | referência | ~2-3× mais lento + think | rápida (rede) |
| Custo | zero | zero | por token |
| Privacidade | total | total | dados saem da máquina |
| Requisitos | ~2.5GB disco | ~5GB disco, mais RAM | chave + rede |

## 6. Fora de escopo, deliberado

- Ollama/OpenAI/outros provedores — a interface `ProvedorIa` os comporta; registrados como extensão, não desenhados agora.
- Fine-tuning; benchmark automatizado (a medição da Fase 1 é manual e registrada no JOURNEY).
- Trocar o modelo de EMBEDDINGS (só chat/pipeline — o índice de retrospectivas da SPEC-23 continua como está).

## 7. Roteiro faseado

1. **Fase 0 — abstração**: interface `ProvedorIa` + `ProvedorLocalLlama` embrulhando o motor atual; rotas resolvem provedor pela config (`config/ia.json` com só o default). Zero mudança de comportamento; regressão prova.
2. **Fase 1 — DeepSeek local**: registro do modelo, `ia instalar --modelo deepseek`, seleção pela aba nova, tratamento do `<think>` (§4.3). Verificação: mesma esteira no cenário de crédito com os dois modelos, comparação de profundidade/tempo registrada no JOURNEY.
3. **Fase 2 — Anthropic**: `ProvedorAnthropic` (tool use estruturado + streaming), `gerador ia conectar`, aviso de privacidade. Verificação real com chave do usuário.
4. **Fase 3 — provedor por papel** (Fase F): `papeis[].provedor` + select na aba Pipeline.

## 8. Verificação

Fase a fase, contra o `gerador open` real (disciplina de sempre): Fase 0 = regressão intacta; Fase 1 = comparação lado a lado dos dois modelos locais; Fase 2 = esteira completa via Claude com streaming e JSON válido; Fase 3 = esteira mista (papéis em provedores diferentes) num run só.
