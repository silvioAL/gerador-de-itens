import { describe, expect, it } from "vitest";
import type { Diagrama } from "../model/types.js";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import { derivar } from "../derive/derivar.js";
import { resolverDependencias } from "../dependency/dependencias.js";
import { gerarEspecificacaoEntrega } from "./gerarEspecificacaoEntrega.js";
import { gerarItensDeTrabalho } from "./gerarItensDeTrabalho.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: [],
      spec: [{ key: "nome", label: "Nome do serviço", type: "text", required: true }],
    },
    mongo: {
      label: "Coleção Mongo",
      derives: "datastore",
      techs: ["Backend"],
      contextos: ["Backend-dados"],
      spec: [{ key: "collection", label: "Nome da coleção", type: "text", required: true }],
    },
  },
  edgeTypes: { writes: { label: "escreve", verbo: "escreve em", tamanhoPadrao: "P" } },
  edgeRules: { mongo: { valid: ["writes"], default: "writes" } },
};

const regras: RegrasConfig = {
  porTech: {
    Backend: {
      checklistTecnico: [{ texto: "Logs relevantes emitidos", contextos: ["Backend-dados"] }],
    },
  },
};

function diagramaBase(): Diagrama {
  return {
    nodes: [
      { id: "n1", type: "service", status: "novo", label: "srv-catalogo", x: 0, y: 0, spec: { nome: { valor: "srv-catalogo", origem: "manual" } } },
      { id: "n2", type: "mongo", status: "novo", label: "produtos", x: 0, y: 0, spec: { collection: { valor: "produtos", origem: "manual" } } },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2", type: "writes" }],
  };
}

describe("gerarItensDeTrabalho (SPEC-41 Parte B)", () => {
  it("um item por atividade, com o MESMO corpo que a especificação de entrega usa", () => {
    const diagrama = diagramaBase();
    const atividades = resolverDependencias(derivar(diagrama, config, {})).atividades;

    const itens = gerarItensDeTrabalho(atividades, diagrama, config, { regras });
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { regras });

    expect(itens).toHaveLength(atividades.length);
    for (const item of itens) {
      // Fonte única: cada corpo é literalmente uma seção do documento.
      expect(doc).toContain(item.corpoMarkdown);
      expect(item.titulo).not.toBe("");
    }
    expect(itens.map((i) => i.chave)).toEqual(atividades.map((a) => a.chave));
  });

  it("pendencias conta os '✍️ especificar' do corpo; responder um campo derruba a contagem", () => {
    const diagrama = diagramaBase();
    const atividades = resolverDependencias(derivar(diagrama, config, {})).atividades;
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const sem = gerarItensDeTrabalho(atividades, diagrama, config, { regras });
    const com = gerarItensDeTrabalho(atividades, diagrama, config, {
      regras,
      respostasItens: {
        [chaveMongo]: {
          "Backend::Logs relevantes emitidos": { valor: "sim, via Winston", origem: "manual" },
        },
      },
    });

    const antes = sem.find((i) => i.chave === chaveMongo)!;
    const depois = com.find((i) => i.chave === chaveMongo)!;
    expect(antes.pendencias).toBeGreaterThan(0);
    expect(depois.pendencias).toBe(antes.pendencias - 1);
    expect(depois.sugestoes).toBe(0);
  });

  it("sugestoes conta as marcas de sugerido — resposta da esteira não confirmada", () => {
    const diagrama = diagramaBase();
    const atividades = resolverDependencias(derivar(diagrama, config, {})).atividades;
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const itens = gerarItensDeTrabalho(atividades, diagrama, config, {
      regras,
      respostasItens: {
        [chaveMongo]: {
          "Backend::Logs relevantes emitidos": { valor: "sim, via Winston", origem: "sugerido", confirmado: false },
        },
      },
    });

    expect(itens.find((i) => i.chave === chaveMongo)!.sugestoes).toBe(1);
  });

  it("dependências saem legíveis, com a chave alvo quando existe", () => {
    const diagrama = diagramaBase();
    const atividades = resolverDependencias(derivar(diagrama, config, {})).atividades;

    const itens = gerarItensDeTrabalho(atividades, diagrama, config, {});
    const comDep = itens.filter((i) => i.dependencias.length > 0);
    expect(comDep.length).toBeGreaterThan(0);
    for (const dep of comDep.flatMap((i) => i.dependencias)) {
      expect(dep).toMatch(/^\w+( → .+)?$/);
    }
  });
});
