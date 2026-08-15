import { createServer, type Server } from "node:http";

/**
 * SPEC-31 — um gateway compatível com a OpenAI, falso e determinístico, pra
 * exercitar o modo hospedado NO NAVEGADOR.
 *
 * ## Por que isto existe
 *
 * A Fase 4 entregou as rotas de IA do modo hospedado com a suíte do server
 * verde, e mesmo assim **quatro defeitos** chegaram ao usuário. Todos os quatro
 * passavam por `app.inject()` sem reclamar, porque `inject` exercita o
 * *handler* — não o sistema. Ele não faz CORS, não roda num navegador, não tem
 * tela:
 *
 * 1. O streaming escrevia direto em `reply.raw`, pulando os cabeçalhos de CORS
 *    que o `@fastify/cors` já tinha montado. `curl` funcionava, o navegador
 *    bloqueava a leitura — e o lote inteiro sumia sem erro visível.
 * 2. `formatoJson` não era inferido da base URL, então a Anthropic devolvia 400.
 * 3. `/ia/credencial/testar` ignorava o corpo postado, e o primeiro "Testar
 *    conexão" da vida sempre falhava com "nenhuma credencial configurada"
 *    enquanto a pessoa olhava pros campos preenchidos.
 * 4. `/ia/status` devolvia `modelosChat: []`, e a aba "Modelo de IA" não
 *    mostrava formulário nenhum — só um aviso mandando rodar um comando que não
 *    existe em container.
 *
 * Um gateway de verdade não serve pra teste (chave, rede, custo, resposta
 * diferente a cada vez). Este fala o mesmo protocolo — `POST
 * {baseUrl}/chat/completions`, SSE, `Authorization: Bearer` — e responde sempre
 * a mesma coisa. O que ele NÃO faz é fingir: não há mock do `fetch`, o servidor
 * chama HTTP de verdade, e o navegador lê a resposta de verdade.
 */

/** Fixa e obviamente falsa: aparece no teste, no log e em nenhum lugar real. */
export const CHAVE_GATEWAY_FALSO = "chave-de-mentira-do-e2e";

/** Marca que o teste procura na tela — se aparecer, o texto atravessou o
 * caminho inteiro: navegador → server → gateway → SSE → server → navegador. */
export const MARCA_GATEWAY_FALSO = "escrito-pelo-gateway-falso";

export const PORTA_GATEWAY_FALSO = 4123;

export const BASE_URL_GATEWAY_FALSO = `http://127.0.0.1:${PORTA_GATEWAY_FALSO}/v1`;

export const MODELO_GATEWAY_FALSO = "modelo-de-mentira";

/** SPEC-30 Fase 1a — o que o gateway falso "ouve", sempre. Uma frase que soa
 * como demanda ditada, pra o teste conferir que ela chegou no campo certo. */
/** SPEC-30 Fase 2 — aparece na resposta quando o pedido trouxe imagem. */
export const MARCA_VIU_IMAGEM = "viu-a-imagem";

export const TEXTO_TRANSCRITO_FALSO = "criar uma fila do rabbit para propostas aprovadas";

interface CorpoChat {
  messages?: { role: string; content: string | { type?: string; text?: string }[] }[];
  response_format?: { type?: string; json_schema?: { schema?: unknown } };
}

/**
 * `completarEstruturado` sempre anexa o schema ao prompt ("Responda SOMENTE com
 * um objeto JSON que obedeça exatamente a este schema: {...}"), nos dois
 * dialetos. Ler dali cobre `json_object` (que não manda o schema no corpo) e
 * `json_schema` com o mesmo código.
 */
function schemaPedido(corpo: CorpoChat): unknown | null {
  const doCorpo = corpo.response_format?.json_schema?.schema;
  if (doCorpo) return doCorpo;

  // ACHADO do próprio teste de imagem: com anexo, `content` deixa de ser
  // string e vira array de parts. Concatenar direto virava "[object Object]",
  // o dublê não achava o schema, caía no ramo de texto livre e devolvia algo
  // que não era JSON — a tela mostrava "Unexpected token 'e'". O prompt (com o
  // schema) mora na part de texto.
  const texto =
    corpo.messages
      ?.map((m) =>
        typeof m.content === "string" ? m.content : (m.content ?? []).map((parte) => parte?.text ?? "").join("\n")
      )
      .join("\n") ?? "";
  const marca = texto.lastIndexOf("obedeça exatamente a este schema:");
  if (marca < 0) return null;
  const inicio = texto.indexOf("{", marca);
  if (inicio < 0) return null;
  try {
    return JSON.parse(texto.slice(inicio));
  } catch {
    return null;
  }
}

/**
 * Preenche um schema com valores válidos. Não é um gerador de JSON Schema
 * completo e não precisa ser — os schemas deste projeto são gerados por nós
 * mesmos e usam um subconjunto pequeno (object/array/string/boolean/enum), o
 * mesmo que `validarContraSchema` do provedor aceita. Se este preenchimento
 * divergir do que aquele validador exige, o provedor faz retry e o teste
 * demora — o que já é um sinal útil por si só.
 */
function preencher(schema: unknown, caminho = "", sufixo = ""): unknown {
  const s = (schema ?? {}) as Record<string, unknown>;
  if (Array.isArray(s.enum)) return s.enum[0];
  if (s.type === "array") {
    // `minItems` importa: a fatia C pede DUAS alternativas por decisão, e um
    // dublê que devolve sempre um item faria o produto descartar a proposta
    // inteira — o teste falharia por culpa do dublê, não do código. Cada item
    // recebe índice próprio no caminho para os valores não saírem iguais.
    const minimo = typeof s.minItems === "number" && s.minItems > 0 ? s.minItems : 1;
    return Array.from({ length: minimo }, (_, i) => preencher(s.items, `${caminho}[${i}]`, sufixo));
  }
  if (s.type === "boolean") return true;
  if (s.type === "number" || s.type === "integer") return 1;
  if (s.type === "object" || s.properties) {
    const props = (s.properties ?? {}) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(props).map(([chave, sub]) => [chave, preencher(sub, caminho ? `${caminho}.${chave}` : chave, sufixo)])
    );
  }
  // String: o valor precisa ser reconhecível na tela E diferente por campo,
  // senão um teste que confere "o campo certo recebeu o texto certo" passaria
  // com tudo trocado.
  return `${MARCA_GATEWAY_FALSO}${sufixo} (${caminho || "resposta"})`;
}

/** Um evento SSE no formato que `provedorOpenAI.ts` sabe ler. */
function evento(conteudo: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: conteudo } }] })}\n\n`;
}

export function criarGatewayFalso(): Server {
  return createServer((req, res) => {
    // O Playwright espera por isto pra saber que o processo subiu.
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }

    // SPEC-30 Fase 1a — transcrição. O mesmo dublê serve os dois endpoints
    // porque é o mesmo dialeto e a mesma credencial: quem configurou o gateway
    // pra chat ganhou a transcrição junto, e o teste precisa provar isso.
    if (req.url?.endsWith("/audio/transcriptions") && req.method === "POST") {
      if (req.headers.authorization !== `Bearer ${CHAVE_GATEWAY_FALSO}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "credencial recusada pelo gateway falso" }));
        return;
      }
      // Drena o multipart sem parsear: o que este teste prova é que o áudio
      // CHEGOU e que o texto volta pro campo certo, não como o boundary é
      // montado (isso é `provedorOpenAI.test.ts`, contra servidor real).
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(TEXTO_TRANSCRITO_FALSO);
      });
      return;
    }

    if (!req.url?.endsWith("/chat/completions") || req.method !== "POST") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "rota inexistente no gateway falso" }));
      return;
    }

    // Credencial errada tem que doer: sem isto, o teste de "Testar conexão"
    // passaria mesmo se o server esquecesse de mandar a chave.
    if (req.headers.authorization !== `Bearer ${CHAVE_GATEWAY_FALSO}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "credencial recusada pelo gateway falso" }));
      return;
    }

    let bruto = "";
    req.on("data", (pedaco) => (bruto += pedaco));
    req.on("end", () => {
      let corpo: CorpoChat = {};
      try {
        corpo = JSON.parse(bruto) as CorpoChat;
      } catch {
        // Corpo ilegível vira resposta vazia — o provedor trata como erro.
      }

      // SPEC-30 Fase 2: se o pedido trouxe imagem, o dublê diz isso na
      // resposta — é assim que o teste de navegador prova que o print
      // atravessou tela -> servidor -> gateway, e não só que o botão existe.
      const temImagem = (corpo.messages ?? []).some(
        (m) => Array.isArray(m.content) && m.content.some((p: { type?: string }) => p?.type === "image_url")
      );

      const schema = schemaPedido(corpo);
      const texto = schema
        // A marca de imagem entra TAMBÉM no caminho estruturado: `/ia/diagrama`
        // responde JSON, e marcar só o texto livre deixaria o teste de imagem
        // sem como afirmar nada (foi o que aconteceu).
        ? JSON.stringify(preencher(schema, "", temImagem ? ` ${MARCA_VIU_IMAGEM}` : ""))
        : `${MARCA_GATEWAY_FALSO}: ok${temImagem ? ` ${MARCA_VIU_IMAGEM}` : ""}`;

      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      // Em pedaços de verdade, não de uma vez: o caminho de streaming é
      // justamente o que quebrou no navegador, e mandar o corpo inteiro num
      // evento só deixaria de exercitar o buffer entre leituras.
      for (let i = 0; i < texto.length; i += 64) res.write(evento(texto.slice(i, i + 64)));
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
}
