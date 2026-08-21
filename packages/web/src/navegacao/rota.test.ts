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

  it("SPEC-61: a rota morta #/itens REDIRECIONA pro documento, não dá tela branca", () => {
    // A tela de itens virou uma seção do documento. Quem some com uma rota tem
    // que redirecionar: link salvo é justamente o de quem mais usa.
    expect(rotaDoHash("#/itens")).toEqual({ tela: "documento" });
    // E ninguém mais PRODUZ esse hash — a saída é uma só.
    expect(hashDaRota({ tela: "documento" })).toBe("#/documento");
    expect(rotaDoHash("#/documento")).toEqual({ tela: "documento" });
  });

  it("hash desconhecido/velho cai no canvas — nunca tela em branco", () => {
    expect(rotaDoHash("#/config/aba-que-nao-existe")).toEqual({ tela: "canvas" });
    expect(rotaDoHash("#/qualquer/coisa")).toEqual({ tela: "canvas" });
    expect(rotaDoHash("")).toEqual({ tela: "canvas" });
  });
});
