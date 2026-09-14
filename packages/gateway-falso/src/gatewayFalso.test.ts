import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHAVE_GATEWAY_FALSO,
  criarGatewayFalso,
  MARCA_GATEWAY_FALSO,
  PEDIR_FALHA_AO_GATEWAY,
  TEXTO_TRANSCRITO_FALSO,
  limparPaginasDoGatewayFalso,
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

/**
 * SPEC-81 — o destino de ADR.
 *
 * Existe para a SPEC-81 ser **validável contra a stack local**: o botão de trazer
 * decisões só aparece com destino configurado, e sem este endereço a única forma
 * de dar aquele clique seria ter um gateway de verdade do outro lado.
 *
 * O que se afirma aqui é o **contrato de fio** que `criarLeitorDeAdrViaGateway`
 * lê — não o comportamento do leitor, que é do `packages/server`. A asserção de
 * `id` e `titulo` não é decorativa: é exatamente o filtro que o leitor aplica, e
 * um dublê que os perdesse devolveria lista vazia sem nada acusar.
 */
describe("o destino de ADR (SPEC-81)", () => {
  it("responde `{ adrs }` a um POST vazio, sem exigir a chave do provedor de IA", async () => {
    const r = await fetch(`${base}/adr`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { adrs: { id: string; titulo: string }[] };
    expect(Array.isArray(corpo.adrs)).toBe(true);
    expect(corpo.adrs.length).toBeGreaterThan(0);
    // O filtro do leitor, repetido aqui de propósito.
    for (const a of corpo.adrs) {
      expect(typeof a.id === "string" && a.id.trim()).toBeTruthy();
      expect(typeof a.titulo === "string" && a.titulo.trim()).toBeTruthy();
    }
  });

  it("traz um ADR SEM o porquê — é o caso comum, e vira lacuna em vez de invenção", async () => {
    const r = await fetch(`${base}/adr`, { method: "POST", body: "{}" });
    const { adrs } = (await r.json()) as { adrs: { porque?: string; status?: string }[] };

    expect(adrs.some((a) => !a.porque)).toBe(true);
    expect(adrs.some((a) => a.status === "substituida")).toBe(true);
  });

  it("GET no mesmo endereço continua 404 — o contrato é POST", async () => {
    const r = await fetch(`${base}/adr`);
    expect(r.status).toBe(404);
  });
});

/**
 * §355 — as quatro operações que faltavam.
 *
 * O gateway tem cinco (`OPERACOES_DO_GATEWAY`) e o dublê servia UMA. Medido ao
 * tentar percorrer a jornada inteira contra a stack: **quatro dos cinco passos
 * não tinham para onde apontar**, então configurar o gateway, ler um documento
 * da casa, publicar o desenho e subir os itens eram impossíveis de exercitar
 * localmente — e de demonstrar.
 */
describe("as cinco operações do gateway do time", () => {
  let servidor: ReturnType<typeof criarGatewayFalso>;
  let base: string;

  beforeAll(async () => {
    limparPaginasDoGatewayFalso();
    servidor = criarGatewayFalso();
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    const addr = servidor.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

  async function postar(caminho: string, corpo: unknown) {
    const r = await fetch(`${base}${caminho}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
  }

  it("itens: um resultado POR item, com o link de cada um", async () => {
    const { corpo } = await postar("/v1/itens", {
      itens: [{ chave: "n1::setup" }, { chave: "n1::ep0" }, { chave: "e1::publish" }],
    });
    const resultados = corpo.resultados as { chave: string; linkExterno?: string; erro?: string }[];
    expect(resultados).toHaveLength(3);
    expect(resultados[0].linkExterno).toContain("n1::setup");
  });

  it("itens: o último falha de propósito — falha PARCIAL é o modo de falhar deste contrato", async () => {
    // Um dublê que sempre acerta nunca exercita a tela que mostra o que não subiu.
    const { corpo } = await postar("/v1/itens", { itens: [{ chave: "a" }, { chave: "b" }] });
    const resultados = corpo.resultados as { chave: string; erro?: string }[];
    expect(resultados[0].erro).toBeUndefined();
    expect(resultados[1].erro).toBeTruthy();
  });

  it("documento: publicar duas vezes ATUALIZA no lugar, com o mesmo link", async () => {
    // É a promessa central do contrato (`publicadorDeDocumento.ts`): uma segunda
    // publicação que devolvesse `criada` significaria duas páginas do mesmo
    // documento na casa, e é isso que transforma publicação em lixo.
    const primeira = await postar("/v1/documento", { demandaId: "q-1", markdown: "# a" });
    const segunda = await postar("/v1/documento", { demandaId: "q-1", markdown: "# a v2" });

    expect(primeira.corpo.atualizada).toBe(false);
    expect(segunda.corpo.atualizada).toBe(true);
    expect(segunda.corpo.linkExterno).toBe(primeira.corpo.linkExterno);
  });

  it("documento: demandas diferentes são páginas diferentes", async () => {
    const a = await postar("/v1/documento", { demandaId: "q-A", markdown: "#" });
    const b = await postar("/v1/documento", { demandaId: "q-B", markdown: "#" });
    expect(a.corpo.linkExterno).not.toBe(b.corpo.linkExterno);
  });

  it("documento: o espaço do destino entra no endereço da página (§348)", async () => {
    const { corpo } = await postar("/v1/documento", { demandaId: "q-esp", espaco: "ARQ", markdown: "#" });
    expect(corpo.linkExterno).toContain("ARQ");
  });

  it("documento-externo: devolve conteúdo e ECOA o link pedido", async () => {
    // O eco é proveniência: o desenho que nascer disto diz de onde veio, e
    // inventar o link aqui seria mentir sobre a origem.
    const link = "https://confluence.invalido/pages/12345";
    const { corpo } = await postar("/v1/documento-externo", { link });
    expect(corpo.link).toBe(link);
    expect(String(corpo.conteudo)).toContain("bureau");
    expect(corpo.titulo).toBeTruthy();
  });


  it("adr: continua como estava — a operação que já existia não muda", async () => {
    const { corpo } = await postar("/v1/adr", {});
    expect((corpo.adrs as unknown[]).length).toBeGreaterThan(0);
  });
});
