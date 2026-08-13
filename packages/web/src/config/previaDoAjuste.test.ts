import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "@gerador/engine";
import { diagramaDeExemplo, simularItemComAjuste } from "./previaDoAjuste";

const config: DiagramaConfig = {
  nodeTypes: {
    fila: {
      label: "Fila Rabbit",
      derives: "queue",
      techs: ["Backend"],
      contextos: ["Backend-mensageria"],
      spec: [
        { key: "nome", label: "Nome da fila", type: "text", required: true, identificador: true },
        { key: "durable", label: "Durable", type: "boolean", required: false },
      ],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

const regras: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: { Backend: { checklistTecnico: [{ texto: "Logs relevantes emitidos", contextos: [] }], testes: [] } },
};

describe("previaDoAjuste (SPEC-45 — simular um item do mesmo tipo)", () => {
  it("o item de exemplo nasce com os campos obrigatórios preenchidos — prévia não ensina pendência", () => {
    const diagrama = diagramaDeExemplo(config, "fila");
    expect(diagrama.nodes[0].spec.nome?.valor).toBe("exemplo-nome");
    expect(diagrama.nodes[0].spec.durable).toBeUndefined();
  });

  it("a prévia mostra o item renderizado com a regra PROPOSTA, e diz a linha que entra", () => {
    const previa = simularItemComAjuste(config, regras, "fila", {
      tipo: "adicionar-checklist",
      tech: "Backend",
      contextos: [],
      texto: "Política de DLQ definida",
    });

    expect(previa).not.toBeNull();
    expect(previa!.markdown).toContain("Política de DLQ definida");
    expect(previa!.adicionados.some((l) => l.includes("Política de DLQ definida"))).toBe(true);
    expect(previa!.removidos).toHaveLength(0);
    expect(previa!.techs).toEqual(["Backend"]);
  });

  it("remover mostra a linha SAINDO — é a prévia de quem quer enxugar o checklist", () => {
    const previa = simularItemComAjuste(config, regras, "fila", {
      tipo: "remover-checklist",
      tech: "Backend",
      texto: "Logs relevantes emitidos",
    });

    expect(previa!.removidos.some((l) => l.includes("Logs relevantes emitidos"))).toBe(true);
    expect(previa!.markdown).not.toContain("Logs relevantes emitidos");
  });

  it("regra numa tech que o componente não usa não muda NADA no item — é o aviso que a prévia dá", () => {
    const previa = simularItemComAjuste(config, regras, "fila", {
      tipo: "adicionar-checklist",
      tech: "Frontend",
      contextos: [],
      texto: "Acessibilidade verificada",
    });

    expect(previa!.adicionados).toHaveLength(0);
    expect(previa!.markdown).not.toContain("Acessibilidade verificada");
  });

  it("sem operação, a prévia é o item como ele é hoje", () => {
    const previa = simularItemComAjuste(config, regras, "fila", null);
    expect(previa!.markdown).toContain("Logs relevantes emitidos");
    expect(previa!.adicionados).toHaveLength(0);
    expect(previa!.removidos).toHaveLength(0);
  });
});
