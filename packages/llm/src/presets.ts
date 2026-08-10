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
    modelos: ["qwen3:4b", "llama3.1:8b"],
    modeloPadrao: "qwen3:4b",
    formatoJson: "json_object",
    observacao: "Roda local, sem custo e sem sair da máquina. A chave é ignorada pelo Ollama — preencha qualquer coisa.",
  },
];

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
