import type { EsquemaJson } from "./esquema.js";
import type { OpcoesGeracao, OpcoesTranscricao, ProvedorIa } from "./tipos.js";
import { buscarDoModelo } from "./rede.js";

/**
 * SPEC-25 Fase 2 — provedor compatível com a API da OpenAI.
 *
 * **Uma implementação, N destinos** (§4.6): o formato `POST
 * {baseUrl}/chat/completions` é o de-facto dos gateways — o wrapper interno da
 * empresa, o DeepSeek oficial, Ollama, vLLM, LiteLLM, OpenRouter. O achado que
 * motivou isso: o usuário **já** chama o DeepSeek por um wrapper corporativo,
 * então um `ProvedorDeepSeekApi` específico teria nascido inútil.
 *
 * Quando o gateway é interno, nada sai da empresa — o que resolve de graça a
 * objeção de privacidade que travaria o uso real.
 *
 * ## Como a estrutura é garantida aqui
 *
 * O provedor local usa GBNF: a grammar torna JSON inválido *impossível*. Aqui
 * não existe esse mecanismo, então a garantia é outra e mais fraca:
 * `response_format: json_object` + **validação contra o schema pedido** + UM
 * retry dizendo o que faltou. Isso é deliberado e está registrado: quem chama
 * (`completarEstruturado`) continua recebendo "JSON válido no schema", e a
 * diferença de como fica encapsulada aqui.
 */
export interface OpcoesProvedorOpenAI {
  baseUrl: string;
  chave: string;
  modelo: string;
  /** Alguns wrappers corporativos exigem cabeçalhos próprios. */
  cabecalhos?: Record<string, string>;
  /**
   * Teto de tokens da resposta. Mandado SEMPRE, com default generoso, porque
   * omitir deixa o corte no default de cada gateway — e esse default não é
   * documentado em todos. Na Anthropic a API nativa **exige** `max_tokens`, e a
   * camada de compatibilidade arbitra um valor por nós: um lote de 5 itens da
   * esteira bate nesse teto e volta cortado, que é exatamente a falha silenciosa
   * mais cara deste projeto (resposta truncada = trabalho perdido sem aviso).
   */
  maxTokens?: number;
  /**
   * Como o destino aceita pedido de JSON. **Medido contra a API real, não lido
   * na documentação**: a tabela da Anthropic diz que `response_format` é
   * "ignored", e na prática ela responde **HTTP 400** —
   * `response_format.type: Input should be 'json_schema'`.
   *
   * - `json_object`: o de-facto da OpenAI (DeepSeek, Ollama, vLLM). Continua
   *   sendo o padrão, porque é o que os gateways já configurados usam.
   * - `json_schema`: Structured Outputs. Manda o schema junto, com
   *   `strict: true` e `additionalProperties: false` em TODO nível de objeto —
   *   os dois são exigidos, cada um descoberto por um 400 diferente. É garantia
   *   mais FORTE que `json_object`, não mais fraca.
   * - `nenhum`: destino que rejeita o campo em qualquer forma. Sobra
   *   `validarContraSchema` + retry — e aí o modelo pode devolver o JSON
   *   embrulhado em cerca de markdown (visto com o Claude sem o campo).
   */
  formatoJson?: FormatoJson;
  /**
   * SPEC-30 Fase 1a — nome do modelo de transcrição no destino. Separado do
   * modelo de chat porque são dois modelos diferentes no mesmo endereço
   * (`gpt-4o` e `whisper-1` convivem). Ausente = `whisper-1`, o nome que os
   * destinos compatíveis espelham.
   */
  modeloTranscricao?: string;
  /**
   * SPEC-30 Fase 1a — endereço da TRANSCRIÇÃO, quando é diferente do chat.
   *
   * Existe por um caso concreto e comum: rodando tudo na própria stack, o chat
   * fica no Ollama (`http://ollama:11434/v1`) e a transcrição num servidor
   * Whisper (`http://whisper:9000/v1`) — o Ollama **não transcreve**. Num
   * destino que faz as duas coisas (OpenAI, Groq), fica ausente e o `baseUrl`
   * serve para ambos.
   */
  baseUrlTranscricao?: string;
  /** Injetável no teste — evita depender de rede real na suíte. */
  fetchImpl?: typeof fetch;
}

export type FormatoJson = "json_object" | "json_schema" | "nenhum";

/**
 * Structured Outputs exige `additionalProperties: false` em cada objeto —
 * inclusive nos aninhados, que é o caso do lote da esteira (um objeto por
 * item). Sem isso: HTTP 400 dizendo exatamente isso.
 */
/**
 * Palavras-chave que Structured Outputs recusa, medido contra a Anthropic:
 *
 * ```
 * HTTP 400 response_format.json_schema.schema:
 *   For 'array' type, property 'maxItems' is not supported
 * ```
 *
 * Mandá-las não deixa a resposta melhor e deixa a chamada IMPOSSÍVEL: o
 * gateway recusa o pedido inteiro. O limite continua existindo onde sempre
 * funcionou de fato — no texto do prompt —, e o schema fica com o que a
 * decodificação restrita sabe impor: forma, tipo e campos obrigatórios.
 *
 * Vale para arrays (`maxItems`/`minItems`) e para strings (`maxLength`/
 * `minLength`), pela mesma razão e com o mesmo custo: nenhum.
 */
const NAO_SUPORTADAS_EM_STRUCTURED_OUTPUTS = ["maxItems", "minItems", "maxLength", "minLength"] as const;

function semPalavrasNaoSuportadas(s: Record<string, unknown>): Record<string, unknown> {
  const copia = { ...s };
  for (const chave of NAO_SUPORTADAS_EM_STRUCTURED_OUTPUTS) delete copia[chave];
  return copia;
}

export function comAdditionalPropertiesFalse(schema: EsquemaJson): EsquemaJson {
  const s = semPalavrasNaoSuportadas(schema as Record<string, unknown>);
  if (s.type === "array" && s.items) {
    return { ...s, items: comAdditionalPropertiesFalse(s.items as EsquemaJson) } as EsquemaJson;
  }
  // `s`, não `schema`: numa folha (ex.: `{type:"string", maxLength:50}`) devolver
  // o original desfaria a limpeza logo onde ela mais aparece.
  if (s.type !== "object" && !s.properties) return s as EsquemaJson;
  const props = (s.properties ?? {}) as Record<string, EsquemaJson>;
  return {
    ...s,
    additionalProperties: false,
    properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, comAdditionalPropertiesFalse(v)])),
  } as EsquemaJson;
}

interface DeltaStream {
  choices?: {
    /** Por que o modelo parou. `"length"` = bateu no teto de `max_tokens`, e a
     * resposta esta CORTADA. O gateway sempre manda; nos ignoravamos. */
    finish_reason?: string | null;
    delta?: {
      content?: string;
      /** DeepSeek e alguns gateways expõem o raciocínio num campo próprio.
       * Ele NÃO entra na resposta: vira o estado "pensando…" da UI, igual ao
       * `<think>` do modelo local. */
      reasoning_content?: string;
    };
  }[];
}

/**
 * Alto o bastante pro maior pedido real da esteira (um lote de 5 itens com
 * ficha técnica completa) e dentro do que todo destino da lista aceita. Um teto
 * explícito e folgado é melhor que nenhum: sem ele, quem escolhe é o gateway.
 */
const MAX_TOKENS_PADRAO = 8192;

/**
 * ACHADO da tarefa #270 — "o lote volta truncado", sem ninguém saber por quê.
 *
 * A causa não estava escondida: **o gateway sempre disse.** Toda resposta
 * compatível com a OpenAI traz `finish_reason`, e `"length"` significa
 * exatamente "parei porque bati no teto de `max_tokens`, o que você tem está
 * cortado". Nós líamos só o `content` e jogávamos o motivo fora — então a
 * resposta chegava pela metade, o `JSON.parse` falhava, e o sintoma virava
 * "truncou" em vez de "estourou o teto".
 *
 * Isso importa porque muda a AÇÃO. Truncamento por teto não se resolve com
 * retry: a segunda tentativa tem o mesmo teto e corta no mesmo lugar — é
 * gastar o tempo da pessoa duas vezes pro mesmo resultado. O que resolve é
 * pedir menos de uma vez (lote menor) ou levantar o teto onde o destino
 * permite.
 *
 * Por isso falha aqui, alto e explícito, em vez de devolver texto pela metade
 * pra quem chamou tentar interpretar.
 */
function exigirRespostaInteira(motivo: string | null | undefined, texto: string): void {
  if (motivo !== "length") return;
  const aprox = Math.round(texto.length / 4);
  throw new Error(
    `A resposta foi CORTADA no teto de tokens (finish_reason: "length") — vieram ~${aprox} tokens. ` +
      `Não é falha de rede e repetir não adianta: o teto é o mesmo. ` +
      `Reduza o tamanho do lote (menos itens por chamada) ou levante o teto do modelo, se o destino permitir.`
  );
}


/** Erro com a mensagem já pronta pra tela — o resto da stack não interessa a
 * quem está configurando um gateway. */
type Operacao = "chat" | "transcricao";

/**
 * ACHADO (apontado pelo usuário): a mensagem genérica não bastava.
 *
 * Um 404 na transcrição dizia *"confira a base URL"* — e a base URL do chat
 * estava CERTA: o que faltava era o serviço de voz de pé. Quem lesse aquilo iria
 * mexer no campo que já estava correto.
 *
 * A regra aqui: toda mensagem diz **o que aconteceu** e **o próximo passo**. O
 * status HTTP sozinho é informação para quem escreveu o código, não para quem
 * está tentando usar a ferramenta.
 */
function erroDeGateway(status: number, corpo: string, operacao: Operacao = "chat"): Error {
  const detalhe = corpo.slice(0, 300);

  if (status === 401 || status === 403) {
    return new Error(
      `Credencial recusada pelo gateway (HTTP ${status}). Confira a chave de API na aba "Modelo de IA".`
    );
  }

  if (status === 404) {
    return new Error(
      operacao === "transcricao"
        ? "Este endereço não tem transcrição de áudio (HTTP 404). Se você usa o Qwen no Docker, o Ollama não transcreve — suba o serviço de voz com `docker compose --profile ia up -d`. Se é um gateway da empresa, confirme com o time dele se `/audio/transcriptions` está publicado."
        : "Endpoint não encontrado (HTTP 404) — confira a base URL na aba \"Modelo de IA\"."
    );
  }

  // Modelo sem visão recebendo imagem: o destino responde 400 e cita a parte
  // que não entendeu. Sem tratar, a pessoa via um dump de JSON e não sabia que
  // o problema era a marcação "este modelo enxerga imagem".
  if (status === 400 && /image|vision|multimodal|content.*part/i.test(detalhe)) {
    return new Error(
      `O modelo configurado não aceita imagem. Desmarque "Este modelo enxerga imagem" na aba "Modelo de IA", ou troque para um modelo com visão (ex.: qwen2.5vl no Ollama, ou um Claude). Resposta do gateway: ${detalhe}`
    );
  }

  if (status === 413) {
    return new Error(
      `O gateway recusou o tamanho do envio (HTTP 413). Se anexou imagem, use um print menor; se é áudio, grave menos tempo.`
    );
  }

  if (status === 429) {
    return new Error(`O gateway está limitando as chamadas (HTTP 429). Espere um pouco e tente de novo.`);
  }

  return new Error(`Gateway respondeu HTTP ${status}: ${detalhe}`);
}

/**
 * Checagem estrutural mínima do que voltou contra o schema pedido: chaves
 * obrigatórias presentes e tipos batendo no primeiro nível (e dentro de
 * arrays/objetos aninhados). Não é um validador de JSON Schema completo, e não
 * precisa ser — os schemas deste projeto são gerados por nós mesmos e usam um
 * subconjunto pequeno (object/array/string/boolean/enum). O objetivo é pegar a
 * falha real que acontece: campo faltando ou tipo trocado.
 */
export function validarContraSchema(valor: unknown, schema: EsquemaJson): string[] {
  const problemas: string[] = [];
  const s = schema as Record<string, unknown>;

  if (Array.isArray(s.enum)) {
    if (!s.enum.includes(valor as never)) problemas.push(`valor "${String(valor)}" fora do conjunto permitido`);
    return problemas;
  }
  if (s.type === "array") {
    if (!Array.isArray(valor)) return [`esperado array, veio ${typeof valor}`];
    if (s.items) valor.forEach((v, i) => problemas.push(...validarContraSchema(v, s.items as EsquemaJson).map((p) => `[${i}] ${p}`)));
    return problemas;
  }
  if (s.type === "object" || s.properties) {
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
      return [`esperado objeto, veio ${Array.isArray(valor) ? "array" : typeof valor}`];
    }
    const obj = valor as Record<string, unknown>;
    for (const chave of (s.required as string[] | undefined) ?? []) {
      if (!(chave in obj)) problemas.push(`falta a chave "${chave}"`);
    }
    for (const [chave, sub] of Object.entries((s.properties as Record<string, EsquemaJson>) ?? {})) {
      if (chave in obj) problemas.push(...validarContraSchema(obj[chave], sub).map((p) => `"${chave}": ${p}`));
    }
    return problemas;
  }
  if (s.type === "string" && typeof valor !== "string") problemas.push(`esperado string, veio ${typeof valor}`);
  if (s.type === "boolean" && typeof valor !== "boolean") problemas.push(`esperado boolean, veio ${typeof valor}`);
  if ((s.type === "number" || s.type === "integer") && typeof valor !== "number") {
    problemas.push(`esperado número, veio ${typeof valor}`);
  }
  return problemas;
}

/** Extrai o JSON de uma resposta que pode vir cercada de cerca de código ou
 * texto — `json_object` não é obedecido por todo gateway. */
function extrairJson(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(limpo);
  } catch {
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) return JSON.parse(limpo.slice(inicio, fim + 1));
    throw new Error("a resposta do gateway não era JSON válido");
  }
}

/**
 * SPEC-30 Fase 1a — modelo de transcrição, quando o destino não diz qual usar.
 *
 * `whisper-1` é o nome que a OpenAI usa e que a maioria dos gateways
 * compatíveis espelha. Configurável porque wrapper interno costuma ter nome
 * próprio, exatamente como o modelo de chat.
 */
const MODELO_TRANSCRICAO_PADRAO = "whisper-1";

/** Extensão que combina com o MIME — o endpoint decide o decodificador pelo
 * nome do arquivo, e mandar `.bin` faz destino sério recusar. */
function extensaoDe(formato: string): string {
  const base = formato.split(";")[0].trim().toLowerCase();
  const conhecidos: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
  };
  return conhecidos[base] ?? "webm";
}


/**
 * SPEC-30 Fase 2 — anexa imagens à ÚLTIMA mensagem do usuário, no formato de
 * content-parts que os destinos compatíveis com OpenAI aceitam.
 *
 * `content` deixa de ser string e vira array (`{type:"text"}` +
 * `{type:"image_url"}`). Só a última mensagem muda: as anteriores são histórico,
 * e reanexar a imagem em cada turno multiplicaria o custo de tokens sem
 * acrescentar informação.
 *
 * Sem imagem, a forma antiga (string) é preservada byte a byte — destino que
 * não entende content-parts continua funcionando como antes.
 */
function comImagens(
  mensagens: { role: string; content: string }[],
  imagens: string[] | undefined
): { role: string; content: unknown }[] {
  if (!imagens?.length) return mensagens;
  const ultimo = mensagens.length - 1;
  return mensagens.map((m, i) =>
    i === ultimo
      ? {
          role: m.role,
          content: [
            { type: "text", text: m.content },
            ...imagens.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        }
      : m
  );
}

export function criarProvedorCompativelOpenAI(opcoes: OpcoesProvedorOpenAI): ProvedorIa {
  const fetchFn = opcoes.fetchImpl ?? fetch;
  // §193 — a GERAÇÃO não pode usar o `fetch` global: ele corta a conexão em
  // 300 s e o trabalho do papel inteiro se perde (ver TIMEOUTS_DE_INFERENCIA).
  // A transcrição continua no `fetch` comum: áudio de segundos nunca chega
  // perto do limite, e o dublê global do teste #286 mede o destino por lá.
  const fetchGeracao = opcoes.fetchImpl ?? buscarDoModelo;
  const url = `${opcoes.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const urlTranscricao = `${(opcoes.baseUrlTranscricao || opcoes.baseUrl).replace(/\/$/, "")}/audio/transcriptions`;

  const modoJson: FormatoJson = opcoes.formatoJson ?? "json_object";

  /** O que vai no corpo pra pedir JSON, no dialeto que o destino aceita. */
  function pedidoDeJson(schema?: EsquemaJson): Record<string, unknown> {
    if (modoJson === "nenhum") return {};
    if (modoJson === "json_schema") {
      if (!schema) return {};
      return {
        response_format: {
          type: "json_schema",
          json_schema: { name: "resposta", strict: true, schema: comAdditionalPropertiesFalse(schema) },
        },
      };
    }
    return { response_format: { type: "json_object" } };
  }

  async function chamar(
    mensagens: { role: string; content: string }[],
    formatoJson: boolean,
    onTexto?: (pedaco: string) => void,
    schema?: EsquemaJson,
    imagens?: string[]
  ): Promise<string> {
    const resposta = await fetchGeracao(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opcoes.chave}`,
        ...opcoes.cabecalhos,
      },
      body: JSON.stringify({
        model: opcoes.modelo,
        messages: comImagens(mensagens, imagens),
        stream: true,
        max_tokens: opcoes.maxTokens ?? MAX_TOKENS_PADRAO,
        ...(formatoJson ? pedidoDeJson(schema) : {}),
      }),
    });

    if (!resposta.ok) throw erroDeGateway(resposta.status, await resposta.text().catch(() => ""));

    const leitor = resposta.body?.getReader();
    if (!leitor) return "";

    const decodificador = new TextDecoder();
    let buffer = "";
    let completo = "";
    let bruto = "";
    let viuEventoSse = false;
    let motivoParada: string | null | undefined;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      const pedacoBruto = decodificador.decode(value, { stream: true });
      bruto += pedacoBruto;
      buffer += pedacoBruto;
      // SSE: eventos separados por linha em branco, cada um "data: {...}".
      // O buffer entre leituras é obrigatório — o gateway pode fechar o
      // pacote TCP no meio de um `data:`, e sem ele esse pedaço vira JSON
      // inválido e some.
      const linhas = buffer.split("\n");
      buffer = linhas.pop() ?? "";
      for (const linha of linhas) {
        const dado = linha.trim();
        if (!dado.startsWith("data:")) continue;
        viuEventoSse = true;
        const carga = dado.slice(5).trim();
        if (carga === "[DONE]") continue;
        try {
          const evento = JSON.parse(carga) as DeltaStream;
          // O motivo da parada chega no ULTIMO evento, junto de um delta
          // vazio. Guardar em vez de ignorar e a diferenca entre "voltou
          // truncado" e "bateu no teto de tokens".
          motivoParada = evento.choices?.[0]?.finish_reason ?? motivoParada;
          const pedaco = evento.choices?.[0]?.delta?.content;
          // `reasoning_content` é ignorado de propósito: é raciocínio, não
          // resposta — mesma regra do `<think>` no provedor local.
          if (pedaco) {
            completo += pedaco;
            onTexto?.(pedaco);
          }
        } catch {
          // Evento parcial ou keep-alive: ignora, o próximo fecha.
        }
      }
    }

    // Gateway que ignora `stream: true` e responde o corpo inteiro de uma vez.
    // A detecção é pelo que CHEGOU, não pelo Content-Type: no fetch do Node o
    // corpo é sempre um stream, e header errado é comum em wrapper caseiro.
    if (!viuEventoSse && bruto.trim()) {
      try {
        const corpo = JSON.parse(bruto) as {
          choices?: { finish_reason?: string | null; message?: { content?: string } }[];
        };
        const texto = corpo.choices?.[0]?.message?.content ?? "";
        exigirRespostaInteira(corpo.choices?.[0]?.finish_reason, texto);
        if (texto) onTexto?.(texto);
        return texto;
      } catch {
        // Nem SSE nem JSON de resposta: devolve o que veio e deixa quem
        // chamou decidir (em `completarEstruturado`, vira retry).
        return bruto;
      }
    }
    exigirRespostaInteira(motivoParada, completo);
    return completo;
  }

  return {
    id: "compativel-openai",
    nome: `${opcoes.modelo} (gateway)`,
    async completar(prompt, opcoesGeracao?: OpcoesGeracao) {
      return chamar([{ role: "user", content: prompt }], false, opcoesGeracao?.onTexto, undefined, opcoesGeracao?.imagens);
    },
    async completarEstruturado(prompt, schema, opcoesGeracao?: OpcoesGeracao) {
      const instrucao = [
        prompt,
        ``,
        `Responda SOMENTE com um objeto JSON que obedeça exatamente a este schema:`,
        JSON.stringify(schema),
      ].join("\n");

      const mensagens = [{ role: "user", content: instrucao }];
      let texto = await chamar(mensagens, true, opcoesGeracao?.onTexto, schema, opcoesGeracao?.imagens);
      let valor: unknown;
      let problemas: string[];
      try {
        valor = extrairJson(texto);
        problemas = validarContraSchema(valor, schema);
      } catch (erro) {
        valor = undefined;
        problemas = [erro instanceof Error ? erro.message : String(erro)];
      }

      if (problemas.length === 0) return valor;

      // O que já foi streamado é lixo a partir daqui: avisa antes de mandar
      // a segunda tentativa pelo mesmo canal (ver `OpcoesGeracao.onReiniciar`).
      opcoesGeracao?.onReiniciar?.();

      // UM retry, dizendo o que faltou. Sem GBNF a garantia é probabilística;
      // insistir mais que uma vez só gastaria tempo do usuário — se o gateway
      // erra duas vezes com o defeito apontado, o problema é dele.
      const retry = await chamar(
        [
          ...mensagens,
          { role: "assistant", content: texto },
          {
            role: "user",
            content: `A resposta não obedeceu ao schema: ${problemas.join("; ")}. Responda de novo, SOMENTE o JSON válido.`,
          },
        ],
        true,
        opcoesGeracao?.onTexto,
        undefined,
        // ACHADO do teste: sem repassar aqui, a segunda tentativa responderia
        // sobre um print que ela não viu — o pedido é o MESMO, só a instrução
        // de formato muda.
        opcoesGeracao?.imagens
      );
      texto = retry;
      try {
        valor = extrairJson(texto);
        problemas = validarContraSchema(valor, schema);
      } catch (erro) {
        problemas = [erro instanceof Error ? erro.message : String(erro)];
      }
      if (problemas.length > 0) {
        throw new Error(`O gateway não devolveu JSON no formato pedido: ${problemas.join("; ")}`);
      }
      return valor;
    },
    /**
     * SPEC-30 Fase 1a. `multipart/form-data` com o arquivo, no formato de-facto
     * da OpenAI (`/audio/transcriptions`) — o mesmo que Groq e wrappers
     * corporativos espelham.
     *
     * O áudio vai como o navegador gravou (WebM/Opus), sem conversão: quem
     * decodifica é o destino. É a vantagem concreta deste adaptador sobre o
     * local, que exige WAV 16 kHz mono e, portanto, `ffmpeg` no meio.
     */
    async transcrever(audio: Uint8Array, opcoesTranscricao: OpcoesTranscricao) {
      const forma = new FormData();
      const bytes = new Uint8Array(audio);
      forma.append(
        "file",
        new Blob([bytes], { type: opcoesTranscricao.formato }),
        `fala.${extensaoDe(opcoesTranscricao.formato)}`
      );
      forma.append("model", opcoes.modeloTranscricao ?? MODELO_TRANSCRICAO_PADRAO);
      // Sigla e nome de sistema em português são o vocabulário desta
      // ferramenta, e é exatamente onde transcrição sem dica de idioma erra.
      if (opcoesTranscricao.idioma) forma.append("language", opcoesTranscricao.idioma);
      // `prompt` é o `initial_prompt` do Whisper: enviesa o vocabulário sem
      // treinar nada. É o que transforma "rabitém IKEA" em "RabbitMQ" — ver
      // `OpcoesTranscricao.vocabulario` para a medição.
      if (opcoesTranscricao.vocabulario) forma.append("prompt", opcoesTranscricao.vocabulario);
      // `text` em vez de `json`: a resposta é uma frase, e pedir JSON só
      // adicionaria um formato a desembrulhar (e a divergir entre gateways).
      forma.append("response_format", "text");

      const resposta = await fetchFn(urlTranscricao, {
        method: "POST",
        // Sem `Content-Type` de propósito: o `fetch` monta o boundary do
        // multipart sozinho, e declarar à mão quebra o parse do outro lado.
        headers: { Authorization: `Bearer ${opcoes.chave}`, ...opcoes.cabecalhos },
        body: forma,
      });

      if (!resposta.ok) {
        throw erroDeGateway(resposta.status, await resposta.text().catch(() => ""), "transcricao");
      }

      const texto = (await resposta.text()).trim();
      // Gateway que ignora `response_format: text` e devolve JSON assim mesmo —
      // acontece, e o custo de tolerar é uma linha.
      if (texto.startsWith("{")) {
        try {
          const corpo = JSON.parse(texto) as { text?: string };
          if (typeof corpo.text === "string") return corpo.text.trim();
        } catch {
          // Não era JSON de verdade: devolve o texto como veio.
        }
      }
      return texto;
    },
    async descartar() {
      // Nada a liberar: não há modelo na memória, só HTTP.
    },
  };
}
