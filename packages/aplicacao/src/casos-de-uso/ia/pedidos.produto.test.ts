import { describe, expect, it } from "vitest";
import { montarPedidoAlterarItem, montarPedidoPipeline } from "./pedidos.js";

/**
 * SPEC-53 Fase 2 — o contexto do PRODUTO chega em quem escreve o item.
 *
 * O que se prova aqui é a separação: produto e demanda entram no prompt como
 * blocos DIFERENTES, com rótulos que dizem qual vale sempre e qual vale só
 * desta vez. Concatenar os dois ensinaria o modelo a tratar o glossário do
 * produto como circunstância da demanda — o oposto do que ele é.
 */
const CONTEXTO_DO_PRODUTO = `## Produto: Portabilidade

### Glossário
- **Fatura em aberto**: a que venceu e não foi paga`;

const itens = [
  {
    chave: "n1::ep0",
    rotulo: "Serviço de propostas",
    contextoNo: "Serviço (Java/Spring Boot)",
    placeholders: [{ chave: "c1", tech: "Java", rotulo: "Contrato da API" }],
  },
];

describe("montarPedidoPipeline com contexto de produto (SPEC-53)", () => {
  it("o produto entra com rótulo PRÓPRIO, dizendo que vale para todas as demandas", () => {
    const { prompt } = montarPedidoPipeline({
      preambulo: "Você é o arquiteto.",
      contextoDoProduto: CONTEXTO_DO_PRODUTO,
      itens,
    });

    expect(prompt).toContain("Contexto do PRODUTO (vale para todas as demandas dele, não só esta)");
    expect(prompt).toContain("Fatura em aberto");
  });

  it("produto ANTES da demanda: o geral orienta a leitura do específico", () => {
    const { prompt } = montarPedidoPipeline({
      preambulo: "Você é o arquiteto.",
      contextoDoProduto: CONTEXTO_DO_PRODUTO,
      contextoEpico: "Migrar o faturamento para eventos.",
      itens,
    });

    expect(prompt.indexOf("Contexto do PRODUTO")).toBeLessThan(prompt.indexOf("Contexto desta demanda"));
    // E continuam sendo DOIS blocos — a demanda não é absorvida pelo produto.
    expect(prompt).toContain("Migrar o faturamento para eventos.");
  });

  it("sem produto, o prompt fica exatamente como era — nada de bloco vazio", () => {
    const semProduto = montarPedidoPipeline({ preambulo: "P", contextoEpico: "demanda X", itens }).prompt;
    expect(semProduto).not.toContain("Contexto do PRODUTO");
    expect(semProduto).toContain("Contexto desta demanda");
  });

  it("produto só com espaços não vira bloco — o mesmo cuidado do resto do prompt", () => {
    const { prompt } = montarPedidoPipeline({ preambulo: "P", contextoDoProduto: "   \n ", itens });
    expect(prompt).not.toContain("Contexto do PRODUTO");
  });
});

describe("montarPedidoAlterarItem com contexto de produto (SPEC-53)", () => {
  it("quem REVISA também recebe o vocabulário do produto", () => {
    const { prompt } = montarPedidoAlterarItem({
      instrucao: "deixe o critério mais objetivo",
      itemRotulo: "Serviço de propostas",
      contextoDoProduto: CONTEXTO_DO_PRODUTO,
      contextoEpico: "Migrar o faturamento.",
      campos: [{ chave: "c1", rotulo: "Critério", valorAtual: "ok" }],
    });

    expect(prompt).toContain("Contexto do PRODUTO:");
    expect(prompt).toContain("Fatura em aberto");
    expect(prompt.indexOf("Contexto do PRODUTO")).toBeLessThan(prompt.indexOf("Contexto desta demanda"));
  });
});
