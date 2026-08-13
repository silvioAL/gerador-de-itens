import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "../config/types.js";
import { aplicarOperacao, descreverOperacao, diferencaDoChecklist } from "./ajusteDeRegras.js";

const base: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: {
    Backend: {
      checklistTecnico: [{ texto: "Logs relevantes emitidos", contextos: [] }],
      testes: [],
    },
  },
};

describe("ajusteDeRegras (SPEC-45 — o ajuste como dado)", () => {
  it("adicionar entra no checklist da tech, sem tocar no documento original", () => {
    const depois = aplicarOperacao(base, {
      tipo: "adicionar-checklist",
      tech: "Backend",
      contextos: ["Backend-mensageria"],
      texto: "Política de DLQ definida",
    });

    expect(depois.porTech.Backend.checklistTecnico).toHaveLength(2);
    expect(depois.porTech.Backend.checklistTecnico?.[1]).toEqual({
      texto: "Política de DLQ definida",
      contextos: ["Backend-mensageria"],
    });
    // O original intacto: a prévia compara antes/depois lado a lado.
    expect(base.porTech.Backend.checklistTecnico).toHaveLength(1);
  });

  it("adicionar o MESMO texto duas vezes não duplica — duas aprovações parecidas não sujam o checklist", () => {
    const op = { tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "Política de DLQ definida" } as const;
    const uma = aplicarOperacao(base, op);
    const duas = aplicarOperacao(uma, op);
    expect(duas.porTech.Backend.checklistTecnico).toHaveLength(2);
  });

  it("remover tira a linha; remover o que não existe é no-op, não erro", () => {
    const semLogs = aplicarOperacao(base, { tipo: "remover-checklist", tech: "Backend", texto: "Logs relevantes emitidos" });
    expect(semLogs.porTech.Backend.checklistTecnico).toHaveLength(0);

    const inexistente = aplicarOperacao(base, { tipo: "remover-checklist", tech: "Backend", texto: "nunca existiu" });
    expect(inexistente.porTech.Backend.checklistTecnico).toHaveLength(1);
  });

  it("tech que ainda não existe no documento nasce com o item", () => {
    const depois = aplicarOperacao(base, {
      tipo: "adicionar-checklist",
      tech: "Frontend",
      contextos: [],
      texto: "Acessibilidade verificada",
    });
    expect(depois.porTech.Frontend.checklistTecnico).toEqual([{ texto: "Acessibilidade verificada", contextos: [] }]);
    expect(depois.porTech.Backend.checklistTecnico).toHaveLength(1);
  });

  it("a diferença diz o que entra e o que sai — é o que a prévia pinta", () => {
    const depois = aplicarOperacao(base, { tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "DLQ" });
    expect(diferencaDoChecklist(base, depois, "Backend")).toEqual({ adicionados: ["DLQ"], removidos: [] });

    const removido = aplicarOperacao(base, { tipo: "remover-checklist", tech: "Backend", texto: "Logs relevantes emitidos" });
    expect(diferencaDoChecklist(base, removido, "Backend")).toEqual({
      adicionados: [],
      removidos: ["Logs relevantes emitidos"],
    });
  });

  it("a descrição fala português pra quem decide, não estrutura", () => {
    expect(
      descreverOperacao({ tipo: "adicionar-checklist", tech: "Backend", contextos: ["Backend-dados"], texto: "TTL definido" })
    ).toBe('Adicionar ao checklist técnico de Backend (contextos: Backend-dados): "TTL definido"');
    expect(descreverOperacao({ tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "X" })).toContain(
      "todos os contextos"
    );
    expect(descreverOperacao({ tipo: "remover-checklist", tech: "Backend", texto: "Y" })).toBe(
      'Remover do checklist técnico de Backend: "Y"'
    );
  });
});
