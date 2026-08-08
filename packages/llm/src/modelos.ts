/**
 * Registro dos modelos usados pela ferramenta — fonte única de verdade pro
 * download (`download.ts`) e pra checagem de instalação (`status.ts`).
 * Decisão registrada em SPEC-23: Qwen3-4B (chat, GBNF/JSON Schema via
 * llama.cpp) + Qwen3-Embedding-0.6B (embeddings, mesma família — evita
 * depender de uma segunda stack de embeddings). GGUF Q4_K_M: equilíbrio
 * tamanho/qualidade já validado pela comunidade pra rodar em CPU comum.
 */
export interface ModeloRegistrado {
  /** Chave estável usada em `cache.ts`/`status.ts` — nunca muda mesmo se o
   * arquivo/repo de origem mudar de nome. */
  id: "chat" | "embedding";
  papel: string;
  repositorioHuggingFace: string;
  nomeArquivo: string;
  tamanhoAproximadoBytes: number;
}

export const MODELO_CHAT: ModeloRegistrado = {
  id: "chat",
  papel: "Qwen3-4B (chat/instruct, GGUF Q4_K_M)",
  repositorioHuggingFace: "Qwen/Qwen3-4B-GGUF",
  nomeArquivo: "Qwen3-4B-Q4_K_M.gguf",
  tamanhoAproximadoBytes: 2_500_000_000,
};

export const MODELO_EMBEDDING: ModeloRegistrado = {
  id: "embedding",
  papel: "Qwen3-Embedding-0.6B (embeddings multilíngue, GGUF Q8_0)",
  repositorioHuggingFace: "Qwen/Qwen3-Embedding-0.6B-GGUF",
  // Achado real: o nome "óbvio" (tudo minúsculo, seguindo a convenção do
  // Qwen3-4B-GGUF) dava 404 — o repo real usa "Qwen3-Embedding-0.6B-Q8_0.gguf"
  // (maiúsculas). Confirmado direto na Hugging Face API
  // (huggingface.co/api/models/Qwen/Qwen3-Embedding-0.6B-GGUF), não assumido.
  nomeArquivo: "Qwen3-Embedding-0.6B-Q8_0.gguf",
  tamanhoAproximadoBytes: 650_000_000,
};

export const MODELOS: ModeloRegistrado[] = [MODELO_CHAT, MODELO_EMBEDDING];

export function urlDownload(modelo: ModeloRegistrado): string {
  return `https://huggingface.co/${modelo.repositorioHuggingFace}/resolve/main/${modelo.nomeArquivo}`;
}
