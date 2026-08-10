import { describe, expect, it } from "vitest";
import { criarProvedorCompativelOpenAI } from "./provedorOpenAI.js";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ACHADO REAL (esteira com Claude no modo hospedado): *"tudo estava normal até
 * o PO responder, então as informações sumiram"*.
 *
 * `completarEstruturado` faz UM retry quando a resposta não obedece ao schema —
 * e a segunda tentativa streamava no MESMO canal da primeira. Quem acumula os
 * pedaços para dar `JSON.parse` no fim recebia as duas concatenadas, o parse
 * falhava, e o lote inteiro do papel era descartado em silêncio.
 *
 * Nunca aparecia no modelo local: com GBNF a primeira resposta já é JSON válido
 * e o retry nunca roda. No gateway, o retry É o caminho normal de recuperação.
 */
async function servidorQueErraDepoisAcerta(respostas: string[]) {
  let n = 0;
  const servidor = createServer((_req, res) => {
    const conteudo = respostas[Math.min(n++, respostas.length - 1)];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: conteudo } }] }));
  });
  await new Promise<void>((ok) => servidor.listen(0, ok));
  return { servidor, baseUrl: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}` };
}

describe("retry do gateway não corrompe o stream (SPEC-31)", () => {
  it("avisa para descartar o que já foi streamado antes de repetir", async () => {
    // 1ª resposta viola o schema (falta `historia`), a 2ª obedece.
    const { servidor, baseUrl } = await servidorQueErraDepoisAcerta([
      JSON.stringify({ errado: true }),
      JSON.stringify({ historia: "Como cliente, quero…" }),
    ]);

    const pedacos: string[] = [];
    let reinicios = 0;
    const provedor = criarProvedorCompativelOpenAI({ baseUrl, chave: "k", modelo: "m" });

    const valor = await provedor.completarEstruturado(
      "gere",
      { type: "object", properties: { historia: { type: "string" } }, required: ["historia"] },
      { onTexto: (p) => pedacos.push(p), onReiniciar: () => reinicios++ }
    );

    expect(valor).toEqual({ historia: "Como cliente, quero…" });
    // O sinal existe E veio ANTES do texto da segunda tentativa.
    expect(reinicios).toBe(1);

    // A prova do defeito: sem descartar, o acumulado NÃO é JSON válido.
    expect(() => JSON.parse(pedacos.join(""))).toThrow();

    servidor.close();
  });

  it("sem retry, nada é sinalizado — o caminho feliz não muda", async () => {
    const { servidor, baseUrl } = await servidorQueErraDepoisAcerta([JSON.stringify({ historia: "ok" })]);
    let reinicios = 0;
    const provedor = criarProvedorCompativelOpenAI({ baseUrl, chave: "k", modelo: "m" });

    await provedor.completarEstruturado(
      "gere",
      { type: "object", properties: { historia: { type: "string" } }, required: ["historia"] },
      { onTexto: () => {}, onReiniciar: () => reinicios++ }
    );

    expect(reinicios).toBe(0);
    servidor.close();
  });
});
