import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "../config/types.js";
import type { OperacaoDeAjuste } from "./ajusteDeRegras.js";
import {
  aplicarOperacao,
  aplicarOperacaoNoPipeline,
  aplicarOperacaoNosCampos,
  descreverOperacao,
  diferencaDeCampos,
  diferencaDoChecklist,
  recursoAlvoDaOperacao,
  secaoDaOperacao,
} from "./ajusteDeRegras.js";

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
    const op: OperacaoDeAjuste = { tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "Política de DLQ definida" };
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
    const op: OperacaoDeAjuste = { tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "X" };
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

  it("SPEC-50 — papel da esteira também é ajuste: liga/desliga sem tocar no resto do documento", () => {
    const pipeline = {
      confirmacaoObrigatoria: true,
      papeis: [
        { id: "po", nome: "PO", ativo: true },
        { id: "qa", nome: "QA", ativo: true },
      ],
    };

    const semQa = aplicarOperacaoNoPipeline(pipeline, { tipo: "desativar-papel", papelId: "qa", papelNome: "QA" });
    expect(semQa.papeis.find((p) => p.id === "qa")?.ativo).toBe(false);
    expect(semQa.papeis.find((p) => p.id === "po")?.ativo).toBe(true);
    expect(semQa.confirmacaoObrigatoria).toBe(true);
    // O original intacto — a prévia compara os dois.
    expect(pipeline.papeis.find((p) => p.id === "qa")?.ativo).toBe(true);

    const comQa = aplicarOperacaoNoPipeline(semQa, { tipo: "ativar-papel", papelId: "qa" });
    expect(comQa.papeis.find((p) => p.id === "qa")?.ativo).toBe(true);
  });

  it("SPEC-50 — papel inexistente é no-op (a config pode ter mudado entre o pedido e a decisão)", () => {
    const pipeline = { papeis: [{ id: "po", ativo: true }] };
    expect(aplicarOperacaoNoPipeline(pipeline, { tipo: "desativar-papel", papelId: "sumiu" })).toEqual(pipeline);
  });

  it("SPEC-50 — o alvo diz qual DOCUMENTO muda: é o que decide o gate e o caminho de aplicar", () => {
    expect(recursoAlvoDaOperacao({ tipo: "desativar-papel", papelId: "qa" })).toBe("pipeline-agentes");
    expect(recursoAlvoDaOperacao({ tipo: "adicionar-checklist", tech: "T", contextos: [], texto: "x" })).toBe("regras");
  });

  it("SPEC-50 — a descrição fala de papel, não de seção de regras", () => {
    expect(descreverOperacao({ tipo: "desativar-papel", papelId: "qa", papelNome: "QA" })).toBe(
      'Desligar o papel "QA" da esteira de agentes'
    );
    expect(descreverOperacao({ tipo: "ativar-papel", papelId: "qa" })).toContain('Ligar o papel "qa"');
  });
});

/**
 * SPEC-52 — a ficha do componente (e da conexão) entra no ciclo. O que se
 * prova aqui é a régua ÚNICA: a mesma função que a tela usa pra prévia é a que
 * o servidor usa pra decidir o que gravar.
 */
describe("aplicarOperacaoNosCampos (SPEC-52)", () => {
  const ficha = [
    { key: "sla", label: "SLA", tipoCampo: "text" as const, obrigatorio: false },
    { key: "dono", label: "Dono", tipoCampo: "text" as const, obrigatorio: true },
  ];

  it("adiciona o campo no fim da ficha, sem mutar a de antes", () => {
    const depois = aplicarOperacaoNosCampos(ficha, {
      tipo: "adicionar-campo-no",
      tipoNo: "service",
      campo: { key: "volumetria", label: "Volumetria esperada", tipoCampo: "number", obrigatorio: true },
    });

    expect(depois.map((c) => c.key)).toEqual(["sla", "dono", "volumetria"]);
    expect(depois.at(-1)).toMatchObject({ label: "Volumetria esperada", obrigatorio: true });
    // O original intacto: a prévia mostra os dois lados ao mesmo tempo.
    expect(ficha).toHaveLength(2);
  });

  it("adicionar o que já existe é no-op — aprovar duas vezes não duplica campo na ficha de ninguém", () => {
    const depois = aplicarOperacaoNosCampos(ficha, {
      tipo: "adicionar-campo-no",
      tipoNo: "service",
      campo: { key: "sla", label: "SLA (outro rótulo)", tipoCampo: "text", obrigatorio: true },
    });
    expect(depois).toEqual(ficha);
  });

  it("remove pela chave, e remover o que não existe também é no-op", () => {
    expect(
      aplicarOperacaoNosCampos(ficha, { tipo: "remover-campo-no", tipoNo: "service", key: "sla" }).map((c) => c.key)
    ).toEqual(["dono"]);
    expect(aplicarOperacaoNosCampos(ficha, { tipo: "remover-campo-aresta", tipoAresta: "sync", key: "sumiu" })).toEqual(ficha);
  });

  it("operação de OUTRO alvo não mexe na ficha — passar pelo caminho errado é no-op, não exceção", () => {
    expect(aplicarOperacaoNosCampos(ficha, { tipo: "desativar-papel", papelId: "qa" })).toEqual(ficha);
    expect(aplicarOperacaoNosCampos(ficha, { tipo: "remover-volumetria", tech: "Java" })).toEqual(ficha);
  });

  it("os opcionais só viajam quando existem — campo sem ajuda não grava `ajuda: undefined`", () => {
    const [novo] = aplicarOperacaoNosCampos([], {
      tipo: "adicionar-campo-aresta",
      tipoAresta: "sync",
      campo: { key: "timeout", label: "Timeout", tipoCampo: "number", obrigatorio: false },
    });
    expect(Object.keys(novo).sort()).toEqual(["key", "label", "obrigatorio", "tipoCampo"]);
  });

  it("o diff diz o que entra e o que sai — é o que a prévia pinta e o servidor grava", () => {
    const depois = aplicarOperacaoNosCampos(ficha, {
      tipo: "adicionar-campo-no",
      tipoNo: "service",
      campo: { key: "novo", label: "Novo", tipoCampo: "text", obrigatorio: false },
    });
    expect(diferencaDeCampos(ficha, depois)).toEqual({
      adicionados: [{ key: "novo", label: "Novo", tipoCampo: "text", obrigatorio: false }],
      removidos: [],
    });
    expect(diferencaDeCampos(depois, ficha)).toMatchObject({ adicionados: [], removidos: [{ key: "novo" }] });
  });
});

describe("o alvo e a descrição das operações de campo (SPEC-52)", () => {
  it("cada operação de campo aponta pro SEU recurso — é o que decide quem aprova", () => {
    expect(recursoAlvoDaOperacao({ tipo: "remover-campo-no", tipoNo: "service", key: "sla" })).toBe("campos-no");
    expect(recursoAlvoDaOperacao({ tipo: "remover-campo-aresta", tipoAresta: "sync", key: "sla" })).toBe("campos-aresta");
  });

  it("a seção NÃO vira volumetria por descuido: operação de campo não é pedido de regra", () => {
    // O `default: return "volumetria"` antigo valia para tudo que não fosse
    // checklist ou teste — com as operações de campo, mandaria o pedido para o
    // dono da volumetria, que não tem nada com a ficha do componente.
    expect(secaoDaOperacao({ tipo: "adicionar-campo-no", tipoNo: "service", campo: { key: "k", label: "L", tipoCampo: "text", obrigatorio: false } })).not.toBe(
      "volumetria"
    );
  });

  it("a descrição fala de ficha e de campo, sem jargão de estrutura", () => {
    expect(
      descreverOperacao({
        tipo: "adicionar-campo-no",
        tipoNo: "service",
        campo: { key: "sla", label: "SLA", tipoCampo: "text", obrigatorio: true },
      })
    ).toBe('Adicionar à ficha de service o campo "SLA" (obrigatório)');
    expect(descreverOperacao({ tipo: "remover-campo-aresta", tipoAresta: "sync", key: "sla", label: "SLA" })).toBe(
      'Remover da ficha da conexão sync o campo "SLA"'
    );
  });

  it("aplicar uma operação de campo nas REGRAS é no-op — cada documento tem seu caminho", () => {
    const regras: RegrasConfig = { tipos: [], tamanhos: [], porTech: { Java: { checklistTecnico: [{ texto: "x", contextos: [] }], testes: [] } } };
    expect(aplicarOperacao(regras, { tipo: "remover-campo-no", tipoNo: "service", key: "sla" })).toEqual(regras);
  });
});
