import { describe, expect, it, vi } from "vitest";
import type { ItemGeradoSalvo } from "@gerador/aplicacao";
import { criarExportadorViaAgente } from "./exportadorViaAgente.js";

/**
 * SPEC-49 — o adaptador que fala com o AGENTE (MCP bridge, n8n, função
 * interna). O que se testa aqui é o contrato e, principalmente, o modo de
 * FALHAR: um issue que não sobe não pode derrubar os que subiram, e ausência
 * de resposta sobre um item não pode virar sucesso silencioso.
 */
const config = { endpoint: "https://agente.empresa/exportar", rotulo: "Jira", cabecalhos: { Authorization: "Bearer x" } };

function item(chave: string): ItemGeradoSalvo {
  return {
    id: chave,
    quebraId: "q1",
    chave,
    titulo: `Item ${chave}`,
    tipo: "Task",
    tamanho: "P",
    dependencias: [],
    corpoMarkdown: `### ${chave}`,
    pendencias: 0,
    sugestoes: 0,
    estado: "gerado",
    linkExterno: null,
    criadoEm: new Date("2026-08-13T10:00:00Z").toISOString(),
  };
}

function fetchFake(resposta: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => resposta,
    text: async () => JSON.stringify(resposta),
  })) as unknown as typeof fetch;
}

describe("exportadorViaAgente (SPEC-49)", () => {
  it("manda os itens no formato do contrato, com os cabeçalhos configurados", async () => {
    const fetchImpl = fetchFake({ resultados: [{ chave: "a", linkExterno: "https://jira/AB-1" }] });
    const exportador = criarExportadorViaAgente(config, fetchImpl);

    const resultado = await exportador.exportar([item("a")]);

    expect(resultado).toEqual([{ chave: "a", linkExterno: "https://jira/AB-1" }]);
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe(config.endpoint);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer x");
    expect(JSON.parse(init.body as string).itens[0]).toMatchObject({ chave: "a", corpoMarkdown: "### a" });
  });

  it("falha é POR ITEM: quem subiu sobe, quem falhou volta com o motivo", async () => {
    const exportador = criarExportadorViaAgente(
      config,
      fetchFake({
        resultados: [
          { chave: "a", linkExterno: "https://jira/AB-1" },
          { chave: "b", erro: "projeto AB não aceita issue do tipo Task" },
        ],
      })
    );

    expect(await exportador.exportar([item("a"), item("b")])).toEqual([
      { chave: "a", linkExterno: "https://jira/AB-1" },
      { chave: "b", erro: "projeto AB não aceita issue do tipo Task" },
    ]);
  });

  it("item que o agente IGNOROU não vira sucesso silencioso", async () => {
    const exportador = criarExportadorViaAgente(config, fetchFake({ resultados: [{ chave: "a", linkExterno: "https://jira/AB-1" }] }));

    const resultado = await exportador.exportar([item("a"), item("b")]);
    expect(resultado[1]).toEqual({ chave: "b", erro: "o agente não respondeu sobre este item" });
  });

  it("resposta sem link também é erro — issue sem endereço não serve pra ninguém", async () => {
    const exportador = criarExportadorViaAgente(config, fetchFake({ resultados: [{ chave: "a" }] }));
    expect(await exportador.exportar([item("a")])).toEqual([{ chave: "a", erro: "o agente respondeu sem o link do issue" }]);
  });

  it("HTTP de erro vira motivo legível, com o corpo do agente junto", async () => {
    const exportador = criarExportadorViaAgente(config, fetchFake({ detalhe: "token expirado" }, false, 401));
    const [resultado] = await exportador.exportar([item("a")]);
    expect("erro" in resultado && resultado.erro).toContain("HTTP 401");
    expect("erro" in resultado && resultado.erro).toContain("token expirado");
  });

  it("agente fora do ar não explode: cada item volta dizendo que a conversa falhou", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const exportador = criarExportadorViaAgente(config, fetchImpl);

    const resultado = await exportador.exportar([item("a"), item("b")]);
    expect(resultado).toHaveLength(2);
    expect("erro" in resultado[0] && resultado[0].erro).toContain("não consegui falar com o agente");
  });

  it("lista vazia não chama o agente — nada a exportar não é uma requisição", async () => {
    const fetchImpl = fetchFake({});
    expect(await criarExportadorViaAgente(config, fetchImpl).exportar([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
