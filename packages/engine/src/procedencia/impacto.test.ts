import { describe, expect, it } from "vitest";
import type { Atividade } from "../model/types.js";
import { itensImpactados } from "./impacto.js";

function atividade(chave: string, over: Partial<Atividade> = {}): Atividade {
  return {
    chave,
    rotulo: chave,
    tipo: "História",
    tamanho: "M",
    descricao: "",
    techs: [],
    contextos: [],
    dependencias: [],
    origem: {},
    ...over,
  } as unknown as Atividade;
}

describe("itensImpactados (SPEC-26 Bloco 2 — a onda sai do grafo, sem modelo)", () => {
  it("itens do MESMO nó entram: compartilham a spec que mudou", () => {
    const atividades = [
      atividade("n1::setup", { origem: { nodeId: "n1" } }),
      atividade("n1::ep0", { origem: { nodeId: "n1" } }),
      atividade("n2::setup", { origem: { nodeId: "n2" } }),
    ];
    expect(itensImpactados(atividades, "n1::setup")).toEqual([{ chave: "n1::ep0", motivo: "origem" }]);
  });

  it("quem depende do item alterado entra, transitivamente", () => {
    const atividades = [
      atividade("a"),
      atividade("b", { dependencias: [{ type: "dependent", alvoChave: "a" }] }),
      atividade("c", { dependencias: [{ type: "dependent", alvoChave: "b" }] }),
      atividade("z"),
    ];
    expect(itensImpactados(atividades, "a").map((i) => i.chave)).toEqual(["b", "c"]);
  });

  it("quem o item alterado DEPENDE não entra — propagar pra cima viraria revisar a quebra inteira", () => {
    const atividades = [
      atividade("produtor"),
      atividade("consumidor", { dependencias: [{ type: "dependent", alvoChave: "produtor" }] }),
    ];
    expect(itensImpactados(atividades, "consumidor")).toEqual([]);
  });

  it("dependência vence mesma-origem no motivo — é a relação que explica melhor", () => {
    const atividades = [
      atividade("n1::a", { origem: { nodeId: "n1" } }),
      atividade("n1::b", { origem: { nodeId: "n1" }, dependencias: [{ type: "dependent", alvoChave: "n1::a" }] }),
    ];
    expect(itensImpactados(atividades, "n1::a")).toEqual([{ chave: "n1::b", motivo: "dependencia" }]);
  });

  it("itens da mesma CONEXÃO também compartilham a spec (SPEC-21)", () => {
    const atividades = [
      atividade("e1::http", { origem: { edgeId: "e1" } }),
      atividade("e1::auth", { origem: { edgeId: "e1" } }),
      atividade("e2::http", { origem: { edgeId: "e2" } }),
    ];
    expect(itensImpactados(atividades, "e1::http")).toEqual([{ chave: "e1::auth", motivo: "origem" }]);
  });

  it("o próprio item alterado nunca entra na lista, e chave inexistente devolve vazio", () => {
    const atividades = [atividade("a", { origem: { nodeId: "n1" } })];
    expect(itensImpactados(atividades, "a")).toEqual([]);
    expect(itensImpactados(atividades, "nao-existe")).toEqual([]);
  });

  it("a ordem é a da tela — a pessoa revisa de cima pra baixo", () => {
    const atividades = [
      atividade("01", { origem: { nodeId: "n1" } }),
      atividade("02", { origem: { nodeId: "n1" } }),
      atividade("03", { origem: { nodeId: "n1" } }),
    ];
    expect(itensImpactados(atividades, "03").map((i) => i.chave)).toEqual(["01", "02"]);
  });
});
