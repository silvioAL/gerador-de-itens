import { describe, expect, it, vi } from "vitest";
import type { DestinoResolvido } from "@gerador/aplicacao";
import { criarLeitorDeAdrViaGateway, criarLeitorDeDocumentoViaGateway } from "./gatewayDoTime.js";

const DESTINO_ADR: DestinoResolvido = {
  id: "adr-repo",
  operacao: "adr",
  endpoint: "https://gw.casa/adr",
  rotulo: "ADRs de Engenharia",
  cabecalhos: { Authorization: "Bearer x" },
  metodo: "POST" as const,
  envelope: "",
  espaco: "",
};

function respostaJson(corpo: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => corpo, text: async () => JSON.stringify(corpo) } as unknown as Response;
}

describe("ler ADR pelo gateway (SPEC-81 fatia C)", () => {
  it("manda os cabeçalhos do destino e lê a lista", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      respostaJson({ adrs: [{ id: "ADR-14", titulo: "Fila em vez de síncrono", link: "https://adr/14" }] })
    );

    const adrs = await criarLeitorDeAdrViaGateway(DESTINO_ADR, fetchFalso).listar();

    expect(fetchFalso).toHaveBeenCalledWith(
      "https://gw.casa/adr",
      expect.objectContaining({ headers: { "Content-Type": "application/json", Authorization: "Bearer x" } })
    );
    expect(adrs).toEqual([{ id: "ADR-14", titulo: "Fila em vez de síncrono", link: "https://adr/14" }]);
  });

  it("repositório fora do ar degrada para lista vazia — não impede ninguém de desenhar", async () => {
    /**
     * A escolha de modo de falhar. Um repositório de decisões indisponível não
     * pode travar a mesa de projeto: lista vazia significa "não sei", e a tela
     * já sabe dizer isso. Estourar aqui transformaria uma integração opcional
     * em dependência dura.
     */
    const rede = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const http500 = vi.fn().mockResolvedValue(respostaJson({}, false, 500));

    expect(await criarLeitorDeAdrViaGateway(DESTINO_ADR, rede).listar()).toEqual([]);
    expect(await criarLeitorDeAdrViaGateway(DESTINO_ADR, http500).listar()).toEqual([]);
  });

  it("descarta ADR sem id ou sem título — é o mínimo para conseguir usar", async () => {
    // Sem id não sobrevive à reimportação; sem título não aparece em lugar
    // nenhum. O resto pode faltar e vira lacuna contável.
    const fetchFalso = vi.fn().mockResolvedValue(
      respostaJson({
        adrs: [
          { id: "ok", titulo: "bom" },
          { id: "", titulo: "sem id" },
          { id: "sem-titulo" },
          { titulo: "sem id nenhum" },
          "não é objeto",
        ],
      })
    );

    const adrs = await criarLeitorDeAdrViaGateway(DESTINO_ADR, fetchFalso).listar();

    expect(adrs.map((a) => a.id)).toEqual(["ok"]);
  });

  it("é tolerante com o formato — o que não vier fica ausente, e nada é inventado", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      respostaJson({
        adrs: [
          {
            id: "ADR-1",
            titulo: "x",
            alternativas: [{ titulo: "A", consequencia: "c" }, { consequencia: "sem título" }, "lixo"],
            contexto: "   ",
          },
        ],
      })
    );

    const [adr] = await criarLeitorDeAdrViaGateway(DESTINO_ADR, fetchFalso).listar();

    // Alternativa sem título não é alternativa; contexto em branco é ausência.
    expect(adr.alternativas).toEqual([{ titulo: "A", consequencia: "c" }]);
    expect(adr.contexto).toBeUndefined();
  });

  it("corpo sem `adrs` não quebra", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respostaJson({ resultado: "ok" }));

    expect(await criarLeitorDeAdrViaGateway(DESTINO_ADR, fetchFalso).listar()).toEqual([]);
  });
});

// SPEC-81 fatia B → SPEC-107 G2: os testes do publicador (e do "curl que o
// destino declara" para PUBLICAR) morreram com o adaptador — o contrato do
// método/envelope/espaço da publicação vive agora no conector genérico
// (montarChamadaDoConector, testado na aplicação).


/**
 * SPEC-100 fatia C (§349) — **buscar um documento da casa pelo link.**
 *
 * O pedido do usuário: *"passar o link de uma página Confluence para que ele
 * consulte e traga as informações, e assim o assistente já monte o desenho"*.
 *
 * Diferente dos outros dois leitores em quem escolhe o alvo: ali o gateway sabe
 * onde o repositório mora; aqui **a pessoa manda o endereço**.
 */
describe("ler um documento da casa pelo link (§349)", () => {
  const DESTINO_DOC_EXTERNO: DestinoResolvido = {
    id: "confluence-leitura",
    operacao: "documentoExterno",
    endpoint: "https://gw.casa/ler",
    rotulo: "Confluence",
    cabecalhos: {},
    metodo: "POST" as const,
    envelope: "",
    espaco: "",
  };

  const respondendo = (corpo: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(corpo), { status }));

  it("manda o LINK no pedido — é a pessoa que escolhe o alvo", async () => {
    const rede = respondendo({ conteudo: "# Proposta de arquitetura" });

    await criarLeitorDeDocumentoViaGateway(DESTINO_DOC_EXTERNO, rede).ler("https://wiki.casa/p/42");

    const [, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ link: "https://wiki.casa/p/42" });
  });

  it("devolve o conteúdo e a origem", async () => {
    const rede = respondendo({ conteudo: "texto da página", titulo: "Pagamentos v2", atualizadoEm: "2026-01-05" });

    const lido = await criarLeitorDeDocumentoViaGateway(DESTINO_DOC_EXTERNO, rede).ler("https://wiki.casa/p/42");

    expect(lido).toEqual({
      conteudo: "texto da página",
      titulo: "Pagamentos v2",
      link: "https://wiki.casa/p/42",
      atualizadoEm: "2026-01-05",
    });
  });

  it("o link canônico do gateway VENCE o pedido — ele aponta para o lugar de verdade", async () => {
    const rede = respondendo({ conteudo: "x", link: "https://wiki.casa/pages/42/pagamentos-v2" });

    const lido = await criarLeitorDeDocumentoViaGateway(DESTINO_DOC_EXTERNO, rede).ler("https://wiki.casa/p/42");

    expect(lido?.link).toBe("https://wiki.casa/pages/42/pagamentos-v2");
  });

  it("mas a proveniência nunca fica vazia: sem link no corpo, fica o pedido", async () => {
    // Um desenho importado sem origem é pior que um desenho digitado — daqui a
    // um mês, "de onde saiu esse componente?" precisa ter resposta.
    const rede = respondendo({ conteudo: "x" });

    expect((await criarLeitorDeDocumentoViaGateway(DESTINO_DOC_EXTERNO, rede).ler("https://wiki/p/1"))?.link).toBe(
      "https://wiki/p/1",
    );
  });

  it("**200 com conteúdo vazio é o mesmo que não achar**", async () => {
    /**
     * A régua que mais importa aqui. Uma página vazia que virasse "proposta"
     * faria o modelo inventar o desenho inteiro para não devolver nada — e o
     * resultado pareceria importado, com a autoridade de um documento da casa
     * que ninguém escreveu.
     */
    const vazio = respondendo({ conteudo: "   " });
    const semCampo = respondendo({ titulo: "só o título" });

    expect(await criarLeitorDeDocumentoViaGateway(DESTINO_DOC_EXTERNO, vazio).ler("https://wiki/p/1")).toBeUndefined();
    expect(await criarLeitorDeDocumentoViaGateway(DESTINO_DOC_EXTERNO, semCampo).ler("https://wiki/p/1")).toBeUndefined();
  });

  it("link em branco não vira chamada — não há o que buscar", async () => {
    const rede = respondendo({ conteudo: "x" });

    expect(await criarLeitorDeDocumentoViaGateway(DESTINO_DOC_EXTERNO, rede).ler("   ")).toBeUndefined();
    expect(rede).not.toHaveBeenCalled();
  });

  it("rede fora e HTTP de erro devolvem `undefined`, nunca exceção", async () => {
    // Importar é caminho auxiliar: derrubar a tela porque uma página não
    // respondeu transformaria um atalho em obstáculo.
    const caiu = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const http404 = respondendo({}, 404);

    expect(await criarLeitorDeDocumentoViaGateway(DESTINO_DOC_EXTERNO, caiu).ler("https://wiki/p/1")).toBeUndefined();
    expect(await criarLeitorDeDocumentoViaGateway(DESTINO_DOC_EXTERNO, http404).ler("https://wiki/p/1")).toBeUndefined();
  });
});
