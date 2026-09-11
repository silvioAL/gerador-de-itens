import { describe, expect, it } from "vitest";
import { camposDoWebhook, gatilhoDoSistema, saidaDoGatilho } from "./gatilhos.js";
import { extrairDoWebhook, saidaDoWebhook } from "../casos-de-uso/webhook.js";
import { validarEscritaFluxos, type Fluxo } from "./fluxos.js";

/**
 * SPEC-110 fatia L (D1) — **o gatilho webhook: alguém de fora nos chama.**
 *
 * A correção de escopo que a fatia carrega, e que estas provas fixam: o webhook
 * NÃO é o conector HTTP noutra roupa. Conector é saída (nós chamamos alguém);
 * webhook é entrada (alguém nos chama). O que elas guardam é o contrato dessa
 * entrada: o que se extrai do corpo, o que se ignora, e o que a escrita recusa.
 */

const fluxo = (nos: Fluxo["nos"]): { fluxos: Fluxo[] } => ({
  fluxos: [{ id: "meu", nome: "meu", nos, arestas: [] }],
});
const noWebhook = (parametros: Record<string, unknown>): Fluxo["nos"][number] => ({
  id: "gatilho",
  tipo: "gatilho",
  refId: "webhook",
  posicao: { x: 0, y: 0 },
  parametros,
});

describe("o webhook no registro de gatilhos", () => {
  it("existe, e é o primeiro que emite dado do NÓ e não do tipo", () => {
    const webhook = gatilhoDoSistema("webhook");
    expect(webhook).toBeDefined();
    // O registro não promete campo nenhum: o que ele emite é o que a pessoa
    // declarou NAQUELE nó.
    expect(webhook!.saida).toEqual([]);

    const contrato = saidaDoGatilho(noWebhook({ campos: [{ chave: "pedidoId" }, { chave: "valor", rotulo: "Valor" }] }));
    expect(contrato.map((c) => c.chave)).toEqual(["pedidoId", "valor"]);
    expect(contrato[1].rotulo).toBe("Valor");
  });

  it("manual e agendamento continuam sem saída — o gatilho é âncora de QUANDO", () => {
    expect(saidaDoGatilho({ refId: "manual" })).toEqual([]);
    expect(saidaDoGatilho({ refId: "agendamento", parametros: { expressao: "0 9 * * 1" } })).toEqual([]);
  });

  it("a leitura é TOLERANTE: campo sem chave é descartado, não explode (SPEC-35)", () => {
    expect(camposDoWebhook({ campos: [{ chave: "ok" }, { rotulo: "sem chave" }, null, "lixo"] })).toEqual([
      { chave: "ok" },
    ]);
    expect(camposDoWebhook({})).toEqual([]);
    expect(camposDoWebhook(undefined)).toEqual([]);
  });
});

describe("o corpo que chega vira a saída do gatilho", () => {
  const CORPO = { pedidoId: "P-1", dados: { valor: 42, itens: [{ sku: "A" }, { sku: "B" }] }, ruido: "ignore-me" };

  it("cada campo lê pelo caminho declarado; sem caminho vale `$.{chave}`", () => {
    const saida = extrairDoWebhook(
      [{ chave: "pedidoId" }, { chave: "valor", caminho: "$.dados.valor" }, { chave: "segundoSku", caminho: "$.dados.itens[1].sku" }],
      CORPO
    );
    expect(saida).toEqual({ pedidoId: "P-1", valor: 42, segundoSku: "B" });
  });

  it("o resto do corpo é IGNORADO de propósito — o declarado é o contrato", () => {
    const saida = extrairDoWebhook([{ chave: "pedidoId" }], CORPO);
    expect(saida).toEqual({ pedidoId: "P-1" });
    expect(saida).not.toHaveProperty("ruido");
  });

  it("campo ausente no corpo fica FORA da saída — ausência não vira default (§9.3)", () => {
    // Gravar "" seria a mentira que a casa recusa: quem depender do campo tem
    // de falhar nomeando, não receber vazio como se fosse resposta.
    const saida = extrairDoWebhook([{ chave: "pedidoId" }, { chave: "naoVeio" }], CORPO);
    expect(saida).toEqual({ pedidoId: "P-1" });
    expect("naoVeio" in saida).toBe(false);
  });

  it("`saidaDoWebhook` parte dos parâmetros crus do nó — é o caminho do executor", () => {
    expect(saidaDoWebhook({ campos: [{ chave: "valor", caminho: "$.dados.valor" }] }, CORPO)).toEqual({ valor: 42 });
  });
});

describe("o que a escrita RECUSA num nó de webhook", () => {
  it("webhook sem campo nenhum: receberia a chamada e não entregaria nada", () => {
    expect(() => validarEscritaFluxos(fluxo([noWebhook({})]))).toThrow(/sem nenhum campo declarado/);
  });

  it("duas vezes a mesma chave: o segundo venceria em silêncio", () => {
    expect(() => validarEscritaFluxos(fluxo([noWebhook({ campos: [{ chave: "id" }, { chave: "id" }] })]))).toThrow(
      /declara duas vezes o campo "id"/
    );
  });

  it("caminho fora do subconjunto declarado é recusado NOMEANDO o aceito", () => {
    // A mesma régua do conector (§9.4): sem wildcard, sem filtro. Uma limitação
    // visível é melhor que um poder que falha em silêncio.
    expect(() =>
      validarEscritaFluxos(fluxo([noWebhook({ campos: [{ chave: "id", caminho: "$.dados[*].id" }] })]))
    ).toThrow(/não é um caminho válido/);
  });

  it("o desenho bom passa — e é o do caso real (um id e um valor aninhado)", () => {
    expect(() =>
      validarEscritaFluxos(fluxo([noWebhook({ campos: [{ chave: "pedidoId" }, { chave: "valor", caminho: "$.dados.valor" }] })]))
    ).not.toThrow();
  });
});
