import { describe, expect, it, vi } from "vitest";
import type { DestinoResolvido } from "@gerador/aplicacao";
import {
  criarLeitorDeAdrViaGateway,
  criarLeitorDeArquiteturaViaGateway,
  criarPublicadorDeDocumentoViaGateway,
} from "./gatewayDoTime.js";

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

const DESTINO_DOC: DestinoResolvido = {
  id: "confluence",
  operacao: "documento",
  endpoint: "https://gw.casa/confluence",
  rotulo: "Confluence",
  cabecalhos: { Authorization: "Bearer x" },
  metodo: "POST" as const,
  envelope: "",
  espaco: "",
};

const DOCUMENTO = {
  demandaId: "q-1",
  demandaTitulo: "Busca por SKU",
  markdown: "# Especificação\n\ncorpo",
  geradoEm: "2026-08-29T10:00:00.000Z",
  demandaAtualizadaEm: "2026-08-29T11:00:00.000Z",
  desatualizado: true,
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

describe("publicar o documento pelo gateway (SPEC-81 fatia B)", () => {
  it("manda a demanda inteira, incluindo se ela já envelheceu", async () => {
    /**
     * O payload carrega **de onde veio, quando, e se o original já mudou desde
     * então**. Uma página publicada que possa dizer "gerada de um documento que
     * mudou desde então" é mais honesta que a maioria das wikis corporativas — e
     * é de graça, porque o dado já existe (§312).
     */
    const fetchFalso = vi.fn().mockResolvedValue(respostaJson({ linkExterno: "https://wiki/q-1", atualizada: true }));

    const resultado = await criarPublicadorDeDocumentoViaGateway(DESTINO_DOC, fetchFalso).publicar(DOCUMENTO);

    expect(JSON.parse(fetchFalso.mock.calls[0][1].body)).toEqual(DOCUMENTO);
    expect(resultado).toEqual({ linkExterno: "https://wiki/q-1", atualizada: true });
  });

  it("publicar duas vezes ATUALIZA — e o produto sabe que atualizou", async () => {
    /**
     * A prova da idempotência. Uma segunda publicação que devolvesse `criada`
     * significa que a casa ficou com duas páginas do mesmo documento — e é isso
     * que transforma publicação em lixo (§263 em escala de documento).
     *
     * A identidade é `demandaId`, e ela vai no payload porque **quem sabe onde a
     * página mora é quem a criou**.
     */
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ linkExterno: "https://wiki/q-1", atualizada: false }))
      .mockResolvedValueOnce(respostaJson({ linkExterno: "https://wiki/q-1", atualizada: true }));

    const publicador = criarPublicadorDeDocumentoViaGateway(DESTINO_DOC, fetchFalso);
    const primeira = await publicador.publicar(DOCUMENTO);
    const segunda = await publicador.publicar(DOCUMENTO);

    expect(primeira.atualizada).toBe(false);
    expect(segunda.atualizada).toBe(true);
    expect(segunda.linkExterno).toBe(primeira.linkExterno);
    expect(JSON.parse(fetchFalso.mock.calls[1][1].body).demandaId).toBe("q-1");
  });

  it("falha ESTOURA — 'publicou pela metade' não existe", async () => {
    /**
     * Modo de falhar oposto ao do `ExportadorDeItens`, e de propósito: lá o
     * resultado é por item e a falha parcial é informação útil. Aqui é uma coisa
     * só, e engolir a falha faria a pessoa achar que a página está lá.
     */
    const rede = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const http500 = vi.fn().mockResolvedValue(respostaJson({ erro: "sem permissão" }, false, 403));

    await expect(criarPublicadorDeDocumentoViaGateway(DESTINO_DOC, rede).publicar(DOCUMENTO)).rejects.toThrow(
      /não consegui falar com Confluence/
    );
    await expect(criarPublicadorDeDocumentoViaGateway(DESTINO_DOC, http500).publicar(DOCUMENTO)).rejects.toThrow(
      /Confluence respondeu HTTP 403/
    );
  });

  it("resposta 200 SEM link também estoura — publicação que não dá para conferir não aconteceu", async () => {
    // Sem link, a pessoa não tem como verificar e o produto não tem o que
    // mostrar. Aceitar em silêncio seria pior que falhar.
    const fetchFalso = vi.fn().mockResolvedValue(respostaJson({ ok: true }));

    await expect(criarPublicadorDeDocumentoViaGateway(DESTINO_DOC, fetchFalso).publicar(DOCUMENTO)).rejects.toThrow(
      /sem "linkExterno"/
    );
  });
});

const DESTINO_ARQ: DestinoResolvido = {
  id: "arq",
  operacao: "arquiteturaDeNegocio",
  endpoint: "https://gw.casa/arquitetura",
  rotulo: "Arquitetura de negócio",
  cabecalhos: {},
  metodo: "POST" as const,
  envelope: "",
  espaco: "",
};

describe("ler a arquitetura de negócio (SPEC-81 fatia F)", () => {
  it("traz os campos de prosa e o glossário", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      respostaJson({
        objetivo: "Vender no atacado",
        sistemas: "ERP e bureau",
        glossario: [{ termo: "Bureau", definicao: "quem responde pelo score" }],
      })
    );

    const lida = await criarLeitorDeArquiteturaViaGateway(DESTINO_ARQ, fetchFalso).ler();

    expect(lida?.objetivo).toBe("Vender no atacado");
    expect(lida?.sistemas).toBe("ERP e bureau");
    expect(lida?.glossario).toEqual([{ termo: "Bureau", definicao: "quem responde pelo score" }]);
    // Campo que a casa não tem fica ausente, não vira string vazia — vazio
    // viraria uma proposta de apagar o que já está escrito aqui.
    expect(lida?.objetivo && lida.quemUsa).toBeUndefined();
  });

  it("termo sem definição não é termo de glossário", async () => {
    // O glossário existe para dizer o que a palavra significa AQUI. Uma palavra
    // solta não faz esse trabalho, e importá-la encheria a lista de nada.
    const fetchFalso = vi.fn().mockResolvedValue(
      respostaJson({ glossario: [{ termo: "SKU" }, { definicao: "sem termo" }, { termo: "Bureau", definicao: "ok" }] })
    );

    expect((await criarLeitorDeArquiteturaViaGateway(DESTINO_ARQ, fetchFalso).ler())?.glossario).toEqual([
      { termo: "Bureau", definicao: "ok" },
    ]);
  });

  it("resposta 200 SEM nada aproveitável é o mesmo que não ter respondido", async () => {
    /**
     * Devolver `{}` faria a tela abrir uma proposta vazia — que é pior que dizer
     * "não achei nada", porque a pessoa gasta a atenção antes de descobrir.
     */
    const vazio = vi.fn().mockResolvedValue(respostaJson({ versao: 3 }));

    expect(await criarLeitorDeArquiteturaViaGateway(DESTINO_ARQ, vazio).ler()).toBeUndefined();
  });

  it("gateway fora do ar degrada — ninguém fica impedido de escrever à mão", async () => {
    const rede = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const http500 = vi.fn().mockResolvedValue(respostaJson({}, false, 500));

    expect(await criarLeitorDeArquiteturaViaGateway(DESTINO_ARQ, rede).ler()).toBeUndefined();
    expect(await criarLeitorDeArquiteturaViaGateway(DESTINO_ARQ, http500).ler()).toBeUndefined();
  });
});

/**
 * §348 — **a chamada honra o que o destino declara.**
 *
 * O §346 criou `metodo` e `envelope` na configuração e parou ali: `postar`
 * continuava com `POST` fixo e o corpo cru. A tela oferecia escolher `PUT` e o
 * produto mandava `POST` de qualquer jeito — **meia integração é pior que
 * nenhuma**, porque promete o que não faz.
 *
 * E o `espaco` responde ao pedido do usuário: *"configurar o link de um espaço do
 * time no confluence e ele postar o design doc lá"*.
 */
describe("o curl que o destino declara (§348)", () => {
  const respostaOk = () =>
    vi.fn(async () => new Response(JSON.stringify({ linkExterno: "https://wiki/p/1" }), { status: 200 }));

  const publicar = async (destino: Partial<DestinoResolvido>) => {
    const rede = respostaOk();
    await criarPublicadorDeDocumentoViaGateway({ ...DESTINO_DOC, ...destino }, rede).publicar(DOCUMENTO);
    const [url, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    return { url, metodo: init.method, corpo: JSON.parse(init.body as string) };
  };

  it("usa o MÉTODO declarado — publicar página viva é idempotente, e o verbo diz isso", async () => {
    expect((await publicar({ metodo: "PUT" })).metodo).toBe("PUT");
    expect((await publicar({ metodo: "PATCH" })).metodo).toBe("PATCH");
  });

  it("sem declarar, continua POST — quem configurou antes não muda nada", async () => {
    expect((await publicar({})).metodo).toBe("POST");
  });

  it("embrulha o payload no ENVELOPE declarado", async () => {
    const { corpo } = await publicar({ envelope: "data" });

    expect(Object.keys(corpo)).toEqual(["data"]);
    expect(corpo.data.demandaId).toBe("q-1");
  });

  it("envelope VAZIO manda o payload na raiz — é escolha, não ausência", async () => {
    /**
     * O caso que um `!destino.envelope` teria quebrado: ele trataria a ausência e
     * a escolha como a mesma coisa. Há agentes que esperam o corpo cru, e
     * obrigá-los a um campo que ignoram seria inventar contrato.
     */
    const { corpo } = await publicar({ envelope: "" });

    expect(corpo.demandaId).toBe("q-1");
    expect(corpo.data).toBeUndefined();
  });

  it("manda o ESPAÇO junto do documento, quando o destino o declara", async () => {
    // É dado do pedido — *publique isto ali* —, não metadado de transporte: por
    // isso vai no payload, e não em cabeçalho ou query.
    const { corpo } = await publicar({ espaco: "ENG", envelope: "" });

    expect(corpo.espaco).toBe("ENG");
    expect(corpo.demandaId).toBe("q-1");
  });

  it("o espaço entra DENTRO do envelope, não ao lado dele", async () => {
    // Ao lado, um agente que lê só o envelope perderia o espaço em silêncio — e
    // publicaria no padrão dele achando que obedeceu.
    const { corpo } = await publicar({ espaco: "ENG", envelope: "data" });

    expect(corpo.data.espaco).toBe("ENG");
    expect(corpo.espaco).toBeUndefined();
  });

  it("sem espaço declarado, nada é inventado — o gateway usa o padrão dele", async () => {
    const { corpo } = await publicar({ envelope: "" });

    expect("espaco" in corpo).toBe(false);
  });
});
