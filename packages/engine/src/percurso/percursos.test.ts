import { describe, expect, it } from "vitest";
import type { Aresta, Diagrama, No, Percurso } from "../model/types.js";
import { conciliarPercursos, inferirPercursos, MAX_PERCURSOS, percursosQueContam } from "./percursos.js";

function no(id: string, label = id): No {
  return { id, type: "service", x: 0, y: 0, label, status: "novo", spec: {}, specNA: {} };
}
function aresta(source: string, target: string): Aresta {
  return { id: `${source}-${target}`, source, target, type: "chamada" };
}
function diagrama(nodes: No[], edges: Aresta[] = []): Diagrama {
  return { nodes, edges };
}

describe("inferirPercursos — o caminho lido do grafo (SPEC-57 fatia E)", () => {
  it("um caminho reto vira um percurso, com o rótulo que a pessoa reconhece", () => {
    const d = diagrama(
      [no("n1", "web"), no("n2", "api"), no("n3", "mongo")],
      [aresta("n1", "n2"), aresta("n2", "n3")]
    );

    const { percursos } = inferirPercursos(d);

    expect(percursos).toHaveLength(1);
    expect(percursos[0].nos).toEqual(["n1", "n2", "n3"]);
    expect(percursos[0].rotulo).toBe("web → api → mongo");
    // Regra 2: chega inferido, sem confirmação.
    expect(percursos[0].origem).toBe("inferido");
    expect(percursos[0].confirmado).toBeUndefined();
  });

  it("o id é estável — reinferir o mesmo desenho devolve o mesmo id", () => {
    // É isto que permite casar o inferido de agora com o que foi confirmado
    // antes; id instável faria a pessoa reconfirmar tudo a cada edição.
    const d = diagrama([no("n1"), no("n2")], [aresta("n1", "n2")]);

    expect(inferirPercursos(d).percursos[0].id).toBe(inferirPercursos(d).percursos[0].id);
    expect(inferirPercursos(d).percursos[0].id).toContain("n1>n2");
  });

  it("bifurcação vira dois percursos, um por destino", () => {
    const d = diagrama(
      [no("n1"), no("n2"), no("n3"), no("n4")],
      [aresta("n1", "n2"), aresta("n2", "n3"), aresta("n2", "n4")]
    );

    const { percursos } = inferirPercursos(d);

    expect(percursos.map((p) => p.nos)).toEqual([
      ["n1", "n2", "n3"],
      ["n1", "n2", "n4"],
    ]);
  });

  it("nó solto não vira percurso — caminho precisa de pelo menos dois nós", () => {
    const d = diagrama([no("n1"), no("n2")], []);

    expect(inferirPercursos(d).percursos).toEqual([]);
  });

  it("ciclo não trava nem vira erro: o caminho para onde voltaria", () => {
    // Reclamar do ciclo é papel de `resolverDependencias`, que já o faz. Dois
    // alarmes para o mesmo problema é pior que um.
    const d = diagrama(
      [no("n0"), no("n1"), no("n2"), no("n3")],
      [aresta("n0", "n1"), aresta("n1", "n2"), aresta("n2", "n3"), aresta("n3", "n1")]
    );

    const { percursos } = inferirPercursos(d);

    expect(percursos).toHaveLength(1);
    expect(percursos[0].nos).toEqual(["n0", "n1", "n2", "n3"]);
  });

  it("grafo denso PARA no teto e AVISA, em vez de devolver uma lista impossível", () => {
    // 24 caminhos já é mais do que alguém lê; 4000 travam o navegador. O que
    // não pode é devolver 24 fingindo que são todos.
    const nos = ["e", ...Array.from({ length: 12 }, (_, i) => `m${i}`), "s"];
    const arestas = [
      ...Array.from({ length: 12 }, (_, i) => aresta("e", `m${i}`)),
      ...Array.from({ length: 12 }, (_, i) => aresta(`m${i}`, "s")),
    ];
    // 12 caminhos só; para estourar, cada meio também aponta para os outros.
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if (i !== j) arestas.push(aresta(`m${i}`, `m${j}`));

    const { percursos, truncado } = inferirPercursos(diagrama(nos.map((id) => no(id)), arestas));

    expect(percursos.length).toBeLessThanOrEqual(MAX_PERCURSOS);
    expect(truncado).toBe(true);
  });

  it("auto-laço é ignorado — não é caminho", () => {
    const d = diagrama([no("n1"), no("n2")], [aresta("n1", "n1"), aresta("n1", "n2")]);

    expect(inferirPercursos(d).percursos[0].nos).toEqual(["n1", "n2"]);
  });
});

describe("percursoConta / conciliarPercursos", () => {
  const inferido: Percurso = { id: "pc::a>b", rotulo: "a → b", nos: ["a", "b"], origem: "inferido" };

  it("inferido não conta até confirmar", () => {
    expect(percursosQueContam([inferido])).toEqual([]);
    expect(percursosQueContam([{ ...inferido, confirmado: true }])).toHaveLength(1);
  });

  it("reinferir NÃO desconfirma o que a pessoa já confirmou", () => {
    // Sem isto, cada edição no desenho desconfirmaria todos os caminhos e a
    // pessoa reconfirmaria a mesma coisa para sempre.
    const { percursos } = conciliarPercursos([inferido], [{ ...inferido, confirmado: true }]);

    expect(percursos[0].confirmado).toBe(true);
  });

  it("nó renomeado atualiza o rótulo sem perder a confirmação", () => {
    const { percursos } = conciliarPercursos(
      [{ ...inferido, rotulo: "web → api" }],
      [{ ...inferido, confirmado: true }]
    );

    expect(percursos[0].rotulo).toBe("web → api");
    expect(percursos[0].confirmado).toBe(true);
  });

  it("caminho confirmado que o desenho não produz mais vira OBSOLETO, não sumiço", () => {
    // Mesma disciplina do vínculo quebrado (§230) e da decisão órfã (§246): o
    // caminho que desapareceu é o evento que precisa ser visto.
    const { percursos, obsoletos } = conciliarPercursos([], [{ ...inferido, confirmado: true }]);

    expect(percursos).toEqual([]);
    expect(obsoletos.map((p) => p.id)).toEqual(["pc::a>b"]);
  });

  it("inferido NÃO confirmado que sumiu não vira obsoleto — nunca foi de ninguém", () => {
    const { obsoletos } = conciliarPercursos([], [inferido]);

    expect(obsoletos).toEqual([]);
  });
});
