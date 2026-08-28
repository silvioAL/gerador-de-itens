import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHAVE_GATEWAY_FALSO,
  criarGatewayFalso,
  MARCA_GATEWAY_FALSO,
  PEDIR_FALHA_AO_GATEWAY,
  TEXTO_TRANSCRITO_FALSO,
} from "./gatewayFalso.js";

/**
 * SPEC-74 fatia A — a rede de proteção da MUDANÇA DE ENDEREÇO.
 *
 * O dublê saiu de `packages/web/e2e/` e virou pacote. A prova de que a mudança
 * não mexeu no comportamento é o E2E (102 testes que dependem dele), mas o E2E
 * é caro e só roda com banco e navegador de pé. Este arquivo cobre o contrato
 * do dublê em segundos, sem nada em volta — e é o que vai avisar primeiro se a
 * fatia C quebrar o modo `esqueleto`, do qual a suíte inteira depende.
 *
 * Porta 0 de propósito: o sistema operacional escolhe uma livre. Fixar 4123
 * aqui faria este teste brigar com a suíte E2E rodando na mesma máquina — que
 * é exatamente o modo de falha que o §308 documenta.
 */
let servidor: Server;
let base: string;

beforeAll(async () => {
  servidor = criarGatewayFalso();
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const { port } = servidor.address() as AddressInfo;
  base = `http://127.0.0.1:${port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => servidor.close((e) => (e ? reject(e) : resolve())));
});

function pedirChat(corpo: unknown, chave = CHAVE_GATEWAY_FALSO) {
  return fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
    body: JSON.stringify(corpo),
  });
}

/** Junta o `delta.content` dos eventos SSE, do mesmo jeito que `provedorOpenAI` faz. */
async function textoDoStream(resposta: Response): Promise<string> {
  const bruto = await resposta.text();
  return bruto
    .split("\n")
    .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => JSON.parse(l.slice(6)).choices[0].delta.content as string)
    .join("");
}

const SCHEMA_EXEMPLO = {
  type: "object",
  properties: {
    nos: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        properties: { rotulo: { type: "string" }, tipo: { type: "string", enum: ["fila", "servico"] } },
        required: ["rotulo", "tipo"],
      },
    },
  },
  required: ["nos"],
};

describe("gateway falso (SPEC-74 fatia A — o mesmo dublê, noutro endereço)", () => {
  it("responde /health, que é como o Playwright sabe que ele subiu", async () => {
    const r = await fetch(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}/health`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });

  it("recusa credencial errada com 401 — sem isto, 'Testar conexão' passaria sem chave", async () => {
    const r = await pedirChat({ messages: [] }, "chave-errada");
    expect(r.status).toBe(401);
  });

  it("a chave é configurável, e o default continua sendo o da suíte", async () => {
    const outro = criarGatewayFalso({ chave: "chave-da-stack" });
    await new Promise<void>((resolve) => outro.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(outro.address() as AddressInfo).port}/v1/chat/completions`;
    const chamar = (chave: string) =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
        body: JSON.stringify({ messages: [] }),
      });

    expect((await chamar("chave-da-stack")).status).toBe(200);
    // O default do E2E deixa de valer AQUI, e continua valendo lá — é o que
    // separa "o dublê da suíte" de "o dublê da stack".
    expect((await chamar(CHAVE_GATEWAY_FALSO)).status).toBe(401);

    await new Promise<void>((resolve, reject) => outro.close((e) => (e ? reject(e) : resolve())));
  });

  it("lê o schema do CORPO e preenche respeitando enum e minItems", async () => {
    const r = await pedirChat({
      messages: [{ role: "user", content: "qualquer coisa" }],
      response_format: { type: "json_schema", json_schema: { schema: SCHEMA_EXEMPLO } },
    });
    const dados = JSON.parse(await textoDoStream(r));

    expect(dados.nos).toHaveLength(2);
    expect(dados.nos[0].tipo).toBe("fila");
    // O caminho do campo entra no texto: é o que deixa um teste afirmar que o
    // campo CERTO recebeu o texto certo, e é disso que o E2E depende.
    expect(dados.nos[0].rotulo).toBe(`${MARCA_GATEWAY_FALSO} (nos[0].rotulo)`);
    expect(dados.nos[1].rotulo).toBe(`${MARCA_GATEWAY_FALSO} (nos[1].rotulo)`);
  });

  it("lê o schema do PROMPT quando o dialeto é json_object (que não o manda no corpo)", async () => {
    const r = await pedirChat({
      messages: [
        {
          role: "user",
          content: `Responda SOMENTE com um objeto JSON que obedeça exatamente a este schema: ${JSON.stringify(
            SCHEMA_EXEMPLO
          )}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    expect(JSON.parse(await textoDoStream(r)).nos).toHaveLength(2);
  });

  it("sem schema nenhum, devolve texto livre marcado", async () => {
    const r = await pedirChat({ messages: [{ role: "user", content: "Responda apenas: ok" }] });
    expect(await textoDoStream(r)).toBe(`${MARCA_GATEWAY_FALSO}: ok`);
  });

  it("§265 — falha de propósito com 500 quando o pedido pede", async () => {
    const r = await pedirChat({ messages: [{ role: "user", content: PEDIR_FALHA_AO_GATEWAY }] });
    expect(r.status).toBe(500);
  });

  it("transcreve, com a mesma credencial do chat", async () => {
    const forma = new FormData();
    forma.append("file", new Blob(["nao-e-audio-de-verdade"]), "fala.webm");
    const r = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${CHAVE_GATEWAY_FALSO}` },
      body: forma,
    });

    expect(r.status).toBe(200);
    expect(await r.text()).toBe(TEXTO_TRANSCRITO_FALSO);
  });

  it("streama em pedaços, e não num evento só — é o buffer entre leituras que quebrou no navegador", async () => {
    const r = await pedirChat({
      messages: [{ role: "user", content: "qualquer coisa" }],
      response_format: { type: "json_schema", json_schema: { schema: SCHEMA_EXEMPLO } },
    });
    const eventos = (await r.text()).split("\n").filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"));

    expect(eventos.length).toBeGreaterThan(1);
  });
});
