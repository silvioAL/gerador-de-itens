import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GbnfJsonSchema } from "node-llama-cpp";
import { criarProvedorCompativelOpenAI, validarContraSchema } from "./provedorOpenAI.js";

/**
 * SPEC-25 §8.1 — o provedor nasce DORMENTE, mas testado contra um servidor
 * HTTP de verdade (não um `fetch` mockado). A diferença importa: o dia em que
 * o token corporativo sair, o que precisa funcionar é o wire — cabeçalhos,
 * SSE quebrado no meio de um chunk, `[DONE]`, status de erro. Um mock de
 * `fetch` provaria só que o código chama o que ele mesmo espera.
 */

let servidor: Server;
let baseUrl: string;
let pedidos: { corpo: Record<string, unknown>; cabecalhos: IncomingMessage["headers"] }[] = [];
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
      pedidos.push({ corpo: JSON.parse(bruto || "{}"), cabecalhos: req.headers });
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

const schemaAlteracoes: GbnfJsonSchema = {
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
    const schema = { enum: ["service", "queue"] } as unknown as GbnfJsonSchema;
    expect(validarContraSchema("service", schema)).toEqual([]);
    expect(validarContraSchema("banco-de-dados", schema)).toEqual([
      'valor "banco-de-dados" fora do conjunto permitido',
    ]);
  });

  it("pega tipo trocado", () => {
    const schema = { type: "object", properties: { n: { type: "number" } } } as GbnfJsonSchema;
    expect(validarContraSchema({ n: "5" }, schema)).toEqual(['"n": esperado número, veio string']);
  });

  it("array no lugar de objeto não passa como objeto", () => {
    expect(validarContraSchema([], schemaAlteracoes)).toEqual(["esperado objeto, veio array"]);
  });
});
