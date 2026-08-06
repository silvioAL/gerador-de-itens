import { describe, expect, it } from "vitest";
import { handlesPadrao } from "./Canvas";

describe("handlesPadrao — lado do handle quando a aresta não veio de um drag real", () => {
  it("destino à direita: ancora do lado direito da origem e esquerdo do destino", () => {
    expect(handlesPadrao({ x: 0, y: 0 }, { x: 300, y: 0 })).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });
  });

  it("destino à esquerda: ancora do lado esquerdo da origem e direito do destino", () => {
    expect(handlesPadrao({ x: 300, y: 0 }, { x: 0, y: 0 })).toEqual({
      sourceHandle: "source-left",
      targetHandle: "target-right",
    });
  });

  it("destino abaixo (mesma coluna): ancora embaixo na origem e em cima no destino", () => {
    expect(handlesPadrao({ x: 100, y: 0 }, { x: 100, y: 300 })).toEqual({
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    });
  });

  it("destino acima (mesma coluna): ancora em cima na origem e embaixo no destino", () => {
    expect(handlesPadrao({ x: 100, y: 300 }, { x: 100, y: 0 })).toEqual({
      sourceHandle: "source-top",
      targetHandle: "target-bottom",
    });
  });

  it("nunca escolhe o topo quando o deslocamento horizontal é maior, mesmo com alguma diferença vertical", () => {
    expect(handlesPadrao({ x: 0, y: 0 }, { x: 300, y: 20 })).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });
  });
});
