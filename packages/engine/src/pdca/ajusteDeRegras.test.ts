import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "../config/types.js";
import { aplicarOperacao, descreverOperacao, diferencaDoChecklist, secaoDaOperacao } from "./ajusteDeRegras.js";

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

  it("SPEC-46 — sem `secao`, continua sendo o checklist técnico: pedido antigo segue aplicável", () => {
    const op = { tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "X" } as const;
    expect(secaoDaOperacao(op)).toBe("checklistTecnico");
    expect(aplicarOperacao(base, op).porTech.Backend.checklistTecnico).toHaveLength(2);
  });

  it("SPEC-46 — checklist de PROCESSO tem seção própria e não invade o técnico", () => {
    const depois = aplicarOperacao(base, {
      tipo: "adicionar-checklist",
      secao: "checklistProcesso",
      tech: "Backend",
      contextos: [],
      texto: "Repontar massa de teste",
    });

    expect(depois.porTech.Backend.checklistProcesso).toEqual([{ texto: "Repontar massa de teste", contextos: [] }]);
    expect(depois.porTech.Backend.checklistTecnico).toHaveLength(1);
    expect(secaoDaOperacao({ tipo: "remover-checklist", secao: "checklistProcesso", tech: "Backend", texto: "x" })).toBe(
      "checklistProcesso"
    );
  });

  it("SPEC-46 — ciclo de teste entra com validação e ambientes; remover tira pelo tipo", () => {
    const comTeste = aplicarOperacao(base, {
      tipo: "adicionar-teste",
      tech: "Backend",
      contextos: ["Backend-dados"],
      tipoTeste: "Teste de migração",
      validacao: "roda limpo em base vazia",
      dev: true,
      hlg: false,
    });
    expect(comTeste.porTech.Backend.testes).toEqual([
      { tipo: "Teste de migração", validacao: "roda limpo em base vazia", contextos: ["Backend-dados"], dev: true, hlg: false },
    ]);

    const semTeste = aplicarOperacao(comTeste, { tipo: "remover-teste", tech: "Backend", tipoTeste: "Teste de migração" });
    expect(semTeste.porTech.Backend.testes).toHaveLength(0);
  });

  it("SPEC-46 — volumetria liga e desliga por tech (o 'sobrou volumetria' do feedback real)", () => {
    const com = aplicarOperacao(base, { tipo: "definir-volumetria", tech: "Backend", contextos: ["Backend-dados"] });
    expect(com.porTech.Backend.volumetria).toEqual({ contextos: ["Backend-dados"] });

    const sem = aplicarOperacao(com, { tipo: "remover-volumetria", tech: "Backend" });
    expect(sem.porTech.Backend.volumetria).toBeUndefined();
    // E o original continua intacto — a prévia compara os dois.
    expect(com.porTech.Backend.volumetria).toEqual({ contextos: ["Backend-dados"] });
  });

  it("SPEC-46 — a seção manda em QUEM aprova, então cada operação diz a sua", () => {
    expect(secaoDaOperacao({ tipo: "adicionar-teste", tech: "T", contextos: [], tipoTeste: "x", validacao: "y", dev: true, hlg: true })).toBe("testes");
    expect(secaoDaOperacao({ tipo: "definir-volumetria", tech: "T", contextos: [] })).toBe("volumetria");
    expect(secaoDaOperacao({ tipo: "remover-volumetria", tech: "T" })).toBe("volumetria");
  });

  it("SPEC-46 — a descrição nomeia a seção certa pra quem decide", () => {
    expect(
      descreverOperacao({ tipo: "adicionar-checklist", secao: "checklistProcesso", tech: "Backend", contextos: [], texto: "Massa" })
    ).toContain("checklist de processo");
    expect(
      descreverOperacao({ tipo: "adicionar-teste", tech: "Backend", contextos: [], tipoTeste: "Contrato", validacao: "pacto ok", dev: true, hlg: false })
    ).toContain("ciclos de teste de Backend");
    expect(descreverOperacao({ tipo: "remover-volumetria", tech: "Backend" })).toBe(
      "Não exigir mais requisitos de volumetria em Backend"
    );
  });

  it("SPEC-46 — o diff sabe olhar a seção pedida", () => {
    const comProcesso = aplicarOperacao(base, {
      tipo: "adicionar-checklist",
      secao: "checklistProcesso",
      tech: "Backend",
      contextos: [],
      texto: "Massa repontada",
    });
    expect(diferencaDoChecklist(base, comProcesso, "Backend", "checklistProcesso")).toEqual({
      adicionados: ["Massa repontada"],
      removidos: [],
    });
    // Na seção técnica, nada mudou.
    expect(diferencaDoChecklist(base, comProcesso, "Backend")).toEqual({ adicionados: [], removidos: [] });
  });
});
