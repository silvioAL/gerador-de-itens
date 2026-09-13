import { describe, expect, it } from "vitest";
import type { Diagrama, DiagramaConfig } from "@gerador/engine";
import { calcularResumoProntidao, motivoDerivarDesabilitado } from "./prontidaoResumo";
import type { NoComProntidao } from "./prontidaoResumo";

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

/**
 * SPEC-112 fatia B (M3) — a prova de unidade da frase que a SPEC pede: o
 * motivo do Derivar desabilitado precisa estar no CORPO da tela, não só no
 * `title` do botão (sem tooltip em toque).
 */
describe("motivoDerivarDesabilitado", () => {
  const vermelho = (labelDoNo: string): NoComProntidao => ({
    no: { id: labelDoNo, type: "service", status: "novo", label: labelDoNo, x: 0, y: 0, spec: {}, specNA: {} },
    nivel: "vermelho",
    camposFaltando: ["Nome do serviço"],
  });

  it("sem vermelho nenhum, não há motivo (o Derivar está habilitado)", () => {
    expect(motivoDerivarDesabilitado([])).toBeNull();
  });

  it("no singular, fala de UM componente", () => {
    expect(motivoDerivarDesabilitado([vermelho("Fila Rabbit")])).toBe(
      "1 componente com campo obrigatório em branco: Fila Rabbit"
    );
  });

  it("no plural, soma e NOMEIA cada componente — não só a contagem", () => {
    expect(motivoDerivarDesabilitado([vermelho("Fila Rabbit"), vermelho("Serviço de Pagamento")])).toBe(
      "2 componentes com campo obrigatório em branco: Fila Rabbit, Serviço de Pagamento"
    );
  });
});
