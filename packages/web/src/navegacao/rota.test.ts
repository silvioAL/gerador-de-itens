import { describe, expect, it } from "vitest";
import { hashDaRota, rotaDoHash } from "./rota";

describe("rota em hash (SPEC-40 F1)", () => {
  it("ida e volta: toda área resolve pro seu hash e de volta", () => {
    const areas = [
      "perfis",
      "campos",
      "camposAresta",
      "membros",
      "acessos",
      "regras",
      "especificacao",
      "pipeline",
      "modeloIa",
      "pdca",
    ] as const;
    for (const area of areas) {
      const hash = hashDaRota({ tela: "config", area });
      expect(rotaDoHash(hash)).toEqual({ tela: "config", area });
    }
    expect(rotaDoHash(hashDaRota({ tela: "canvas" }))).toEqual({ tela: "canvas" });
  });

  it("o hash fala produto, não id interno", () => {
    expect(hashDaRota({ tela: "config", area: "modeloIa" })).toBe("#/config/modelo-ia");
    expect(hashDaRota({ tela: "config", area: "campos" })).toBe("#/config/componentes");
  });

  it("SPEC-41: #/itens vai e volta pela tela de itens", () => {
    expect(hashDaRota({ tela: "itens" })).toBe("#/itens");
    expect(rotaDoHash("#/itens")).toEqual({ tela: "itens" });
  });

  it("hash desconhecido/velho cai no canvas — nunca tela em branco", () => {
    expect(rotaDoHash("#/config/aba-que-nao-existe")).toEqual({ tela: "canvas" });
    expect(rotaDoHash("#/qualquer/coisa")).toEqual({ tela: "canvas" });
    expect(rotaDoHash("")).toEqual({ tela: "canvas" });
  });
});
