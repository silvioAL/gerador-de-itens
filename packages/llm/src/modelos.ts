/**
 * Registro dos modelos usados pela ferramenta — fonte única de verdade pro
 * download (`download.ts`) e pra checagem de instalação (`status.ts`).
 * Decisão registrada em SPEC-23: Qwen3-4B (chat, GBNF/JSON Schema via
 * llama.cpp) + Qwen3-Embedding-0.6B (embeddings, mesma família — evita
 * depender de uma segunda stack de embeddings). GGUF Q4_K_M: equilíbrio
 * tamanho/qualidade já validado pela comunidade pra rodar em CPU comum.
 */
/** SPEC-25 Fase 0/1 — o id de um modelo de chat É o id do provedor local
 * correspondente (`config/ia.json` → `provedorPadrao`). Um espaço de ids só,
 * pra não precisar de um mapa provedor↔modelo; provedores remotos (Fase 2)
 * entram com ids próprios ("anthropic", "wrapper"). */
export type IdModelo = "qwen-local" | "deepseek-local" | "embedding";

export interface ModeloRegistrado {
  /** Chave estável usada em `cache.ts`/`status.ts` — nunca muda mesmo se o
   * arquivo/repo de origem mudar de nome. */
  id: IdModelo;
  papel: string;
  /** Nome curto pra UI/CLI (o `papel` é a descrição longa). */
  nome: string;
  repositorioHuggingFace: string;
  nomeArquivo: string;
  tamanhoAproximadoBytes: number;
  /** Modelo RACIOCINADOR: emite `<think>…</think>` antes da resposta. Muda
   * como a geração estruturada é feita (`motor.ts`) — a grammar não pode
   * valer desde o primeiro token, senão o raciocínio (o motivo de usar este
   * modelo) morre. SPEC-25 §4.3. */
  raciocinador?: boolean;
}

export const MODELO_CHAT: ModeloRegistrado = {
  id: "qwen-local",
  nome: "Qwen3-4B",
  papel: "Qwen3-4B (chat/instruct, GGUF Q4_K_M)",
  repositorioHuggingFace: "Qwen/Qwen3-4B-GGUF",
  nomeArquivo: "Qwen3-4B-Q4_K_M.gguf",
  tamanhoAproximadoBytes: 2_500_000_000,
};

/** SPEC-25 Fase 1 — o modelo raciocinador embarcado. Distill do R1 sobre
 * Qwen3-8B: roda no MESMO runtime (node-llama-cpp), mesmo download/cache.
 * Repo e nome de arquivo CONFIRMADOS na API da Hugging Face antes de
 * escrever aqui (mesma lição do embedding abaixo — o nome "óbvio" dava 404);
 * tamanho conferido no `content-length` real: 5.027.785.216 bytes. */
export const MODELO_CHAT_DEEPSEEK: ModeloRegistrado = {
  id: "deepseek-local",
  nome: "DeepSeek-R1 8B",
  papel: "DeepSeek-R1-0528-Qwen3-8B (chat raciocinador, GGUF Q4_K_M)",
  repositorioHuggingFace: "unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF",
  nomeArquivo: "DeepSeek-R1-0528-Qwen3-8B-Q4_K_M.gguf",
  tamanhoAproximadoBytes: 5_027_785_216,
  raciocinador: true,
};

export const MODELO_EMBEDDING: ModeloRegistrado = {
  id: "embedding",
  nome: "Qwen3-Embedding-0.6B",
  papel: "Qwen3-Embedding-0.6B (embeddings multilíngue, GGUF Q8_0)",
  repositorioHuggingFace: "Qwen/Qwen3-Embedding-0.6B-GGUF",
  // Achado real: o nome "óbvio" (tudo minúsculo, seguindo a convenção do
  // Qwen3-4B-GGUF) dava 404 — o repo real usa "Qwen3-Embedding-0.6B-Q8_0.gguf"
  // (maiúsculas). Confirmado direto na Hugging Face API
  // (huggingface.co/api/models/Qwen/Qwen3-Embedding-0.6B-GGUF), não assumido.
  nomeArquivo: "Qwen3-Embedding-0.6B-Q8_0.gguf",
  tamanhoAproximadoBytes: 650_000_000,
};

/** O que `gerador ia instalar` baixa SEM argumento — o mínimo pra ferramenta
 * funcionar. O DeepSeek fica de fora de propósito: 5 GB não se baixa sem o
 * usuário pedir (`--modelo deepseek-local`). */
export const MODELOS_PADRAO: ModeloRegistrado[] = [MODELO_CHAT, MODELO_EMBEDDING];

/** Modelos de chat alternáveis (SPEC-25) — a ordem é a de exibição. */
export const MODELOS_CHAT: ModeloRegistrado[] = [MODELO_CHAT, MODELO_CHAT_DEEPSEEK];

export const TODOS_OS_MODELOS: ModeloRegistrado[] = [...MODELOS_CHAT, MODELO_EMBEDDING];

export function modeloPorId(id: string): ModeloRegistrado | undefined {
  return TODOS_OS_MODELOS.find((m) => m.id === id);
}

/** Modelo de chat de um id de provedor local; cai no default quando o id é
 * desconhecido (config editada à mão, ou provedor remoto ainda não
 * implementado) — nunca deixa o servidor sem modelo por causa de config. */
export function modeloChatPorId(id: string | undefined): ModeloRegistrado {
  return MODELOS_CHAT.find((m) => m.id === id) ?? MODELO_CHAT;
}

export function urlDownload(modelo: ModeloRegistrado): string {
  return `https://huggingface.co/${modelo.repositorioHuggingFace}/resolve/main/${modelo.nomeArquivo}`;
}
