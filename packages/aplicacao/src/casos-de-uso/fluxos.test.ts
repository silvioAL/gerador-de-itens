import { describe, expect, it } from "vitest";
import { executarFluxo } from "./fluxos.js";
import { normalizarFluxos } from "../config/fluxos.js";

function fluxoDe(nos: unknown[], arestas: unknown[]) {
  return normalizarFluxos({ fluxos: [{ id: "f", nos, arestas }] }).fluxos[0];
}

const JMETER = fluxoDe(
  [
    { id: "volumetria", tipo: "conector", refId: "volumetria-dynatrace" },
    { id: "gerador", tipo: "agente", refId: "especialista" },
    { id: "commit", tipo: "conector", refId: "repo" },
  ],
  [
    { de: "volumetria", para: "gerador", mapeamento: [{ saida: "rps", entrada: "volumetria" }] },
    { de: "gerador", para: "commit", mapeamento: [{ saida: "texto", entrada: "arquivo" }] },
  ]
);

describe("executarFluxo (SPEC-105 fatia D — a metade pura)", () => {
  it("o exemplo do JMeter (§4.2): a saída de um alimenta a entrada do outro", async () => {
    const chamadas: Record<string, unknown>[] = [];
    const resultado = await executarFluxo(JMETER, {
      conector: async (no, parametros) => {
        chamadas.push({ no: no.id, parametros });
        return no.id === "volumetria" ? { rps: 120, pico: 340 } : { linkExterno: "https://repo/x" };
      },
      agente: async (_no, entradas) => {
        chamadas.push({ no: "gerador", entradas });
        return { texto: `<jmeterTestPlan rps="${entradas.volumetria}"/>` };
      },
    });

    expect(resultado.nos.map((n) => [n.noId, n.estado])).toEqual([
      ["volumetria", "sucesso"],
      ["gerador", "sucesso"],
      ["commit", "sucesso"],
    ]);
    // O `rps` do conector virou `volumetria` do agente; o `texto` do agente
    // virou `arquivo` do commit — é o mapeamento carregando dado, não ordem.
    expect(chamadas[1]).toEqual({ no: "gerador", entradas: { volumetria: 120 } });
    expect(chamadas[2]).toEqual({ no: "commit", parametros: { arquivo: '<jmeterTestPlan rps="120"/>' } });
  });

  it("§9.3 — o nó que falha para o RAMO; o independente segue", async () => {
    const fluxo = fluxoDe(
      [
        { id: "quebra", tipo: "conector", refId: "c1" },
        { id: "dependente", tipo: "agente", refId: "p" },
        { id: "neto", tipo: "conector", refId: "c2" },
        { id: "independente", tipo: "conector", refId: "c3" },
      ],
      [
        { de: "quebra", para: "dependente", mapeamento: [{ saida: "x", entrada: "x" }] },
        { de: "dependente", para: "neto", mapeamento: [{ saida: "y", entrada: "y" }] },
      ]
    );

    const resultado = await executarFluxo(fluxo, {
      conector: async (no) => {
        if (no.id === "quebra") throw new Error("HTTP 500 do outro lado");
        return { ok: true };
      },
      agente: async () => ({ texto: "nunca deveria rodar" }),
    });

    const porNo = Object.fromEntries(resultado.nos.map((n) => [n.noId, n]));
    expect(porNo.quebra.estado).toBe("falhou");
    expect(porNo.quebra.erro).toContain("HTTP 500");
    // Dependentes NÃO rodam — entrada ausente nunca vira default — e o rastro
    // aponta a origem, não o nó inocente.
    expect(porNo.dependente.estado).toBe("nao-executado");
    expect(porNo.dependente.erro).toContain('"quebra" falhou');
    expect(porNo.neto.estado).toBe("nao-executado");
    expect(porNo.neto.erro).toContain('"dependente" não rodou');
    // O ramo independente seguiu: derrubar tudo perderia trabalho bom.
    expect(porNo.independente.estado).toBe("sucesso");
  });

  it("`ateNo` roda só o fecho de ancestrais — o resto nem dispara", async () => {
    // "Ver o resultado de um agente antes de rodar o próximo": o commit (que
    // AGE no mundo) não pode disparar quando só se quer inspecionar o meio.
    const chamados: string[] = [];
    const resultado = await executarFluxo(
      JMETER,
      {
        conector: async (no) => {
          chamados.push(no.id);
          return { rps: 120 };
        },
        agente: async () => {
          chamados.push("gerador");
          return { texto: "jmx" };
        },
      },
      { ateNo: "gerador" }
    );

    expect(chamados).toEqual(["volumetria", "gerador"]);
    expect(resultado.nos.map((n) => n.noId)).toEqual(["volumetria", "gerador"]);
    expect(resultado.saidas.commit).toBeUndefined();
  });

  it("ciclo nem começa — recusa, não falha parcial", async () => {
    const fluxo = fluxoDe(
      [
        { id: "a", tipo: "conector", refId: "c" },
        { id: "b", tipo: "conector", refId: "c" },
      ],
      [
        { de: "a", para: "b", mapeamento: [] },
        { de: "b", para: "a", mapeamento: [] },
      ]
    );
    const resultado = await executarFluxo(fluxo, {
      conector: async () => {
        throw new Error("não deveria ser chamado");
      },
      agente: async () => ({}),
    });
    expect(resultado.ciclo).toBeDefined();
    expect(resultado.nos).toEqual([]);
  });
});
