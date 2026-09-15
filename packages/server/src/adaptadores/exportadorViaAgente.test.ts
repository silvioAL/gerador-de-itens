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
    specAnexada: false,
    specEnviadaEm: null,
    specErro: null,
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

/**
 * SPEC-120 fatia A — **o lote vale para a PRIMEIRA chamada também.**
 *
 * A SPEC-98 §4 tinha concluído que o lote era problema da segunda chamada
 * apenas, *"porque um item pronto é pequeno"*. A observação do usuário
 * corrigiu: o limite não é só de tokens, é de **lentidão** — e um MCP lento com
 * trinta issues para criar numa chamada tem o mesmo problema de timeout que a
 * spec tem de contexto.
 */
describe("exportadorViaAgente em lotes (SPEC-120)", () => {
  /** Responde sempre o que foi pedido, para o teste medir a EMENDA das chamadas. */
  function fetchQueEcoa() {
    const corpos: { itens: { chave: string }[] }[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const corpo = JSON.parse(init.body) as { itens: { chave: string }[] };
      corpos.push(corpo);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          resultados: corpo.itens.map((i) => ({ chave: i.chave, linkExterno: `https://jira/${i.chave}` })),
        }),
        text: async () => "",
      };
    }) as unknown as typeof fetch;
    return { fetchImpl, corpos };
  }

  it("trinta itens produzem SEIS chamadas, e o resultado continua sendo por item", async () => {
    // A prova literal da fatia A: hoje ia tudo num POST só, e o modo de falhar
    // era o pior possível — estoura, e estoura inteiro (§0.1).
    const { fetchImpl, corpos } = fetchQueEcoa();
    const itens = Array.from({ length: 30 }, (_, i) => item(`i${i}`));

    const resultado = await criarExportadorViaAgente(config, fetchImpl).exportar(itens);

    expect(corpos).toHaveLength(6);
    expect(corpos.every((c) => c.itens.length === 5)).toBe(true);
    // O que o §0.2 diz que NÃO muda: o estado continua por item, e nenhum se
    // perdeu nem se repetiu na emenda.
    expect(resultado).toHaveLength(30);
    expect(resultado.map((r) => r.chave)).toEqual(itens.map((i) => i.chave));
  });

  it("o tamanho do lote é configurável, e o de fábrica é 5", async () => {
    const { fetchImpl, corpos } = fetchQueEcoa();
    const itens = Array.from({ length: 6 }, (_, i) => item(`i${i}`));

    await criarExportadorViaAgente({ ...config, lote: { itens: 2 } }, fetchImpl).exportar(itens);

    expect(corpos.map((c) => c.itens.length)).toEqual([2, 2, 2]);
  });

  it("um lote que falha NÃO interrompe os seguintes — falha é por item, como sempre", async () => {
    /**
     * A régua da SPEC-49 aplicada um nível acima. Parar no primeiro erro faria
     * uma indisponibilidade momentânea do gateway custar os itens que viriam
     * depois — e eles nem chegariam a ser tentados.
     */
    let chamada = 0;
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const corpo = JSON.parse(init.body) as { itens: { chave: string }[] };
      chamada += 1;
      if (chamada === 1) return { ok: false, status: 503, json: async () => ({}), text: async () => "gateway ocupado" };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          resultados: corpo.itens.map((i) => ({ chave: i.chave, linkExterno: `https://jira/${i.chave}` })),
        }),
        text: async () => "",
      };
    }) as unknown as typeof fetch;

    const resultado = await criarExportadorViaAgente(config, fetchImpl).exportar(
      Array.from({ length: 10 }, (_, i) => item(`i${i}`))
    );

    expect(chamada).toBe(2);
    expect(resultado.slice(0, 5).every((r) => "erro" in r)).toBe(true);
    expect(resultado.slice(5).every((r) => "linkExterno" in r)).toBe(true);
  });

  it("413 na exportação NÃO retenta sozinho — criar issue não é idempotente", async () => {
    /**
     * SPEC-120 pergunta 2, respondida pelo lado do risco: *"para `itens` (criar
     * issue) um retry sobre um sucesso mal reportado duplica issue"*. A redução
     * automática existe, e existe só onde é segura — no anexo da spec.
     *
     * Aqui o 413 vira erro por item com o motivo do gateway, e quem lê decide
     * baixar o tamanho na configuração. É menos conveniente e é o certo: uma
     * demanda de trinta itens virando sessenta não tem como ser desfeita por
     * quem não sabe quais são os duplicados.
     */
    const fetchImpl = fetchFake({}, false, 413);

    const resultado = await criarExportadorViaAgente(config, fetchImpl).exportar([item("a"), item("b")]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(resultado.every((r) => "erro" in r && r.erro.includes("413"))).toBe(true);
  });
});
