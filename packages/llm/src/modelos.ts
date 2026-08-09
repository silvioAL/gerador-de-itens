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
export type IdModelo = "qwen-local" | "embedding";

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
  // ACHADO REAL que decidiu a SPEC-25 Fase 1: o Qwen3 é HÍBRIDO
  // RACIOCINADOR — pensa por padrão (o node-llama-cpp inclusive traz um
  // `QwenChatWrapper` com suporte a segmentos `thought`). Até aqui a
  // ferramenta o tratava como modelo comum, e a grammar GBNF valendo desde
  // o primeiro token MATAVA esse raciocínio. Boa parte da "limitação de
  // raciocínio do modelo atual" relatada pelo usuário era limitação nossa.
  // Medido, mesmo prompt: 330s com raciocínio (respostas com critérios
  // numerados citando o contrato) contra 1500s do DeepSeek-R1 8B — 5x mais
  // rápido E suficiente, o que tornou o modelo de 5 GB desnecessário.
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

/** O que `gerador ia instalar` baixa — tudo que a ferramenta precisa. */
export const MODELOS_PADRAO: ModeloRegistrado[] = [MODELO_CHAT, MODELO_EMBEDDING];

/** Modelos de chat disponíveis (SPEC-25). Um só hoje, por DECISÃO do
 * usuário depois da medição: o Qwen3-4B raciocinando cobre a necessidade em
 * 1/5 do tempo do DeepSeek-R1 8B, que foi removido em vez de ficar como
 * opção que ninguém usaria. A lista existe (em vez de um modelo fixo)
 * porque a Fase 2 entra aqui — wrapper corporativo e Claude viram entradas
 * novas, sem mexer em quem consome. */
export const MODELOS_CHAT: ModeloRegistrado[] = [MODELO_CHAT];

export const TODOS_OS_MODELOS: ModeloRegistrado[] = [...MODELOS_CHAT, MODELO_EMBEDDING];

/**
 * SPEC-25 Fase 2 — o provedor remoto vive no MESMO espaço de ids dos modelos
 * locais (§4.6), porque `config/ia.json` tem um campo só (`provedorPadrao`) e
 * a aba mostra uma lista só de cards. Ele não é um `ModeloRegistrado`: não tem
 * arquivo, não tem download, não tem tamanho — por isso mora aqui como um id
 * à parte em vez de entrar em `MODELOS_CHAT`, que é a lista do que se baixa.
 */
export const ID_PROVEDOR_GATEWAY = "compativel-openai";
export const NOME_PROVEDOR_GATEWAY = "Gateway compatível com OpenAI";
export const PAPEL_PROVEDOR_GATEWAY =
  "Wrapper corporativo, DeepSeek oficial, Ollama, vLLM, LiteLLM — qualquer endpoint /chat/completions";

/**
 * Destinos conhecidos do gateway — SPEC-25 Fase 2.1.
 *
 * Pedido do usuário: *"vamos começar simples, se eu conseguir usar o claude
 * integrado a ferramenta já é ótimo"*. Não precisou de provedor novo: a
 * Anthropic publica uma camada compatível com a API da OpenAI
 * (https://platform.claude.com/docs/en/api/openai-sdk), então o
 * `ProvedorCompativelOpenAI` que já existia serve — o que faltava era a pessoa
 * ter que adivinhar a base URL e o nome do modelo.
 *
 * O preset preenche os dois campos e escreve na tela o que muda em cada
 * destino. `jsonNativo: false` não é detalhe de implementação: com a Anthropic,
 * `response_format` é IGNORADO (documentado por eles), então a estrutura passa
 * a ser garantida só pela validação contra o schema + retry do provedor. Quem
 * escolhe merece saber disso antes, não depois de uma resposta estranha.
 */
export interface PresetGateway {
  id: string;
  nome: string;
  baseUrl: string;
  /** Sugestões — o campo continua livre, gateway interno tem nome próprio. */
  modelos: string[];
  modeloPadrao: string;
  /** O endpoint respeita `response_format: json_object`? */
  jsonNativo: boolean;
  /** Onde a pessoa consegue a chave. */
  urlChave?: string;
  observacao: string;
}

export const PRESETS_GATEWAY: PresetGateway[] = [
  {
    id: "anthropic",
    nome: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com/v1",
    modelos: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    modeloPadrao: "claude-sonnet-5",
    jsonNativo: false,
    urlChave: "https://console.anthropic.com/settings/keys",
    observacao:
      "Precisa de uma chave de API do console da Anthropic — assinatura do Claude.ai ou do Claude Code não dá acesso à API, é cobrança por uso à parte.",
  },
  {
    id: "deepseek",
    nome: "DeepSeek (oficial)",
    baseUrl: "https://api.deepseek.com/v1",
    modelos: ["deepseek-chat", "deepseek-reasoner"],
    modeloPadrao: "deepseek-chat",
    jsonNativo: true,
    urlChave: "https://platform.deepseek.com/api_keys",
    observacao: "Cobrança por uso. `deepseek-reasoner` pensa antes de responder e custa mais.",
  },
  {
    id: "ollama",
    nome: "Ollama (na sua máquina)",
    baseUrl: "http://localhost:11434/v1",
    modelos: ["qwen3:4b", "llama3.1:8b"],
    modeloPadrao: "qwen3:4b",
    jsonNativo: true,
    observacao: "Roda local, sem custo e sem sair da máquina. A chave é ignorada pelo Ollama — preencha qualquer coisa.",
  },
];

export function presetGatewayPorId(id: string): PresetGateway | undefined {
  return PRESETS_GATEWAY.find((p) => p.id === id);
}

/** Ids que `config/ia.json` aceita: os modelos de chat baixáveis + o gateway. */
export function idsDeProvedorValidos(): string[] {
  return [...MODELOS_CHAT.map((m) => m.id), ID_PROVEDOR_GATEWAY];
}

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
