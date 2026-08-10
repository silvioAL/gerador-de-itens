/**
 * SPEC-31 — os PRESETS de gateway, sem binário nativo.
 *
 * Isto morava em `modelos.ts`, que importa `node-llama-cpp` para descrever os
 * modelos locais. O caminho de gateway precisa do dialeto de JSON por base URL
 * (a Anthropic exige `json_schema`, medido contra a API real) e não pode pagar
 * pelo binário para descobrir isso — foi o que impediu o modo hospedado de
 * escolher o dialeto certo.
 */
export type FormatoJson = "json_object" | "json_schema" | "nenhum";

export interface PresetGateway {
  id: string;
  nome: string;
  baseUrl: string;
  /** Sugestões — o campo continua livre, gateway interno tem nome próprio. */
  modelos: string[];
  modeloPadrao: string;
  /**
   * Dialeto de JSON que o destino aceita — MEDIDO contra a API real, não lido
   * na documentação. A da Anthropic diz que `response_format` é "ignored" e a
   * API responde 400 exigindo `json_schema`.
   */
  formatoJson: FormatoJson;
  /** SPEC-30 — endereço da transcrição, quando o destino do chat não
   * transcreve. É o caso do Ollama: ele serve texto, não áudio. */
  baseUrlTranscricao?: string;
  /** Onde a pessoa consegue a chave. */
  urlChave?: string;
  observacao: string;
  /** Em quais modos este destino é alcançável. Ausente = nos dois (endereço na
   * internet vale de qualquer lugar). Ver `presetsDoModo`. */
  modos?: ("local" | "hospedado")[];
}

export const PRESETS_GATEWAY: PresetGateway[] = [
  {
    id: "anthropic",
    nome: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com/v1",
    modelos: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    modeloPadrao: "claude-sonnet-5",
    // Structured Outputs: garantia MAIS FORTE que json_object.
    formatoJson: "json_schema",
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
    formatoJson: "json_object",
    urlChave: "https://platform.deepseek.com/api_keys",
    observacao: "Cobrança por uso. `deepseek-reasoner` pensa antes de responder e custa mais.",
  },
  {
    id: "ollama",
    nome: "Ollama (na sua máquina)",
    baseUrl: "http://localhost:11434/v1",
    // Mesmo motivo do preset de baixo; no modo local o Whisper do compose é
    // alcançável pela porta publicada.
    baseUrlTranscricao: "http://localhost:9000/v1",
    // `qwen2.5`, não `qwen3`: ver a observação do preset de baixo — a diferença
    // é de minutos para segundos, medida contra esta stack.
    modelos: ["qwen2.5:7b", "qwen2.5:3b", "llama3.1:8b"],
    modeloPadrao: "qwen2.5:7b",
    formatoJson: "json_object",
    observacao: "Roda local, sem custo e sem sair da máquina. A chave é ignorada pelo Ollama — preencha qualquer coisa.",
    modos: ["local"],
  },
  {
    id: "ollama-docker",
    nome: "Qwen no Docker (junto do servidor)",
    // `ollama`, não `localhost`: quem faz esta chamada é o CONTAINER do server,
    // e ali `localhost` é ele mesmo. É o nome do serviço no docker-compose que
    // resolve pro container certo, e foi exatamente o que faltava pro preset
    // "Ollama" existente servir no modo hospedado.
    baseUrl: "http://ollama:11434/v1",
    // O Ollama NÃO transcreve — a voz vai pro serviço `whisper` do mesmo
    // compose. Sem isto, o botão de falar apareceria e morreria em 404.
    baseUrlTranscricao: "http://whisper:9000/v1",
    /**
     * `qwen2.5`, NÃO `qwen3` — medido contra esta stack, em CPU:
     *
     * | modelo       | por campo | JSON certo de primeira |
     * |--------------|-----------|------------------------|
     * | `qwen2.5:3b` |     5,5 s | sim                    |
     * | `qwen2.5:7b` |    16,3 s | sim                    |
     * | `qwen3:4b`   |   ~22 min | não, só no retry       |
     *
     * `qwen3` é modelo de RACIOCÍNIO: o Ollama põe o pensamento em
     * `message.reasoning`, e ele consome o mesmo orçamento de `max_tokens`. Com
     * teto baixo a resposta volta vazia (`finish_reason: "length"`, `content`
     * em branco); com teto alto ela chega, gastando minutos por campo. Bom
     * modelo, uso errado — a esteira quer estrutura, não deliberação.
     */
    modelos: ["qwen2.5:7b", "qwen2.5:3b"],
    modeloPadrao: "qwen2.5:7b",
    formatoJson: "json_object",
    observacao:
      "O modelo roda num container ao lado do servidor: nada sai da sua rede, e nenhuma chamada vai pra internet — o caso de quem tem o Claude bloqueado na empresa. Suba com `docker compose --profile ia up -d`. A chave é ignorada pelo Ollama; preencha qualquer coisa. Em CPU, conte ~16s por campo com o 7b (o 3b é ~3x mais rápido e um pouco pior).",
    modos: ["hospedado"],
  },
];

/**
 * Os destinos que fazem sentido em cada modo de execução.
 *
 * A distinção existe por um motivo só, mas decisivo: `localhost` significa
 * coisas diferentes dos dois lados. No `gerador open`, quem chama o gateway é um
 * processo na máquina da pessoa, e `localhost:11434` é o Ollama dela. No modo
 * hospedado, quem chama é o container do server, e `localhost` é ele próprio —
 * o pedido morre em "connection refused" sem nunca sair.
 *
 * Preset sem `modos` aparece nos dois: um endereço na internet (Anthropic,
 * DeepSeek) é o mesmo endereço de qualquer lugar.
 */
export function presetsDoModo(modo: "local" | "hospedado"): PresetGateway[] {
  return PRESETS_GATEWAY.filter((p) => !p.modos || p.modos.includes(modo));
}

export function presetGatewayPorId(id: string): PresetGateway | undefined {
  return PRESETS_GATEWAY.find((p) => p.id === id);
}

/**
 * Deduz o dialeto de JSON pela base URL. É inferência, e não campo que a tela
 * manda, de propósito: `gerador ia conectar` no terminal e o card na aba passam
 * pelo mesmo caminho, e ninguém precisa saber que a Anthropic exige
 * `json_schema` pra configurar o Claude. Destino desconhecido cai no
 * `json_object`, que é o de-facto — e quem tem gateway com dialeto próprio
 * ainda pode gravar `formatoJson` direto na credencial.
 */
export function formatoJsonPorBaseUrl(baseUrl: string | undefined): FormatoJson {
  if (!baseUrl) return "json_object";
  const alvo = baseUrl.replace(/\/+$/, "").toLowerCase();
  const preset = PRESETS_GATEWAY.find((p) => alvo.startsWith(p.baseUrl.replace(/\/+$/, "").toLowerCase()));
  return preset?.formatoJson ?? "json_object";
}
