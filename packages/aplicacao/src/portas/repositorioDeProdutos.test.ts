import { describe, expect, it } from "vitest";
import { contextoDoProdutoEmTexto, produtosDoTime, type Produto } from "./repositorioDeProdutos.js";

/**
 * SPEC-53 — as duas regras puras do produto: quem enxerga qual produto, e como
 * o contexto vira texto para o prompt e o documento.
 */
function produto(parcial: Partial<Produto> = {}): Produto {
  return {
    id: "p1",
    organizacaoId: "org",
    nome: "Portabilidade",
    objetivo: "",
    quemUsa: "",
    regrasDeNegocio: "",
    sistemas: "",
    restricoes: "",
    glossario: [],
    timeIds: [],
    criadoPor: "dev@empresa.com",
    atualizadoEm: new Date("2026-08-13T10:00:00Z").toISOString(),
    ...parcial,
  };
}

describe("produtosDoTime (SPEC-53)", () => {
  it("produto SEM time nenhum aparece para todos — é o estado em que ele nasce", () => {
    const novo = produto({ id: "novo", timeIds: [] });
    expect(produtosDoTime([novo], "time-pagamentos")).toEqual([novo]);
  });

  it("amarrar times RESTRINGE: quem não está na lista não vê", () => {
    const doPagamentos = produto({ id: "a", timeIds: ["time-pagamentos"] });
    const doCheckout = produto({ id: "b", timeIds: ["time-checkout"] });

    expect(produtosDoTime([doPagamentos, doCheckout], "time-pagamentos")).toEqual([doPagamentos]);
    // Sem time no contexto (tela de administração), a lista é inteira.
    expect(produtosDoTime([doPagamentos, doCheckout])).toHaveLength(2);
  });

  it("um produto atravessa times — é por isso que não é campo do time", () => {
    const compartilhado = produto({ timeIds: ["time-pagamentos", "time-checkout"] });
    expect(produtosDoTime([compartilhado], "time-checkout")).toHaveLength(1);
    expect(produtosDoTime([compartilhado], "time-pagamentos")).toHaveLength(1);
  });
});

describe("contextoDoProdutoEmTexto (SPEC-53)", () => {
  it("monta só as seções preenchidas — seção vazia não vira título órfão", () => {
    const texto = contextoDoProdutoEmTexto(
      produto({ objetivo: "Levar a conta do cliente para outro banco.", restricoes: "Resolução 4.753 do BACEN." })
    );

    expect(texto).toContain("## Produto: Portabilidade");
    expect(texto).toContain("### O que é\nLevar a conta");
    expect(texto).toContain("### Restrições\nResolução 4.753");
    expect(texto).not.toContain("### Quem usa");
    expect(texto).not.toContain("### Glossário");
  });

  it("o glossário vira lista de termo → definição", () => {
    const texto = contextoDoProdutoEmTexto(
      produto({ glossario: [{ id: "t1", termo: "Fatura em aberto", definicao: "A que venceu e não foi paga", ordem: 0 }] })
    );
    expect(texto).toContain("- **Fatura em aberto**: A que venceu e não foi paga");
  });

  it("glossário grande é cortado, mas NUNCA em silêncio — o texto diz quantos ficaram de fora", () => {
    const muitos = Array.from({ length: 45 }, (_, i) => ({ id: `t${i}`, termo: `Termo ${i}`, definicao: "def", ordem: i }));
    const texto = contextoDoProdutoEmTexto(produto({ glossario: muitos }), 40);

    expect(texto).toContain("Termo 39");
    expect(texto).not.toContain("Termo 40");
    expect(texto).toContain("mais 5 termo(s) no glossário do produto");
  });

  it("produto só com nome devolve VAZIO — cabeçalho sozinho não ensina nada ao agente", () => {
    expect(contextoDoProdutoEmTexto(produto())).toBe("");
  });

  it("espaço em branco não conta como conteúdo", () => {
    expect(contextoDoProdutoEmTexto(produto({ objetivo: "   \n  " }))).toBe("");
  });
});
