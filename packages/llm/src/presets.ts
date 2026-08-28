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
  /**
   * SPEC-30 Fase 2 — quais modelos DESTE destino enxergam imagem.
   *
   * Por modelo, e não por destino, porque **a base URL não diz**: o mesmo
   * endereço serve `gpt-4o` (vê) e `whisper-1` (não vê); o mesmo Ollama serve
   * `qwen2.5:7b` (não vê) e `qwen2.5vl:7b` (vê). Deduzir do endereço seria
   * repetir o erro do preset de `localhost` (JOURNEY §124) — a informação
   * certa mora onde ela é conhecida.
   *
   * Ausente ou fora da lista = **não vê**. Errar para "não" é deliberado:
   * esconder um botão que funcionaria custa um clique na configuração;
   * oferecer um que falha custa uma conversa inteira.
   */
  modelosComVisao?: string[];
  /** Onde a pessoa consegue a chave. */
  urlChave?: string;
  observacao: string;
  /** Em quais modos este destino é alcançável. Ausente = nos dois (endereço na
   * internet vale de qualquer lugar). Ver `presetsDoModo`. */
  modos?: ("local" | "hospedado")[];
  /**
   * SPEC-74 — este destino NÃO consulta modelo nenhum: as respostas são
   * inventadas pela própria stack, com a forma certa e conteúdo falso.
   *
   * Vive no preset, e não numa constante de endereço solta, porque é o preset
   * que a tela já consulta para tudo o mais que é próprio do destino (dialeto,
   * visão, transcrição). Ausente = destino de verdade.
   */
  simulado?: boolean;
  /**
   * Outros endereços que apontam para o MESMO destino. Viaja para a tela junto
   * com o preset, para o navegador aplicar a mesma régua do servidor em vez de
   * manter uma segunda cópia da lista (§263).
   */
  baseUrlsAlternativas?: string[];
}

/**
 * O serviço de voz que a própria stack traz (`whisper` no docker-compose).
 * Endereço fixo por modo: de dentro do compose o host é o nome do serviço; de
 * fora, `localhost` na porta publicada.
 */
export const WHISPER_DO_MODO: Record<"local" | "hospedado", string> = {
  local: "http://localhost:9000/v1",
  hospedado: "http://whisper:9000/v1",
};

/**
 * SPEC-74 — o endereço do dublê dentro da rede do compose.
 *
 * `gateway-falso`, e não `localhost`, pelo mesmo motivo do `ollama-docker`
 * logo abaixo: quem faz esta chamada é o CONTAINER do servidor, e ali
 * `localhost` é ele mesmo.
 */
export const BASE_URL_SEM_CUSTO = "http://gateway-falso:4123/v1";

/**
 * SPEC-74 — os OUTROS endereços do mesmo dublê.
 *
 * O preset oferece o nome do serviço, porque é o servidor em container quem
 * chama. Mas o mesmo processo também sobe fora do compose (é o que a suíte E2E
 * faz, em `127.0.0.1:4123`), e um destino simulado que não é reconhecido como
 * simulado é justamente o defeito que a fatia D existe para evitar: conteúdo
 * inventado chegando à tela sem marca.
 *
 * Reconhecer por endereço e porta é uma heurística, e ela erra na direção
 * barata: no pior caso alguém que colocou outro serviço em `4123` na própria
 * máquina leva um aviso a mais. O erro caro é o contrário.
 */
export const ENDERECOS_ALTERNATIVOS_SEM_CUSTO = ["http://127.0.0.1:4123", "http://localhost:4123"];

export const PRESETS_GATEWAY: PresetGateway[] = [
  {
    /**
     * SPEC-74 — PRIMEIRO da lista de propósito.
     *
     * O pedido que originou a SPEC foi "o budget da API esgotou". Um destino
     * que não gasta nada só cumpre esse papel se for o mais fácil de escolher:
     * enterrá-lo no fim da lista devolveria o problema, porque a pessoa
     * escolhe o primeiro que reconhece.
     */
    id: "sem-custo",
    nome: "Sem custo (respostas simuladas)",
    baseUrl: BASE_URL_SEM_CUSTO,
    // O mesmo dublê responde chat e áudio — quem configurou um ganhou o outro.
    modelos: ["modelo-de-mentira"],
    // Ele aceita imagem e DIZ que aceitou (é como o E2E prova que o print
    // atravessou o caminho inteiro), então esconder o botão seria mentira na
    // direção contrária.
    modelosComVisao: ["modelo-de-mentira"],
    modeloPadrao: "modelo-de-mentira",
    // Ele lê o schema do PROMPT, que é o que `json_object` produz — e é o
    // mesmo dialeto que `formatoJsonPorBaseUrl` daria a um endereço
    // desconhecido, então os dois caminhos concordam.
    formatoJson: "json_object",
    observacao:
      "Não chama modelo nenhum: as respostas são inventadas pela própria stack, com a forma certa e conteúdo falso. Serve para desenvolver e demonstrar sem gastar API — e tudo o que sai daqui chega marcado como simulado. A chave é `chave-de-mentira-do-e2e`.",
    modos: ["hospedado"],
    simulado: true,
    baseUrlsAlternativas: ENDERECOS_ALTERNATIVOS_SEM_CUSTO,
  },
  {
    id: "anthropic",
    nome: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com/v1",
    modelos: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    // Toda a família Claude 5 enxerga imagem.
    modelosComVisao: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
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
    // Nenhum dos dois vê imagem — a API do DeepSeek é só texto.
    modelosComVisao: [],
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
    baseUrlTranscricao: WHISPER_DO_MODO.local,
    // `qwen2.5`, não `qwen3`: ver a observação do preset de baixo — a diferença
    // é de minutos para segundos, medida contra esta stack.
    modelos: ["qwen2.5:7b", "qwen2.5:3b", "llama3.1:8b", "qwen2.5vl:7b"],
    // Só a variante VL. `qwen2.5:7b` NÃO vê — mesmo endereço, capacidades
    // diferentes, que é exatamente o motivo de isto ser por modelo.
    modelosComVisao: ["qwen2.5vl:7b"],
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
    baseUrlTranscricao: WHISPER_DO_MODO.hospedado,
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
    modelos: ["qwen2.5:7b", "qwen2.5:3b", "qwen2.5vl:7b"],
    modelosComVisao: ["qwen2.5vl:7b"],
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
/**
 * ACHADO REAL: o usuário escolheu o preset da Anthropic, salvou, e ao testar o
 * microfone levou "Este endereço não tem transcrição de áudio (HTTP 404)" — a
 * voz tinha ido para o endereço do CHAT.
 *
 * Nenhum preset de chat-only (Anthropic, DeepSeek) traz `baseUrlTranscricao`, e
 * isso está certo: esses provedores não transcrevem. Só que a stack TEM um
 * Whisper ali do lado, no mesmo compose, com endereço conhecido e fixo — e a
 * pessoa não tem como adivinhar isso.
 *
 * Então o preset passa a SUGERIR o Whisper do modo quando não traz um próprio.
 * Sugerir, não impor: o campo continua editável.
 *
 * Contrapartida assumida: quem sobe o hospedado SEM o profile `ia` não tem
 * Whisper, e o valor sugerido aponta para um host inexistente. Vale mesmo
 * assim — "conexão recusada em whisper" nomeia o passo que falta
 * (`docker compose --profile ia up -d`), enquanto o 404 na API de chat não
 * explica nada.
 */
export function presetsDoModo(modo: "local" | "hospedado"): PresetGateway[] {
  return PRESETS_GATEWAY.filter((p) => !p.modos || p.modos.includes(modo)).map((p) =>
    p.baseUrlTranscricao ? p : { ...p, baseUrlTranscricao: WHISPER_DO_MODO[modo] }
  );
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

/**
 * SPEC-30 Fase 2 — este destino, com ESTE modelo, enxerga imagem?
 *
 * Nome do modelo, não base URL: um mesmo endereço serve modelo com e sem
 * visão. Destino desconhecido (gateway interno com nome próprio) responde
 * `false` — e a tela permite marcar à mão, porque nenhuma lista conhece o
 * modelo que a empresa batizou.
 */
export function temVisao(baseUrl: string | undefined, modelo: string | undefined): boolean {
  if (!baseUrl || !modelo) return false;
  const alvo = baseUrl.replace(/\/+$/, "").toLowerCase();
  const preset = PRESETS_GATEWAY.find((p) => alvo.startsWith(p.baseUrl.replace(/\/+$/, "").toLowerCase()));
  return preset?.modelosComVisao?.includes(modelo.trim()) ?? false;
}

/**
 * SPEC-74 fatia D — este destino INVENTA as respostas?
 *
 * Mesma mecânica de `temVisao` e `formatoJsonPorBaseUrl`, e pelo mesmo motivo:
 * o endereço é o que o produto tem para responder, e a resposta mora onde a
 * informação é conhecida — na lista de destinos, não espalhada por quem
 * pergunta.
 *
 * Desconhecido responde `false`, e o erro é deliberado nessa direção: marcar
 * como simulado o que veio de um modelo de verdade seria a ferramenta duvidando
 * de trabalho legítimo. O caminho contrário (conteúdo simulado sem marca) é
 * coberto pela `EVIDENCIA_SIMULADA` gravada no valor no momento da escrita, que
 * viaja com o dado mesmo depois de alguém trocar de destino.
 */
export function ehSimulado(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  const alvo = baseUrl.replace(/\/+$/, "").toLowerCase();
  return PRESETS_GATEWAY.some(
    (p) =>
      p.simulado === true &&
      [p.baseUrl, ...(p.baseUrlsAlternativas ?? [])].some((e) => alvo.startsWith(e.replace(/\/+$/, "").toLowerCase()))
  );
}
