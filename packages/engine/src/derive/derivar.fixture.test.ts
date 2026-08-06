import { describe, expect, it } from "vitest";
import type { Diagrama } from "../model/types.js";
import type { DiagramaConfig } from "../config/types.js";
import { derivar } from "./derivar.js";
import { readFixture } from "../test-support/fixtures.js";

interface Fixture01 {
  quebra: { demandInfo: string; diagrama: Diagrama };
  esperado: {
    atividades: Array<{
      chave: string;
      tipo?: string;
      tamanho?: string;
      techs?: string[];
      contextos?: string[];
      descricaoContem?: string[];
      dependencias?: Array<{ type: string; alvoChave?: string }>;
      origem?: { nodeId?: string; edgeId?: string };
      timesEnvolvidos?: string[];
      specResumo?: Record<string, unknown>;
    }>;
    totalAtividades: number;
    rotulosSequenciais: Record<string, string>;
  };
}

// Config mínima equivalente a config/domains/{service,rabbit}.diagrama.json
// combinados — reflete exatamente os techs/contextos que a fixture 01 assume.
const config: DiagramaConfig = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
    rabbit: {
      label: "Fila Rabbit",
      derives: "queue",
      techs: ["Backend"],
      contextos: ["Backend-mensagens rabbitmq"],
      spec: [],
      specResumo: ["dlq", "retries", "ack"],
      specResumoPorAresta: { consumes: ["ack", "retryStrategy", "retries"] },
    },
  },
  edgeTypes: {
    publishes: { label: "publica", verbo: "publica em", tamanhoPadrao: "P" },
    consumes: { label: "consome", verbo: "consome de", tamanhoPadrao: "M" },
  },
  edgeRules: {
    rabbit: { valid: ["publishes", "consumes"], default: "publishes" },
    service: { valid: ["publishes", "consumes"], default: "publishes" },
  },
};

const fixture = readFixture<Fixture01>("01-servico-novo-fila-consumo.json");

describe("fixtures/01-servico-novo-fila-consumo.json — derivação end-to-end", () => {
  const atividades = derivar(fixture.quebra.diagrama, config, {});

  it(`produz ${fixture.esperado.totalAtividades} atividades`, () => {
    expect(atividades).toHaveLength(fixture.esperado.totalAtividades);
  });

  it("atribui os rótulos sequenciais esperados", () => {
    const rotulos = Object.fromEntries(atividades.map((a) => [a.chave, a.rotulo]));
    expect(rotulos).toEqual(fixture.esperado.rotulosSequenciais);
  });

  for (const esperada of fixture.esperado.atividades) {
    it(`atividade "${esperada.chave}" tem a estrutura esperada`, () => {
      const real = atividades.find((a) => a.chave === esperada.chave);
      expect(real, `atividade ${esperada.chave} não foi derivada`).toBeDefined();

      if (esperada.tipo) expect(real!.tipo).toBe(esperada.tipo);
      if (esperada.tamanho) expect(real!.tamanho).toBe(esperada.tamanho);
      if (esperada.techs) expect(real!.techs).toEqual(esperada.techs);
      if (esperada.contextos) expect(real!.contextos).toEqual(esperada.contextos);
      if (esperada.dependencias) expect(real!.dependencias).toEqual(esperada.dependencias);
      if (esperada.origem) expect(real!.origem).toEqual(esperada.origem);
      if (esperada.timesEnvolvidos) expect(real!.timesEnvolvidos).toEqual(esperada.timesEnvolvidos);
      if (esperada.specResumo) expect(real!.specResumo).toEqual(esperada.specResumo);
      if (esperada.descricaoContem) {
        for (const fragmento of esperada.descricaoContem) {
          expect(real!.descricao).toContain(fragmento);
        }
      }
    });
  }
});

describe("derivação de aresta genérica (não-mensageria)", () => {
  const configGenerica: DiagramaConfig = {
    nodeTypes: {
      service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
      camunda: { label: "Processo Camunda", derives: "camunda", techs: ["Backend"], contextos: ["Backend-orquestracao"], spec: [] },
      rule: { label: "Regra", derives: "rule", techs: ["Backend"], contextos: ["Backend-regras"], spec: [] },
      "rabbit-exchange": { label: "Exchange", derives: "queue", techs: ["Backend"], contextos: [], spec: [] },
      rabbit: { label: "Fila", derives: "queue", techs: ["Backend"], contextos: [], spec: [] },
    },
    edgeTypes: {
      orchestrates: { label: "orquestra", verbo: "orquestra", tamanhoPadrao: "M" },
      validates: { label: "valida", verbo: "usa a validação de", tamanhoPadrao: "P" },
      binding: { label: "binding", gerarAtividade: false },
    },
    edgeRules: {
      camunda: { valid: ["orchestrates"], default: "orchestrates" },
      rule: { valid: ["validates"], default: "validates" },
      rabbit: { valid: ["binding"], default: "binding" },
    },
  };

  it("aresta 'orchestrates' gera atividade com verbo e tamanho da config, não hardcoded", () => {
    const diagrama: Diagrama = {
      nodes: [
        { id: "n1", type: "service", status: "novo", label: "srv-x", x: 0, y: 0, spec: {}, specNA: {} },
        { id: "n2", type: "camunda", status: "novo", label: "processo-y", x: 0, y: 0, spec: {}, specNA: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", type: "orchestrates" }],
    };
    const atividades = derivar(diagrama, configGenerica, {});
    const orquestra = atividades.find((a) => a.chave === "e1::orchestrates");
    expect(orquestra).toBeDefined();
    expect(orquestra!.tamanho).toBe("M");
    expect(orquestra!.descricao).toBe("srv-x orquestra processo-y.");
    expect(orquestra!.contextos).toEqual(["Backend-orquestracao"]);
  });

  it("aresta 'validates' também gera atividade (não é mensageria)", () => {
    const diagrama: Diagrama = {
      nodes: [
        { id: "n1", type: "service", status: "novo", label: "srv-x", x: 0, y: 0, spec: {}, specNA: {} },
        { id: "n8", type: "rule", status: "novo", label: "regra-y", x: 0, y: 0, spec: {}, specNA: {} },
      ],
      edges: [{ id: "e6", source: "n1", target: "n8", type: "validates" }],
    };
    const atividades = derivar(diagrama, configGenerica, {});
    expect(atividades.find((a) => a.chave === "e6::validates")).toBeDefined();
  });

  it("aresta com gerarAtividade:false (binding) não gera atividade própria", () => {
    const diagrama: Diagrama = {
      nodes: [
        { id: "n2", type: "rabbit-exchange", status: "novo", label: "exchange-x", x: 0, y: 0, spec: {}, specNA: {} },
        { id: "n3", type: "rabbit", status: "novo", label: "fila-y", x: 0, y: 0, spec: {}, specNA: {} },
      ],
      edges: [{ id: "e2", source: "n2", target: "n3", type: "binding" }],
    };
    const atividades = derivar(diagrama, configGenerica, {});
    expect(atividades.find((a) => a.origem.edgeId === "e2")).toBeUndefined();
    // as duas atividades de criação continuam existindo — só a da aresta some.
    expect(atividades).toHaveLength(2);
  });
});
