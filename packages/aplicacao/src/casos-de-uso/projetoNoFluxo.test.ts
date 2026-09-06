import { describe, expect, it } from "vitest";
import { demandaAtiva, erroSemDemanda, saidaDoProjeto, varianteProposta } from "./projetoNoFluxo.js";
import type { QuebraSalva, ResumoQuebra } from "../portas/repositorioDeQuebras.js";

function resumo(id: string, time: string | null, atualizadoEm: string): ResumoQuebra {
  return { id, titulo: id, time, criadoEm: atualizadoEm, atualizadoEm } as ResumoQuebra;
}

const QUEBRA = {
  id: "q1",
  titulo: "Aprovação de crédito",
  time: "time-pagamentos",
  diagrama: { nodes: [{ id: "a" }], edges: [] },
  respostasItens: {},
  demandInfo: "",
  anexosContexto: [],
  produtoId: null,
  necessidades: [{ id: "n1", texto: "aprovar em segundos", origem: "manual", atendidaPor: [] }],
  excecoes: [],
  decisoes: [],
  percursos: [],
  artefatosEscritos: {},
  documentoStatus: null,
  volumetria: undefined,
  variantes: [],
  especificacao: null,
  criadoEm: "2026-09-01T00:00:00.000Z",
  atualizadoEm: "2026-09-01T00:00:00.000Z",
} as unknown as QuebraSalva;

describe("demandaAtiva (SPEC-107 fatia B)", () => {
  it("é a mais recentemente atualizada DO TIME — o aberto-agora é do navegador, não do servidor", () => {
    const resumos = [
      resumo("velha-do-time", "time-a", "2026-09-01T00:00:00.000Z"),
      resumo("nova-de-outro-time", "time-b", "2026-09-05T00:00:00.000Z"),
      resumo("nova-do-time", "time-a", "2026-09-03T00:00:00.000Z"),
    ];
    expect(demandaAtiva(resumos, "time-a")?.id).toBe("nova-do-time");
    // Sem time, vale a mais recente de todas.
    expect(demandaAtiva(resumos)?.id).toBe("nova-de-outro-time");
  });

  it("§9.3 — sem candidata não há default: null, e o erro diz o nome do que faltou", () => {
    expect(demandaAtiva([], "time-a")).toBeNull();
    expect(erroSemDemanda("time-a").message).toContain('do time "time-a"');
    expect(erroSemDemanda().message).toContain('informe "demandaId"');
  });
});

describe("saidaDoProjeto", () => {
  it("o desenho é o SUBCONJUNTO que as funções leem, não a quebra inteira", () => {
    const saida = saidaDoProjeto(QUEBRA, [{ chave: "i1" }]);
    const desenho = saida.desenho as Record<string, unknown>;
    expect(desenho.diagrama).toBe(QUEBRA.diagrama);
    expect(desenho.time).toBe("time-pagamentos");
    expect(desenho.necessidades).toEqual(QUEBRA.necessidades);
    // Nada de respostasItens/anexos/especificacao dentro do desenho: o que
    // viaja pela aresta (e vai ao rastro como entrada de função) é contrato.
    expect(desenho.respostasItens).toBeUndefined();
    expect(desenho.anexosContexto).toBeUndefined();
    expect(saida.itens).toEqual([{ chave: "i1" }]);
    expect(saida.demandaId).toBe("q1");
    expect(saida.titulo).toBe("Aprovação de crédito");
  });

  it("§9.3 — volumetria não declarada e documento nunca gerado FICAM FORA, nunca viram default", () => {
    const saida = saidaDoProjeto(QUEBRA, []);
    expect("volumetria" in saida).toBe(false);
    expect("markdown" in saida).toBe(false);

    const comTudo = saidaDoProjeto(
      { ...QUEBRA, volumetria: { taxaRps: 10 }, especificacao: "# Doc" } as unknown as QuebraSalva,
      []
    );
    expect(comTudo.volumetria).toEqual({ taxaRps: 10 });
    expect(comTudo.markdown).toBe("# Doc");
  });
});

describe("varianteProposta — importar não é aceitar (§2.4-14)", () => {
  it("o desenho mapeado vira variante com título de proposta e o motivo dizendo quem escreveu", () => {
    const variante = varianteProposta(
      { diagrama: { nodes: [], edges: [] } },
      { id: "importa-desenho", nome: "Importar desenho da casa" },
      "proposta-abc",
      "2026-09-05T12:00:00.000Z"
    );
    expect(variante.titulo).toBe('Proposta do fluxo "Importar desenho da casa"');
    expect(variante.id).toBe("proposta-abc");
    expect(variante.criadaEm).toBe("2026-09-05T12:00:00.000Z");
    expect(variante.motivo).toContain("adotar");
  });

  it("desenho sem a forma de desenho barra com o nome do que se esperava (o mesmo validador da derivação, §263)", () => {
    expect(() => varianteProposta("um texto", { id: "f", nome: "F" }, "x", "y")).toThrow(/forma de um desenho/);
  });
});
