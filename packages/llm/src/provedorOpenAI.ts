import type { EsquemaJson } from "./esquema.js";
import type { OpcoesGeracao, ProvedorIa } from "./tipos.js";

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
  /** Injetável no teste — evita depender de rede real na suíte. */
  fetchImpl?: typeof fetch;
}

export type FormatoJson = "json_object" | "json_schema" | "nenhum";

/**
 * Structured Outputs exige `additionalProperties: false` em cada objeto —
 * inclusive nos aninhados, que é o caso do lote da esteira (um objeto por
 * item). Sem isso: HTTP 400 dizendo exatamente isso.
 */
export function comAdditionalPropertiesFalse(schema: EsquemaJson): EsquemaJson {
  const s = schema as Record<string, unknown>;
  if (s.type === "array" && s.items) {
    return { ...s, items: comAdditionalPropertiesFalse(s.items as EsquemaJson) } as EsquemaJson;
  }
  if (s.type !== "object" && !s.properties) return schema;
  const props = (s.properties ?? {}) as Record<string, EsquemaJson>;
  return {
    ...s,
    additionalProperties: false,
    properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, comAdditionalPropertiesFalse(v)])),
  } as EsquemaJson;
}

interface DeltaStream {
  choices?: {
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

/** Erro com a mensagem já pronta pra tela — o resto da stack não interessa a
 * quem está configurando um gateway. */
function erroDeGateway(status: number, corpo: string): Error {
  const detalhe = corpo.slice(0, 300);
  if (status === 401 || status === 403) return new Error(`Credencial recusada pelo gateway (HTTP ${status}).`);
  if (status === 404) return new Error(`Endpoint não encontrado — confira a base URL (HTTP 404).`);
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

export function criarProvedorCompativelOpenAI(opcoes: OpcoesProvedorOpenAI): ProvedorIa {
  const fetchFn = opcoes.fetchImpl ?? fetch;
  const url = `${opcoes.baseUrl.replace(/\/$/, "")}/chat/completions`;

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
    schema?: EsquemaJson
  ): Promise<string> {
    const resposta = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opcoes.chave}`,
        ...opcoes.cabecalhos,
      },
      body: JSON.stringify({
        model: opcoes.modelo,
        messages: mensagens,
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
        const corpo = JSON.parse(bruto) as { choices?: { message?: { content?: string } }[] };
        const texto = corpo.choices?.[0]?.message?.content ?? "";
        if (texto) onTexto?.(texto);
        return texto;
      } catch {
        // Nem SSE nem JSON de resposta: devolve o que veio e deixa quem
        // chamou decidir (em `completarEstruturado`, vira retry).
        return bruto;
      }
    }
    return completo;
  }

  return {
    id: "compativel-openai",
    nome: `${opcoes.modelo} (gateway)`,
    async completar(prompt, opcoesGeracao?: OpcoesGeracao) {
      return chamar([{ role: "user", content: prompt }], false, opcoesGeracao?.onTexto);
    },
    async completarEstruturado(prompt, schema, opcoesGeracao?: OpcoesGeracao) {
      const instrucao = [
        prompt,
        ``,
        `Responda SOMENTE com um objeto JSON que obedeça exatamente a este schema:`,
        JSON.stringify(schema),
      ].join("\n");

      const mensagens = [{ role: "user", content: instrucao }];
      let texto = await chamar(mensagens, true, opcoesGeracao?.onTexto, schema);
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
        opcoesGeracao?.onTexto
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
    async descartar() {
      // Nada a liberar: não há modelo na memória, só HTTP.
    },
  };
}
