import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buscarDoModelo, opcoesDeInferencia, TIMEOUTS_DE_INFERENCIA } from "./rede.js";

/**
 * §193 — o defeito medido nos logs de produção: o `fetch` do Node desiste da
 * conexão depois de 300 s parada (`headersTimeout`/`bodyTimeout` padrão do
 * undici), e um modelo local em CPU passa disso só no *prompt eval* de um
 * lote. O papel inteiro morria com `fetch failed`, nada era gravado, e na
 * tela o sintoma era "o que o agente anterior escreveu sumiu".
 *
 * Provar o limite de 300 s num teste levaria 300 s. O que se testa aqui é o
 * que decide o comportamento: as OPÇÕES do agente de inferência (ninguém
 * consegue perguntar a um Agent do undici quais timeouts ele recebeu) — e,
 * por integração, que o dispatcher próprio não quebra o fetch (o
 * `UND_ERR_INVALID_ARG` que já mordeu este projeto) e atravessa uma espera
 * longa de verdade antes dos headers.
 */
let servidor: Server;
let url = "";

beforeAll(async () => {
  servidor = createServer((_req, resposta) => {
    // Silêncio antes dos headers: é o "prompt eval" do modelo local, em miniatura.
    setTimeout(() => {
      resposta.writeHead(200, { "Content-Type": "text/plain" });
      resposta.end("ok");
    }, 900);
  });
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const endereco = servidor.address();
  url = `http://127.0.0.1:${typeof endereco === "object" && endereco ? endereco.port : 0}/`;
});

afterAll(async () => {
  await new Promise<void>((pronto) => servidor.close(() => pronto()));
});

describe("fetch de inferência (§193)", () => {
  it("o relógio do undici fica DESLIGADO: geração lenta não é erro de rede", () => {
    expect(TIMEOUTS_DE_INFERENCIA).toEqual({ headersTimeout: 0, bodyTimeout: 0 });
    expect(opcoesDeInferencia("http://ollama:11434/v1", {})).toEqual({ headersTimeout: 0, bodyTimeout: 0 });
  });

  it("com proxy corporativo, os timeouts desligados vão JUNTO do proxy", () => {
    const comProxy = opcoesDeInferencia("https://gateway.empresa/v1", { HTTPS_PROXY: "http://proxy.empresa:8080" });
    expect(comProxy).toEqual({ headersTimeout: 0, bodyTimeout: 0, uri: "http://proxy.empresa:8080" });
    // NO_PROXY continua respeitado — e sem proxy os timeouts seguem desligados.
    expect(
      opcoesDeInferencia("https://gateway.empresa/v1", { HTTPS_PROXY: "http://proxy.empresa:8080", NO_PROXY: "*" })
    ).toEqual({ headersTimeout: 0, bodyTimeout: 0 });
  });

  it("atravessa uma resposta que demora a começar, sem quebrar o fetch com dispatcher próprio", async () => {
    const resposta = await buscarDoModelo(url);
    expect(resposta.status).toBe(200);
    expect(await resposta.text()).toBe("ok");
  });
});
