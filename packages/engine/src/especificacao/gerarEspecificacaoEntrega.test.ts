import { describe, expect, it } from "vitest";
import type { Diagrama } from "../model/types.js";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import { derivar } from "../derive/derivar.js";
import {
  gerarEspecificacaoEntrega,
  extrairVariaveis,
  validarTemplate,
  TEMPLATE_ESPECIFICACAO_PADRAO,
} from "./gerarEspecificacaoEntrega.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: [],
      spec: [
        { key: "nome", label: "Nome do serviço", type: "text", required: true },
        { key: "linguagem", label: "Linguagem", type: "text", required: false, permiteNA: true },
      ],
    },
    mongo: {
      label: "Coleção Mongo",
      derives: "datastore",
      techs: ["Backend"],
      contextos: ["Backend-dados"],
      spec: [
        { key: "collection", label: "Nome da coleção", type: "text", required: true },
        { key: "ttlDias", label: "TTL (dias)", type: "number", required: false, permiteNA: true },
      ],
      specResumo: ["collection"],
      cenarioGherkinPadrao: "```gherkin\nDado um documento válido\nQuando ele é gravado\nEntão pode ser lido de volta\n```",
      cenarioGherkinPorAresta: {
        writes: "```gherkin\nDado um documento válido pronto pra escrita\nQuando a operação de escrita ocorre\nEntão o documento é persistido corretamente\n```",
      },
    },
  },
  edgeTypes: {
    writes: { label: "escreve", verbo: "escreve em", tamanhoPadrao: "P" },
  },
  edgeRules: {
    mongo: { valid: ["writes"], default: "writes" },
  },
};

const regras: RegrasConfig = {
  porTech: {
    Backend: {
      requisitos: [{ texto: "Logs relevantes emitidos", tipo: "checklist", contextos: ["Backend-dados"] }],
      testes: [{ tipo: "Teste de migração", validacao: "roda limpo", dev: true, hlg: false, contextos: ["Backend-dados"] }],
    },
  },
};

function diagramaBase(): Diagrama {
  return {
    nodes: [
      {
        id: "n1",
        type: "service",
        status: "novo",
        label: "srv-catalogo",
        x: 0,
        y: 0,
        spec: { nome: { valor: "srv-catalogo", origem: "manual" } },
        specNA: { linguagem: { motivo: "ainda não decidido" } },
      },
      {
        id: "n2",
        type: "mongo",
        status: "novo",
        label: "produtos",
        x: 0,
        y: 0,
        spec: { collection: { valor: "produtos", origem: "manual" } },
        specNA: { ttlDias: { motivo: "catálogo não expira" } },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2", type: "writes" }],
  };
}

describe("gerarEspecificacaoEntrega", () => {
  it("com o template padrão: um documento só, com todas as atividades como itens numerados", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config);

    // Contexto e Visão geral aparecem uma vez só, não por atividade.
    expect(doc.match(/## Contexto/g)).toHaveLength(1);
    expect(doc.match(/## Visão geral/g)).toHaveLength(1);
    expect(doc).toContain("# Especificação de entrega");
    expect(doc).toContain("## Itens");
    expect(doc).toContain("### 1.");
    expect(doc).toContain("### 2.");
    expect(doc).toContain("produtos (Coleção Mongo, novo)");
    expect(doc).toContain("| Nome da coleção | produtos | manual |");
    expect(doc).toContain("| TTL (dias) | N/A — catálogo não expira | — |");
    expect(doc).toContain("## Definition of Ready");
    expect(doc).toContain("## Definition of Done");
    expect(doc).toContain("- [ ] Código revisado");
  });

  it("demandInfo e times envolvidos entram na seção de contexto, uma vez", () => {
    const diagrama = diagramaBase();
    diagrama.nodes[0].time = "time-catalogo";
    const atividades = derivar(diagrama, config, { time: "time-checkout" });

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      demandInfo: "Cliente pediu catálogo mais rápido.",
    });

    expect(doc.match(/Cliente pediu catálogo mais rápido\./g)).toHaveLength(1);
  });

  it("título customizado substitui o default", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { titulo: "Fluxo de aprovação de crédito" });
    expect(doc).toContain("# Fluxo de aprovação de crédito");
  });

  it("com regras: refinamento técnico de cada item inclui checklist/testes filtrados por techs+contextos", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { regras });

    expect(doc).toContain("Logs relevantes emitidos");
    expect(doc).toContain("Teste de migração");
  });

  it("sem atividades: itens mostra mensagem clara, não quebra", () => {
    const diagrama: Diagrama = { nodes: [], edges: [] };
    const doc = gerarEspecificacaoEntrega([], diagrama, config);
    expect(doc).toContain("_Nenhum item nesta quebra._");
  });

  it("atividade de aresta: especificação do item mostra origem e destino, nessa ordem", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config);

    const idxOrigem = doc.indexOf("srv-catalogo (Serviço, novo)");
    const idxDestino = doc.indexOf("produtos (Coleção Mongo, novo)");
    expect(idxOrigem).toBeGreaterThan(-1);
    expect(idxDestino).toBeGreaterThan(idxOrigem);
  });

  it("critérios de aceite: usa cenarioGherkinPorAresta do nó alvo quando configurado pro tipo de aresta", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config);

    expect(doc).toContain("Dado um documento válido pronto pra escrita");
  });

  it("critérios de aceite: cai em cenarioGherkinPadrao do nó quando não há override pro tipo de aresta (atividade de criação, sem aresta)", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const criacao = atividades.find((a) => a.chave === "n2::criacao")!;

    const doc = gerarEspecificacaoEntrega([criacao], diagrama, config);

    expect(doc).toContain("Dado um documento válido\nQuando ele é gravado");
  });

  it("critérios de aceite: cai no placeholder genérico quando o tipo de nó não tem cenário configurado", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const setup = atividades.find((a) => a.chave === "n1::setup")!; // service não tem cenarioGherkinPadrao configurado

    const doc = gerarEspecificacaoEntrega([setup], diagrama, config);

    expect(doc).toContain("Dado <contexto>");
  });

  it("template customizado: só usa as seções que o autor incluiu", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      template: "TÍTULO: {{titulo}}\nDOD: {{definitionOfDone}}",
    });

    expect(doc.startsWith("TÍTULO: Especificação de entrega\nDOD: - [ ] Código revisado")).toBe(true);
    expect(doc).not.toContain("{{");
    expect(doc).not.toContain("## Itens");
  });
});

describe("extrairVariaveis / validarTemplate", () => {
  it("template padrão só usa variáveis válidas", () => {
    expect(validarTemplate(TEMPLATE_ESPECIFICACAO_PADRAO)).toEqual([]);
  });

  it("aceita as 6 variáveis conhecidas", () => {
    expect(
      validarTemplate("{{titulo}} {{contexto}} {{historiaPo}} {{itens}} {{definitionOfReady}} {{definitionOfDone}}")
    ).toEqual([]);
  });

  it("rejeita variável desconhecida (typo)", () => {
    expect(validarTemplate("{{titulo}} {{especificacaoTecnica}}")).toEqual(["especificacaoTecnica"]);
  });

  it("extrai nomes sem duplicatas", () => {
    expect(extrairVariaveis("{{titulo}} — {{titulo}} de novo — {{itens}}")).toEqual(["titulo", "itens"]);
  });
});
