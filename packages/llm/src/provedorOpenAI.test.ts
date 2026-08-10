import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarProvedorCompativelOpenAI, validarContraSchema } from "./provedorOpenAI.js";
import type { EsquemaJson } from "./esquema.js";

/**
 * SPEC-25 §8.1 — o provedor nasce DORMENTE, mas testado contra um servidor
 * HTTP de verdade (não um `fetch` mockado). A diferença importa: o dia em que
 * o token corporativo sair, o que precisa funcionar é o wire — cabeçalhos,
 * SSE quebrado no meio de um chunk, `[DONE]`, status de erro. Um mock de
 * `fetch` provaria só que o código chama o que ele mesmo espera.
 */

let servidor: Server;
let baseUrl: string;
let pedidos: {
  corpo: Record<string, unknown>;
  /** O corpo como chegou. Necessário desde a SPEC-30: transcrição manda
   * `multipart/form-data`, que não é JSON e não pode ser parseado como tal. */
  bruto: string;
  url: string;
  cabecalhos: IncomingMessage["headers"];
}[] = [];
/** Cada resposta é consumida em ordem — permite testar o retry. */
let respostas: ((res: ServerResponse) => void)[] = [];

function sse(...eventos: unknown[]): (res: ServerResponse) => void {
  return (res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const e of eventos) res.write(`data: ${JSON.stringify(e)}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  };
}

/** Um SSE com o texto todo num delta só — o formato mais comum de gateway. */
function sseTexto(texto: string): (res: ServerResponse) => void {
  return sse({ choices: [{ delta: { content: texto } }] });
}

beforeEach(async () => {
  pedidos = [];
  respostas = [];
  servidor = createServer((req, res) => {
    let bruto = "";
    req.on("data", (p) => (bruto += p));
    req.on("end", () => {
      const ehJson = (req.headers["content-type"] ?? "").includes("application/json");
      pedidos.push({
        corpo: ehJson ? JSON.parse(bruto || "{}") : {},
        bruto,
        url: req.url ?? "",
        cabecalhos: req.headers,
      });
      const proxima = respostas.shift();
      if (!proxima) {
        res.writeHead(500).end("sem resposta programada");
        return;
      }
      proxima(res);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  baseUrl = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/v1`;
});

afterEach(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

function provedor(cabecalhos?: Record<string, string>) {
  return criarProvedorCompativelOpenAI({ baseUrl, chave: "sk-secreta", modelo: "deepseek-chat", cabecalhos });
}

const schemaAlteracoes: EsquemaJson = {
  type: "object",
  properties: {
    alteracoes: {
      type: "array",
      items: {
        type: "object",
        properties: { campo: { type: "string" }, valor: { type: "string" } },
        required: ["campo", "valor"],
      },
    },
  },
  required: ["alteracoes"],
};

describe("ProvedorCompativelOpenAI — o wire (SPEC-25 Fase 2)", () => {
  it("chama {baseUrl}/chat/completions com Bearer, modelo e stream", async () => {
    respostas.push(sseTexto("olá"));
    const texto = await provedor().completar("oi");

    expect(texto).toBe("olá");
    expect(pedidos[0].cabecalhos.authorization).toBe("Bearer sk-secreta");
    expect(pedidos[0].corpo.model).toBe("deepseek-chat");
    expect(pedidos[0].corpo.stream).toBe(true);
    // `completar` é texto livre: pedir json_object aqui deformaria a resposta.
    expect(pedidos[0].corpo.response_format).toBeUndefined();
  });

  it("manda max_tokens SEMPRE — sem isso quem escolhe o corte é o gateway", async () => {
    // A API nativa da Anthropic exige `max_tokens`, então a camada de
    // compatibilidade arbitra um valor por nós quando ele falta — e esse valor
    // não é documentado. Um lote de 5 itens da esteira bate nesse teto e volta
    // cortado: exatamente a falha silenciosa mais cara deste projeto.
    respostas.push(sseTexto("ok"));
    await provedor().completar("oi");
    expect(pedidos[0].corpo.max_tokens).toBe(8192);
  });

  it("max_tokens é configurável — gateway com teto próprio não fica refém do default", async () => {
    respostas.push(sseTexto("ok"));
    const p = criarProvedorCompativelOpenAI({ baseUrl, chave: "k", modelo: "m", maxTokens: 2048 });
    await p.completar("oi");
    expect(pedidos[0].corpo.max_tokens).toBe(2048);
  });

  it("formatoJson json_schema manda o SCHEMA, com strict e additionalProperties:false", async () => {
    // MEDIDO contra a API real da Anthropic, não lido na doc (que diz
    // "ignored"): sem `strict` dá 400 "Field required"; sem
    // `additionalProperties: false` dá 400 dizendo isso em cada objeto.
    respostas.push(sseTexto('{"a":"x"}'));
    const p = criarProvedorCompativelOpenAI({ baseUrl, chave: "k", modelo: "m", formatoJson: "json_schema" });
    await p.completarEstruturado("oi", {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    } as never);

    const rf = pedidos[0].corpo.response_format as {
      type: string;
      json_schema: { strict: boolean; schema: Record<string, unknown> };
    };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema.additionalProperties).toBe(false);
  });

  it("json_schema desce nos objetos ANINHADOS — o lote da esteira é um objeto por item", async () => {
    respostas.push(sseTexto('{"n0":{"h":"x"}}'));
    const p = criarProvedorCompativelOpenAI({ baseUrl, chave: "k", modelo: "m", formatoJson: "json_schema" });
    await p.completarEstruturado("oi", {
      type: "object",
      properties: { n0: { type: "object", properties: { h: { type: "string" } }, required: ["h"] } },
      required: ["n0"],
    } as never);

    const schema = (pedidos[0].corpo.response_format as { json_schema: { schema: Record<string, never> } }).json_schema
      .schema;
    expect(schema.additionalProperties).toBe(false);
    expect((schema.properties as Record<string, { additionalProperties: boolean }>).n0.additionalProperties).toBe(false);
  });

  it("formatoJson nenhum não manda o campo — gateway que rejeita em qualquer forma", async () => {
    respostas.push(sseTexto('{"a":"x"}'));
    const p = criarProvedorCompativelOpenAI({ baseUrl, chave: "k", modelo: "m", formatoJson: "nenhum" });
    await p.completarEstruturado("oi", { type: "object", properties: { a: { type: "string" } } } as never);
    expect(pedidos[0].corpo.response_format).toBeUndefined();
  });

  it("o padrão continua json_object — não quebra gateway já configurado", async () => {
    respostas.push(sseTexto('{"a":"x"}'));
    const p = criarProvedorCompativelOpenAI({ baseUrl, chave: "k", modelo: "m" });
    await p.completarEstruturado("oi", { type: "object", properties: { a: { type: "string" } } } as never);
    expect(pedidos[0].corpo.response_format).toEqual({ type: "json_object" });
  });

  it("manda os cabeçalhos extras — é o que faz um wrapper corporativo funcionar", async () => {
    respostas.push(sseTexto("ok"));
    await provedor({ "X-Time": "plataforma" }).completar("oi");
    expect(pedidos[0].cabecalhos["x-time"]).toBe("plataforma");
  });

  it("barra sobrando na base URL não vira // no caminho", async () => {
    respostas.push(sseTexto("ok"));
    const p = criarProvedorCompativelOpenAI({ baseUrl: `${baseUrl}/`, chave: "k", modelo: "m" });
    await expect(p.completar("oi")).resolves.toBe("ok");
  });

  it("streama pedaço a pedaço — é o que alimenta o texto aparecendo no campo", async () => {
    respostas.push(
      sse(
        { choices: [{ delta: { content: "Como " } }] },
        { choices: [{ delta: { content: "cliente, " } }] },
        { choices: [{ delta: { content: "quero…" } }] }
      )
    );
    const pedacos: string[] = [];
    const texto = await provedor().completar("oi", { onTexto: (p) => pedacos.push(p) });

    expect(pedacos).toEqual(["Como ", "cliente, ", "quero…"]);
    expect(texto).toBe("Como cliente, quero…");
  });

  it("reasoning_content NÃO entra na resposta — mesma regra do <think> local", async () => {
    respostas.push(
      sse(
        { choices: [{ delta: { reasoning_content: "deixa eu pensar no timeout…" } }] },
        { choices: [{ delta: { content: "150ms" } }] }
      )
    );
    const pedacos: string[] = [];
    const texto = await provedor().completar("oi", { onTexto: (p) => pedacos.push(p) });

    expect(texto).toBe("150ms");
    expect(pedacos.join("")).not.toContain("pensar");
  });

  it("aguenta gateway que não streama (corpo inteiro de uma vez)", async () => {
    respostas.push((res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "resposta inteira" } }] }));
    });
    await expect(provedor().completar("oi")).resolves.toBe("resposta inteira");
  });

  it("401 vira mensagem sobre a credencial, não stack de HTTP", async () => {
    respostas.push((res) => res.writeHead(401).end("Unauthorized"));
    await expect(provedor().completar("oi")).rejects.toThrow(/Credencial recusada/);
  });

  it("404 aponta pra base URL — o erro de configuração mais comum", async () => {
    respostas.push((res) => res.writeHead(404).end("not found"));
    await expect(provedor().completar("oi")).rejects.toThrow(/base URL/);
  });
});

describe("ProvedorCompativelOpenAI — JSON sem GBNF", () => {
  it("pede response_format json_object e devolve o objeto", async () => {
    respostas.push(sseTexto(JSON.stringify({ alteracoes: [{ campo: "_criteriosAceite", valor: "150ms" }] })));
    const valor = await provedor().completarEstruturado("altere", schemaAlteracoes);

    expect(pedidos[0].corpo.response_format).toEqual({ type: "json_object" });
    expect(valor).toEqual({ alteracoes: [{ campo: "_criteriosAceite", valor: "150ms" }] });
  });

  it("o schema vai no prompt — sem GBNF é a única forma de o modelo saber a forma", async () => {
    respostas.push(sseTexto(JSON.stringify({ alteracoes: [] })));
    await provedor().completarEstruturado("altere o item", schemaAlteracoes);

    const mensagens = pedidos[0].corpo.messages as { content: string }[];
    expect(mensagens[0].content).toContain("altere o item");
    expect(mensagens[0].content).toContain('"alteracoes"');
  });

  it("evento SSE partido entre dois chunks TCP não perde texto", async () => {
    // O caso que só aparece contra HTTP real: o gateway pode fechar o pacote
    // no meio de um `data: {...}`. Sem buffer entre leituras, o pedaço vira
    // JSON inválido e some silenciosamente.
    respostas.push((res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const linha = `data: ${JSON.stringify({ choices: [{ delta: { content: "meio-partido" } }] })}\n\n`;
      res.write(linha.slice(0, 20));
      res.write(linha.slice(20));
      res.write("data: [DONE]\n\n");
      res.end();
    });
    await expect(provedor().completar("oi")).resolves.toBe("meio-partido");
  });

  it("desembrulha ```json — gateway que ignora json_object ainda funciona", async () => {
    respostas.push(sseTexto('```json\n{"alteracoes": []}\n```'));
    await expect(provedor().completarEstruturado("x", schemaAlteracoes)).resolves.toEqual({ alteracoes: [] });
  });

  it("resposta fora do schema dispara UM retry dizendo o que faltou", async () => {
    // Primeiro: falta a chave `valor` dentro do item.
    respostas.push(sseTexto(JSON.stringify({ alteracoes: [{ campo: "_criteriosAceite" }] })));
    respostas.push(sseTexto(JSON.stringify({ alteracoes: [{ campo: "_criteriosAceite", valor: "150ms" }] })));

    const valor = await provedor().completarEstruturado("x", schemaAlteracoes);
    expect(valor).toEqual({ alteracoes: [{ campo: "_criteriosAceite", valor: "150ms" }] });

    const mensagensRetry = pedidos[1].corpo.messages as { role: string; content: string }[];
    // O retry manda a tentativa errada de volta e diz o defeito — reclamar
    // genericamente ("responda direito") faz o modelo errar de novo igual.
    expect(mensagensRetry.at(-2)?.role).toBe("assistant");
    expect(mensagensRetry.at(-1)?.content).toContain('falta a chave "valor"');
  });

  it("JSON quebrado também dispara o retry (não estoura na cara de quem chamou)", async () => {
    respostas.push(sseTexto("desculpa, não entendi o pedido"));
    respostas.push(sseTexto(JSON.stringify({ alteracoes: [] })));
    await expect(provedor().completarEstruturado("x", schemaAlteracoes)).resolves.toEqual({ alteracoes: [] });
  });

  it("errar duas vezes falha com o defeito na mensagem — não insiste pra sempre", async () => {
    respostas.push(sseTexto(JSON.stringify({ alteracoes: "não é array" })));
    respostas.push(sseTexto(JSON.stringify({ alteracoes: "ainda não é array" })));

    await expect(provedor().completarEstruturado("x", schemaAlteracoes)).rejects.toThrow(/esperado array/);
    expect(pedidos).toHaveLength(2);
  });
});

describe("validarContraSchema — a rede que substitui a grammar", () => {
  it("aceita o que bate", () => {
    expect(validarContraSchema({ alteracoes: [{ campo: "a", valor: "b" }] }, schemaAlteracoes)).toEqual([]);
  });

  it("aponta chave faltando com o caminho", () => {
    expect(validarContraSchema({ alteracoes: [{ campo: "a" }] }, schemaAlteracoes)).toEqual([
      '"alteracoes": [0] falta a chave "valor"',
    ]);
  });

  it("pega enum fora do conjunto — é a trava que evita tipo de nó inventado", () => {
    const schema = { enum: ["service", "queue"] } as unknown as EsquemaJson;
    expect(validarContraSchema("service", schema)).toEqual([]);
    expect(validarContraSchema("banco-de-dados", schema)).toEqual([
      'valor "banco-de-dados" fora do conjunto permitido',
    ]);
  });

  it("pega tipo trocado", () => {
    const schema = { type: "object", properties: { n: { type: "number" } } } as EsquemaJson;
    expect(validarContraSchema({ n: "5" }, schema)).toEqual(['"n": esperado número, veio string']);
  });

  it("array no lugar de objeto não passa como objeto", () => {
    expect(validarContraSchema([], schemaAlteracoes)).toEqual(["esperado objeto, veio array"]);
  });
});

/**
 * SPEC-30 Fase 1a — transcrição pelo gateway.
 *
 * Mesma disciplina do resto deste arquivo: servidor HTTP de verdade, não mock
 * de `fetch`. Aqui isso importa ainda mais que no chat, porque o que pode dar
 * errado é justamente o wire — `multipart/form-data` montado à mão, boundary,
 * nome de arquivo com a extensão certa. Um mock provaria só que o código chama
 * o que ele mesmo espera.
 */
describe("transcrever — o áudio vai pro gateway como multipart", () => {
  const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03]);

  function respondeTexto(texto: string): (res: ServerResponse) => void {
    return (res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(texto);
    };
  }

  it("posta em /audio/transcriptions com Bearer e devolve o texto", async () => {
    respostas.push(respondeTexto("  criar uma fila do rabbit  "));

    const texto = await provedor().transcrever!(audio, { formato: "audio/webm", idioma: "pt" });

    expect(texto).toBe("criar uma fila do rabbit");
    expect(pedidos[0].url).toBe("/v1/audio/transcriptions");
    expect(pedidos[0].cabecalhos.authorization).toBe("Bearer sk-secreta");
  });

  it("monta multipart com boundary — e NÃO declara Content-Type à mão", () => {
    // Declarar `Content-Type: multipart/form-data` sem o boundary é o erro
    // clássico deste endpoint: o servidor recebe um corpo que não consegue
    // separar em partes e responde 400. Quem monta o cabeçalho é o `fetch`.
    respostas.push(respondeTexto("ok"));
    return provedor()
      .transcrever!(audio, { formato: "audio/webm" })
      .then(() => {
        const tipo = String(pedidos[0].cabecalhos["content-type"]);
        expect(tipo).toContain("multipart/form-data");
        expect(tipo).toContain("boundary=");
      });
  });

  it("manda o nome do arquivo com a extensão do formato — o destino decide o decodificador por ela", async () => {
    respostas.push(respondeTexto("ok"));
    await provedor().transcrever!(audio, { formato: "audio/webm;codecs=opus" });
    // `;codecs=opus` é o que o Chrome manda de verdade; a extensão sai do tipo
    // base, senão viraria um `fala.audio/webm;codecs=opus`.
    expect(pedidos[0].bruto).toContain('filename="fala.webm"');

    respostas.push(respondeTexto("ok"));
    await provedor().transcrever!(audio, { formato: "audio/wav" });
    expect(pedidos[1].bruto).toContain('filename="fala.wav"');
  });

  it("manda o idioma quando informado, e o omite quando não", async () => {
    respostas.push(respondeTexto("ok"));
    await provedor().transcrever!(audio, { formato: "audio/webm", idioma: "pt" });
    expect(pedidos[0].bruto).toContain('name="language"');
    expect(pedidos[0].bruto).toContain("pt");

    respostas.push(respondeTexto("ok"));
    await provedor().transcrever!(audio, { formato: "audio/webm" });
    expect(pedidos[1].bruto).not.toContain('name="language"');
  });

  it("usa whisper-1 por padrão, e o nome configurado quando existe", async () => {
    respostas.push(respondeTexto("ok"));
    await provedor().transcrever!(audio, { formato: "audio/webm" });
    expect(pedidos[0].bruto).toContain("whisper-1");

    respostas.push(respondeTexto("ok"));
    const comNome = criarProvedorCompativelOpenAI({
      baseUrl,
      chave: "sk-secreta",
      modelo: "deepseek-chat",
      modeloTranscricao: "transcricao-interna-v2",
    });
    await comNome.transcrever!(audio, { formato: "audio/webm" });
    expect(pedidos[1].bruto).toContain("transcricao-interna-v2");
  });

  it("tolera gateway que ignora response_format e devolve JSON", async () => {
    // Acontece na prática, e o custo de tolerar e uma linha — contra uma falha
    // que apareceria como `{"text":"..."}` dentro do campo de texto da tela.
    respostas.push((res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "fila do rabbit" }));
    });

    expect(await provedor().transcrever!(audio, { formato: "audio/webm" })).toBe("fila do rabbit");
  });

  it("credencial recusada vira mensagem que diz o que fazer", async () => {
    respostas.push((res) => res.writeHead(401).end("no"));

    await expect(provedor().transcrever!(audio, { formato: "audio/webm" })).rejects.toThrow(
      /Credencial recusada/i
    );
  });
});
