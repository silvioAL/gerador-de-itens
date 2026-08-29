import { describe, expect, it } from "vitest";
import { corpoQuebra } from "./quebras.js";

/**
 * §322 — **a proveniência do ADR importado atravessa a borda.**
 *
 * ## O defeito que este teste guarda
 *
 * `Decisao.importadoDe` nasceu na SPEC-81 fatia C e **não chegou ao Zod**. O
 * campo morria aqui: um ADR trazido do repositório da casa voltava do banco
 * indistinguível de uma decisão tomada aqui dentro.
 *
 * E `origem: "extraido"` sobreviveria sozinho, o que é pior que perder tudo —
 * diria *"veio de algum lugar"* sem dizer de onde, que é exatamente a metade de
 * informação que faz alguém confiar no dado errado.
 *
 * ## Por que o guarda do §310 não pegou
 *
 * `quebras.borda.test.ts` cruza `keyof Quebra` com `corpoQuebra.shape` — e
 * `importadoDe` mora **dentro** de `Decisao`, não no topo de `Quebra`. O guarda
 * cobre a primeira camada; a segunda continua sendo por atenção.
 *
 * Este teste é a atenção virada em trava para o caso que doeu.
 */
describe("a borda de /quebras carrega a proveniência do ADR (§322)", () => {
  it("`importadoDe` atravessa — sem ele, ADR importado vira decisão local", () => {
    const corpo = {
      diagrama: { nodes: [], edges: [] },
      decisoes: [
        {
          id: "adr:ADR-14",
          titulo: "Fila em vez de chamada síncrona",
          alternativas: [],
          escolhida: "Fila",
          porque: "desacopla o tempo do parceiro",
          status: "aceita",
          origem: "extraido",
          autor: "ana",
          em: "2026-08-29T10:00:00.000Z",
          importadoDe: "https://adr.casa/14",
        },
      ],
    };

    const lido = corpoQuebra.safeParse(corpo);

    expect(lido.success).toBe(true);
    expect(lido.success && lido.data.decisoes?.[0].importadoDe).toBe("https://adr.casa/14");
  });

  it("e continua opcional — decisão tomada aqui não tem de onde vir", () => {
    const lido = corpoQuebra.safeParse({
      diagrama: { nodes: [], edges: [] },
      decisoes: [
        {
          id: "d1",
          titulo: "Mongo em vez de SQL",
          alternativas: [],
          escolhida: "Mongo",
          porque: "a forma varia por categoria",
          status: "aceita",
          origem: "manual",
          autor: "ana",
          em: "2026-08-29T10:00:00.000Z",
        },
      ],
    });

    expect(lido.success).toBe(true);
    expect(lido.success && lido.data.decisoes?.[0].importadoDe).toBeUndefined();
  });
});
