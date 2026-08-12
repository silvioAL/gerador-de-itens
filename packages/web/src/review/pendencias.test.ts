import { describe, expect, it } from "vitest";
import { derivar, montarFichaItem, resolverDependencias } from "@gerador/engine";
import type { Diagrama, DiagramaConfig, RegrasConfig, ValorSpec } from "@gerador/engine";
import { assinarSugestao, fraseDeCompletude, pendenciasDaRevisao, respostaConfirmada } from "./pendencias";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: [],
      spec: [{ key: "nome", label: "Nome", type: "text", required: true }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

const regras: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: { Backend: { checklistTecnico: [{ texto: "Logs emitidos", contextos: [] }], testes: [] } },
};

const diagrama: Diagrama = {
  nodes: [{ id: "n1", type: "service", status: "novo", label: "srv", x: 0, y: 0, spec: { nome: { valor: "srv", origem: "manual" } }, specNA: {} }],
  edges: [],
};

function fichaCom(respostas: Record<string, ValorSpec>) {
  const atividades = resolverDependencias(derivar(diagrama, config, {})).atividades;
  const a = atividades[0];
  return { chave: a.chave, rotulo: a.rotulo, ficha: montarFichaItem(1, a, diagrama, config, regras, respostas) };
}

describe("pendenciasDaRevisao (SPEC-44 — a régua única)", () => {
  it("separa sugestão aguardando (escrita, não assinada) de campo vazio (não escrito)", () => {
    const item = fichaCom({
      _historiaUsuario: { valor: "Como analista...", origem: "sugerido", confirmado: false },
      "Backend::Logs emitidos": { valor: "sim, via Winston", origem: "manual" },
    });
    const pend = pendenciasDaRevisao([item]);

    expect(pend.sugestoes).toHaveLength(1);
    expect(pend.sugestoes[0].chave).toBe("_historiaUsuario");
    expect(pend.sugestoes[0].itemChave).toBe(item.chave);
    expect(pend.confirmados).toBe(1);
    expect(pend.vazios).toBe(pend.totais - 2);
    expect(pend.totais).toBeGreaterThanOrEqual(3);
  });

  it("sugerido+confirmado conta como confirmado — mesma régua da prontidão", () => {
    const item = fichaCom({
      _historiaUsuario: { valor: "x", origem: "sugerido", confirmado: true },
    });
    const pend = pendenciasDaRevisao([item]);
    expect(pend.sugestoes).toHaveLength(0);
    expect(pend.confirmados).toBe(1);
  });

  it("assinarSugestao NÃO apaga a procedência: origem continua 'sugerido'", () => {
    const assinada = assinarSugestao({ valor: "x", origem: "sugerido", confirmado: false });
    expect(assinada.origem).toBe("sugerido");
    expect(assinada.confirmado).toBe(true);
    expect(respostaConfirmada(assinada)).toBe(true);
  });

  it("fraseDeCompletude fala o mesmo idioma da tela de itens", () => {
    expect(fraseDeCompletude(0, 0)).toBe("pronto");
    expect(fraseDeCompletude(2, 0)).toBe("2 sugestões a confirmar");
    expect(fraseDeCompletude(1, 3)).toBe("1 sugestão a confirmar · ✍️ 3 a especificar");
    expect(fraseDeCompletude(0, 1)).toBe("✍️ 1 a especificar");
  });
});
