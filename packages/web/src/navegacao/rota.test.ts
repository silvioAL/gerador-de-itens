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

  it("§346: a rota morta #/spec REDIRECIONA pro documento", () => {
    /**
     * A tela da spec saiu (§346): o usuário chegou nela pelo menu e não
     * reconheceu o que era, ela não estava no tour, e a única saída que oferecia
     * era baixar um markdown à mão.
     *
     * Vai para o documento porque é lá que os itens vivem, e é o item que a spec
     * acompanha quando o caminho existir (SPEC-98 §3.2). Cair no `canvas` — o
     * destino padrão do desconhecido — seria pior: perderia a demanda aberta e
     * pareceria que o link estava errado.
     */
    expect(rotaDoHash("#/spec")).toEqual({ tela: "documento" });
  });

  it("SPEC-61: a rota morta #/itens REDIRECIONA pro documento, não dá tela branca", () => {
    // A tela de itens virou uma seção do documento. Quem some com uma rota tem
    // que redirecionar: link salvo é justamente o de quem mais usa.
    expect(rotaDoHash("#/itens")).toEqual({ tela: "documento" });
    // E ninguém mais PRODUZ esse hash — a saída é uma só.
    expect(hashDaRota({ tela: "documento" })).toBe("#/documento");
    expect(rotaDoHash("#/documento")).toEqual({ tela: "documento" });
  });

  it("SPEC-107 G4: a rota morta #/ensaios REDIRECIONA para a bancada junto do fluxo", () => {
    /**
     * A tela de ensaios morreu — a bancada mede pela fiação semeada e vive em
     * `#/fluxo/ensaio`. A aposta da SPEC-66 §5 fica de pé: "olha o que
     * acontece se o bureau cair" continua sendo uma URL mandável, e o link
     * salvo nunca vira tela branca (§2.4-3).
     */
    expect(rotaDoHash("#/ensaios")).toEqual({ tela: "fluxo", bancada: "ensaio" });
    // E a cadeia LEGADA encurta no destino atual: #/simulacao → a bancada.
    expect(rotaDoHash("#/simulacao")).toEqual({ tela: "fluxo", bancada: "ensaio" });
    // Ida e volta da rota nova; o fluxo sem bancada segue como era.
    expect(hashDaRota({ tela: "fluxo", bancada: "ensaio" })).toBe("#/fluxo/ensaio");
    expect(rotaDoHash("#/fluxo/ensaio")).toEqual({ tela: "fluxo", bancada: "ensaio" });
    expect(rotaDoHash("#/fluxo")).toEqual({ tela: "fluxo" });
  });

  it("SPEC-107 G5c: #/fluxo/<id> abre o canvas NAQUELE fluxo — assistir é uma URL mandável", () => {
    expect(hashDaRota({ tela: "fluxo", fluxoId: "esteira-de-agentes" })).toBe("#/fluxo/esteira-de-agentes");
    expect(rotaDoHash("#/fluxo/esteira-de-agentes")).toEqual({ tela: "fluxo", fluxoId: "esteira-de-agentes" });
  });

  it("hash desconhecido/velho cai no canvas — nunca tela em branco", () => {
    expect(rotaDoHash("#/config/aba-que-nao-existe")).toEqual({ tela: "canvas" });
    expect(rotaDoHash("#/qualquer/coisa")).toEqual({ tela: "canvas" });
    expect(rotaDoHash("")).toEqual({ tela: "canvas" });
  });
});
