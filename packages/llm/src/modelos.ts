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
  /**
   * SPEC-32 — pacotes npm que, concatenados NESTA ORDEM, remontam o GGUF.
   *
   * Existe porque a rede onde a ferramenta precisa rodar bloqueia o Hugging
   * Face, e o npm é o canal que passa. São partes e não um pacote só porque um
   * pacote de 2,5 GB não publica: 229,9 MB já deu `413 Payload Too Large` no
   * npmjs.org, e o maior real publicado que achamos tem 258 MB.
   *
   * Vazio/ausente = este modelo só vem do Hugging Face ou de arquivo local.
   */
  partesNpm?: string[];
  /**
   * SPEC-32 — URLs que, concatenadas NESTA ORDEM, remontam o GGUF.
   *
   * Existe porque a medição em campo (`gerador ia diagnosticar`) mostrou o
   * quadro real: o filtro corporativo classifica o Hugging Face como *file
   * sharing* e devolve 403 com página de bloqueio, mas libera o GitHub como
   * *developer tools*. Não é suposição — são as duas linhas do diagnóstico
   * naquela máquina.
   *
   * São partes e não um arquivo só porque um asset de release do GitHub vai
   * até 2 GiB, e o Qwen3-4B tem 2.382 MiB.
   */
  partesUrl?: string[];
  /** SHA-256 do arquivo montado. Obrigatório pra quem vem em partes: juntar
   * pedaços sem conferir dá arquivo do tamanho certo e conteúdo errado. */
  sha256?: string;
}

/**
 * Onde os pesos moram, além do Hugging Face. Repositório separado e público,
 * contendo SÓ os `.gguf` — nenhum código do produto fica exposto por isso.
 */
const BASE_RELEASE = "https://github.com/silvioAL/gerador-modelos/releases/download/modelos-v1";

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
  sha256: "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5",
  partesUrl: [
    `${BASE_RELEASE}/Qwen3-4B-Q4_K_M.gguf.part-01`,
    `${BASE_RELEASE}/Qwen3-4B-Q4_K_M.gguf.part-02`,
  ],
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
  sha256: "06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439",
  // Cabe inteiro num asset (639 MiB < 2 GiB), então uma "parte" só.
  partesUrl: [`${BASE_RELEASE}/Qwen3-Embedding-0.6B-Q8_0.gguf`],
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
export {
  formatoJsonPorBaseUrl,
  PRESETS_GATEWAY,
  presetGatewayPorId,
  presetsDoModo,
  temVisao,
  type FormatoJson,
  type PresetGateway,
} from "./presets.js";

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
