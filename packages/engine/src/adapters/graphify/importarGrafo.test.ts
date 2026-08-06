import { describe, expect, it } from "vitest";
import { importarGrafo, type GraphifyGraph, type GraphifyMappingConfig } from "./importarGrafo.js";

const mapeamento: GraphifyMappingConfig = {
  regras: [
    { padrao: "\\.bpmn$", tipo: "camunda" },
    { padrao: "rabbit|amqp", tipo: "rabbit" },
    { padrao: "kafka", tipo: "kafka" },
    { padrao: "migrations?/.*\\.sql$", tipo: "sql" },
    { padrao: "controllers?/", tipo: "service" },
  ],
};

function grafo(arquivos: Array<{ source_file: string; source_location?: string; label?: string }>): GraphifyGraph {
  return {
    nodes: arquivos.map((a, i) => ({
      id: `n${i}`,
      label: a.label ?? a.source_file,
      source_file: a.source_file,
      source_location: a.source_location ?? "L1",
    })),
  };
}

describe("importarGrafo", () => {
  it("mapeia arquivos por padrão de caminho, um nó por arquivo", () => {
    const resultado = importarGrafo(
      grafo([
        { source_file: "src/messaging/RabbitConsumer.java" },
        { source_file: "src/controllers/PagamentoController.java" },
        { source_file: "db/migrations/V1__init.sql" },
      ]),
      mapeamento
    );

    expect(resultado.nodes).toHaveLength(3);
    expect(resultado.nodes.map((n) => n.type).sort()).toEqual(["rabbit", "service", "sql"]);
    expect(resultado.naoMapeados).toEqual([]);
  });

  it("todo nó importado é existente/extraido, nunca manual", () => {
    const resultado = importarGrafo(grafo([{ source_file: "src/controllers/X.java" }]), mapeamento);
    expect(resultado.nodes[0]).toMatchObject({ status: "existente" });
  });

  it("arquivo sem regra que bate vai para naoMapeados, nunca vira nó com tipo chutado", () => {
    const resultado = importarGrafo(
      grafo([{ source_file: "src/utils/StringHelpers.java" }]),
      mapeamento
    );
    expect(resultado.nodes).toEqual([]);
    expect(resultado.naoMapeados).toEqual(["src/utils/StringHelpers.java"]);
  });

  it("primeira regra que bate vence, mesmo se outra também bateria", () => {
    const mapeamentoAmbiguo: GraphifyMappingConfig = {
      regras: [
        { padrao: "rabbit", tipo: "rabbit" },
        { padrao: "consumer", tipo: "kafka" },
      ],
    };
    const resultado = importarGrafo(
      grafo([{ source_file: "src/rabbit/PagamentoConsumer.java" }]),
      mapeamentoAmbiguo
    );
    expect(resultado.nodes[0].type).toBe("rabbit");
  });

  it("dois nós de graphify do mesmo arquivo colapsam num único nó do diagrama", () => {
    const resultado = importarGrafo(
      grafo([
        { source_file: "src/controllers/X.java", source_location: "L10" },
        { source_file: "src/controllers/X.java", source_location: "L1" },
      ]),
      mapeamento
    );
    expect(resultado.nodes).toHaveLength(1);
  });

  it("nó sem source_file é ignorado, não quebra", () => {
    const resultado = importarGrafo({ nodes: [{ id: "n1", label: "x" }] }, mapeamento);
    expect(resultado.nodes).toEqual([]);
    expect(resultado.naoMapeados).toEqual([]);
  });
});
