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

/** Monta um grafo com nós de código-fonte reais mais nós-referência (símbolos
 * importados/estendidos/implementados, sem `source_file` próprio — mesmo
 * formato que o Graphify usa pra tipo externo/biblioteca) e as arestas entre
 * eles, no mesmo formato de `links` que o `graph.json` bruto tem. */
function grafoComReferencias(
  arquivos: Array<{ id: string; source_file: string; label?: string }>,
  referencias: Array<{ id: string; label: string }>,
  arestas: Array<{ de: string; para: string; relation: string }>
): GraphifyGraph {
  return {
    nodes: [
      ...arquivos.map((a) => ({
        id: a.id,
        label: a.label ?? a.source_file,
        source_file: a.source_file,
        source_location: "L1",
      })),
      ...referencias.map((r) => ({ id: r.id, label: r.label })),
    ],
    links: arestas.map((a) => ({ source: a.de, target: a.para, relation: a.relation })),
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

  it("achado real: projeto Camunda com nomenclatura própria não batia com nenhum padrão de caminho — padraoLabel resolve pelo nome da classe", () => {
    const mapeamentoComLabel: GraphifyMappingConfig = {
      regras: [{ padraoLabel: "Delegate$", tipo: "camunda" }],
    };
    const resultado = importarGrafo(
      grafo([{ source_file: "src/main/java/com/empresa/AprovacaoDelegate.java", label: "AprovacaoDelegate" }]),
      mapeamentoComLabel
    );
    expect(resultado.nodes).toHaveLength(1);
    expect(resultado.nodes[0].type).toBe("camunda");
  });

  it("padraoImporta pega o caso em que nem caminho nem nome de classe seguem convenção — só o que a classe implementa denuncia a tecnologia", () => {
    const mapeamentoComImporta: GraphifyMappingConfig = {
      regras: [{ padraoImporta: "JavaDelegate", tipo: "camunda" }],
    };
    const resultado = importarGrafo(
      grafoComReferencias(
        [{ id: "n1", source_file: "src/main/java/com/empresa/ProcessaAprovacao.java", label: "ProcessaAprovacao" }],
        [{ id: "ref1", label: "JavaDelegate" }],
        [{ de: "n1", para: "ref1", relation: "implements" }]
      ),
      mapeamentoComImporta
    );
    expect(resultado.nodes).toHaveLength(1);
    expect(resultado.nodes[0].type).toBe("camunda");
  });

  it("padraoImporta agrega referências de todos os nós do arquivo, não só do representante escolhido", () => {
    const mapeamentoComImporta: GraphifyMappingConfig = {
      regras: [{ padraoImporta: "JpaRepository", tipo: "sql" }],
    };
    const resultado = importarGrafo(
      grafoComReferencias(
        [
          { id: "classe", source_file: "src/ClienteRepository.java", label: "ClienteRepository" },
          { id: "metodo", source_file: "src/ClienteRepository.java", label: "buscarPorId" },
        ],
        [{ id: "ref1", label: "JpaRepository" }],
        // a aresta "extends" sai do nó da classe, não do método (representante
        // escolhido é o de menor source_location, que aqui é o mesmo arquivo)
        [{ de: "classe", para: "ref1", relation: "extends" }]
      ),
      mapeamentoComImporta
    );
    expect(resultado.nodes).toHaveLength(1);
    expect(resultado.nodes[0].type).toBe("sql");
  });

  it("padraoImporta ignora arestas 'calls' (chamada de método é ruído, não referência de tipo/tecnologia)", () => {
    const mapeamentoComImporta: GraphifyMappingConfig = {
      regras: [{ padraoImporta: "KafkaTemplate", tipo: "kafka" }],
    };
    const resultado = importarGrafo(
      grafoComReferencias(
        [{ id: "n1", source_file: "src/Foo.java", label: "Foo" }],
        [{ id: "ref1", label: "KafkaTemplate" }],
        [{ de: "n1", para: "ref1", relation: "calls" }]
      ),
      mapeamentoComImporta
    );
    expect(resultado.nodes).toEqual([]);
    expect(resultado.naoMapeados).toEqual(["src/Foo.java"]);
  });

  it("dentro da mesma regra, qualquer um dos três sinais definidos é suficiente (OR, não AND)", () => {
    const mapeamentoMisto: GraphifyMappingConfig = {
      regras: [{ padrao: "nunca-bate-em-nada", padraoLabel: "Producer$", tipo: "kafka" }],
    };
    const resultado = importarGrafo(
      grafo([{ source_file: "src/qualquer/pasta/PedidoProducer.java", label: "PedidoProducer" }]),
      mapeamentoMisto
    );
    expect(resultado.nodes[0].type).toBe("kafka");
  });

  it("grafo sem 'links' (grafo antigo/mais simples) continua funcionando — padraoImporta simplesmente nunca bate", () => {
    const mapeamentoComImporta: GraphifyMappingConfig = {
      regras: [{ padraoImporta: "JavaDelegate", tipo: "camunda" }],
    };
    const resultado = importarGrafo(grafo([{ source_file: "src/X.java" }]), mapeamentoComImporta);
    expect(resultado.nodes).toEqual([]);
    expect(resultado.naoMapeados).toEqual(["src/X.java"]);
  });
});
