import { describe, expect, it } from "vitest";
import type { Diagrama, DiagramaConfig } from "@gerador/engine";
import { calcularResumoProntidao } from "./prontidaoResumo";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: [],
      contextos: [],
      spec: [
        { key: "nome", label: "Nome do serviço", type: "text", required: true },
        { key: "linguagem", label: "Linguagem/Stack", type: "text", required: true, permiteNA: true },
      ],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

function diagramaCom(nodes: Diagrama["nodes"]): Diagrama {
  return { nodes, edges: [] };
}

describe("calcularResumoProntidao", () => {
  it("nó vermelho traz os RÓTULOS dos campos obrigatórios em aberto, não as chaves cruas", () => {
    const diagrama = diagramaCom([
      { id: "n1", type: "service", status: "novo", label: "srv-x", x: 0, y: 0, spec: {}, specNA: {} },
    ]);
    const { vermelhos } = calcularResumoProntidao(diagrama, config);

    expect(vermelhos).toHaveLength(1);
    expect(vermelhos[0].no.label).toBe("srv-x");
    expect(vermelhos[0].camposFaltando).toEqual(
      expect.arrayContaining(["Nome do serviço", "Linguagem/Stack"])
    );
    expect(vermelhos[0].camposFaltando).not.toContain("nome");
  });

  it("nó verde não entra em vermelhos/amarelos", () => {
    const diagrama = diagramaCom([
      {
        id: "n1",
        type: "service",
        status: "novo",
        label: "srv-x",
        x: 0,
        y: 0,
        spec: { nome: { valor: "srv-x", origem: "manual" } },
        specNA: { linguagem: { motivo: "não decidido ainda" } },
      },
    ]);
    const resumo = calcularResumoProntidao(diagrama, config);

    expect(resumo.vermelhos).toHaveLength(0);
    expect(resumo.amarelos).toHaveLength(0);
    expect(resumo.verdes.map((n) => n.id)).toEqual(["n1"]);
  });

  it("tipo de nó inexistente na config vira vermelho com um motivo explícito, não quebra", () => {
    const diagrama = diagramaCom([
      { id: "n1", type: "tipo-fantasma", status: "novo", label: "x", x: 0, y: 0, spec: {}, specNA: {} },
    ]);
    const { vermelhos } = calcularResumoProntidao(diagrama, config);

    expect(vermelhos).toHaveLength(1);
    expect(vermelhos[0].camposFaltando[0]).toMatch(/não existe na config/);
  });
});
