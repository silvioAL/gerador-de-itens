import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "@gerador/engine";
import { componentesAlcancados, escoposDoComponente } from "./regraPorComponente";

/**
 * SPEC-36 Opção A — o mapeamento componente→tech+contexto é o coração da
 * projeção: se ele errar, a regra criada "para Fila Rabbit" nunca casa com
 * item nenhum (o defeito silencioso que a SPEC existe pra impedir).
 */
const config: DiagramaConfig = {
  nodeTypes: {
    rabbit: {
      label: "Fila Rabbit",
      derives: "queue",
      techs: ["Backend"],
      contextos: ["Backend-mensagens rabbitmq"],
      spec: [],
    },
    kafka: {
      label: "Tópico Kafka",
      derives: "topic",
      techs: ["Backend"],
      contextos: ["Backend-mensagens kafka"],
      spec: [],
    },
    service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
    android: { label: "App Android", derives: "app", techs: ["Mobile"], contextos: ["Mobile-android"], spec: [] },
  },
  edgeTypes: {},
  edgeRules: {},
};

const TODOS = ["Backend-mensagens rabbitmq", "Backend-mensagens kafka", "Backend-cache redis", "Mobile-android"];

describe("escoposDoComponente (SPEC-36 Opção A)", () => {
  it("Fila Rabbit deriva Backend + contexto exato, o grupo mensagens (rabbit+kafka) e a tech inteira", () => {
    const projecao = escoposDoComponente("rabbit", config.nodeTypes, TODOS)!;
    expect(projecao.tech).toBe("Backend");
    expect(projecao.opcoes).toEqual([
      { rotulo: "só Fila Rabbit", contextos: ["Backend-mensagens rabbitmq"] },
      {
        rotulo: "todo o grupo mensagens",
        contextos: ["Backend-mensagens rabbitmq", "Backend-mensagens kafka"],
      },
      { rotulo: "todo Backend", contextos: [] },
    ]);
  });

  it("componente sem contexto próprio (Serviço) só oferece a tech inteira", () => {
    const projecao = escoposDoComponente("service", config.nodeTypes, TODOS)!;
    expect(projecao.opcoes).toEqual([{ rotulo: "todo Backend", contextos: [] }]);
  });

  it("componente cuja família não tem irmãos NÃO oferece o escopo de grupo (não alargaria nada)", () => {
    const projecao = escoposDoComponente("android", config.nodeTypes, TODOS)!;
    expect(projecao.opcoes.map((o) => o.rotulo)).toEqual(["só App Android", "todo Mobile"]);
  });

  it("tipo inexistente ou sem tech devolve null — melhor nenhum formulário que um formulário que grava lixo", () => {
    expect(escoposDoComponente("inventado", config.nodeTypes, TODOS)).toBeNull();
  });
});

describe("componentesAlcancados (a leitura inversa)", () => {
  it("contextos vazios alcançam todos os componentes da tech", () => {
    expect(componentesAlcancados("Backend", [], config.nodeTypes)).toEqual(["Fila Rabbit", "Tópico Kafka", "Serviço"]);
  });

  it("contexto exato alcança só quem o declara", () => {
    expect(componentesAlcancados("Backend", ["Backend-mensagens rabbitmq"], config.nodeTypes)).toEqual(["Fila Rabbit"]);
  });
});
