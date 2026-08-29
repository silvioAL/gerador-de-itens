import { describe, expect, it } from "vitest";
import type { Produto } from "./repositorioDeProdutos.js";
import {
  decisoesNaProposta,
  propostaDeArquitetura,
  type ArquiteturaDeNegocioExterna,
} from "./leitorDeArquiteturaDeNegocio.js";

type Alvo = Pick<Produto, "objetivo" | "quemUsa" | "regrasDeNegocio" | "sistemas" | "restricoes" | "glossario">;

function produto(p: Partial<Alvo> = {}): Alvo {
  return {
    objetivo: "",
    quemUsa: "",
    regrasDeNegocio: "",
    sistemas: "",
    restricoes: "",
    glossario: [],
    ...p,
  };
}

describe("a arquitetura de negócio da casa vira PROPOSTA, não sobrescrita (SPEC-81 fatia F)", () => {
  it("campo vazio aqui e preenchido lá é `novo` — aceitar é ganho puro", () => {
    const { campos } = propostaDeArquitetura({ objetivo: "Vender no atacado" }, produto());

    expect(campos).toEqual([{ campo: "objetivo", atual: "", proposto: "Vender no atacado", situacao: "novo" }]);
  });

  it("os dois preenchidos e diferentes é `diverge` — e os DOIS lados voltam", () => {
    /**
     * A única situação que exige leitura. Sobrescrever aqui apagaria texto que
     * alguém desta casa escreveu, em favor de um sistema que ninguém conferiu —
     * e a régua do §306 é a oposta: **declarado vence herdado, e a tela diz qual
     * é qual.**
     */
    const { campos } = propostaDeArquitetura(
      { restricoes: "LGPD e PCI-DSS" },
      produto({ restricoes: "LGPD, revisada em 2025" })
    );

    expect(campos[0]).toEqual({
      campo: "restricoes",
      atual: "LGPD, revisada em 2025",
      proposto: "LGPD e PCI-DSS",
      situacao: "diverge",
    });
  });

  it("texto igual é `igual`, e não vira decisão", () => {
    // Pedir para a pessoa decidir sobre algo que não muda é a definição de
    // ruído — e ruído se aprende a ignorar, junto com o que importava.
    const proposta = propostaDeArquitetura({ objetivo: "Vender" }, produto({ objetivo: "Vender" }));

    expect(proposta.campos[0].situacao).toBe("igual");
    expect(decisoesNaProposta(proposta)).toBe(0);
  });

  it("campo que a casa não tem simplesmente não entra", () => {
    // Tolerante na entrada, como o leitor de ADR: arquitetura de negócio de
    // verdade vem em formatos diferentes, e recusar o arquivo inteiro por causa
    // de um campo ausente faria a importação virar briga.
    const { campos } = propostaDeArquitetura({ objetivo: "  ", sistemas: "ERP e bureau" }, produto());

    expect(campos.map((c) => c.campo)).toEqual(["sistemas"]);
  });

  it("o `nome` do produto NÃO é alcançado", () => {
    /**
     * Escolha deliberada: o nome é como a casa chama o produto aqui dentro, e
     * um sistema de terceiro renomeá-lo quebraria toda referência humana ao
     * trabalho — sem ninguém ter pedido.
     */
    const { campos } = propostaDeArquitetura({ objetivo: "x" } as ArquiteturaDeNegocioExterna, produto());

    expect(campos.some((c) => (c.campo as string) === "nome")).toBe(false);
  });

  it("traz só os termos de glossário que este produto NÃO tem", () => {
    /**
     * Redefinir um termo do glossário é decisão maior que importar — o glossário
     * é o que impede a IA de usar a palavra da casa com o sentido errado, e
     * trocá-lo em lote mudaria o sentido de tudo que já foi escrito.
     */
    const { termosNovos } = propostaDeArquitetura(
      {
        glossario: [
          { termo: "Bureau", definicao: "quem responde pelo score" },
          { termo: "SKU", definicao: "outra definição" },
          { termo: "  ", definicao: "sem termo" },
        ],
      },
      produto({ glossario: [{ id: "1", termo: "SKU", definicao: "unidade de estoque", ordem: 0 }] })
    );

    expect(termosNovos).toEqual([{ termo: "Bureau", definicao: "quem responde pelo score" }]);
  });

  it("o casamento de termo ignora caixa — `SKU` e `sku` são o mesmo termo", () => {
    const { termosNovos } = propostaDeArquitetura(
      { glossario: [{ termo: "sku", definicao: "outra" }] },
      produto({ glossario: [{ id: "1", termo: "SKU", definicao: "unidade de estoque", ordem: 0 }] })
    );

    expect(termosNovos).toEqual([]);
  });

  it("sem resposta do gateway, a proposta é vazia — e ninguém fica impedido de escrever à mão", () => {
    expect(propostaDeArquitetura(undefined, produto())).toEqual({ campos: [], termosNovos: [] });
    expect(decisoesNaProposta(propostaDeArquitetura(undefined, produto()))).toBe(0);
  });

  it("o número de decisões conta o que muda, e só", () => {
    const proposta = propostaDeArquitetura(
      {
        objetivo: "novo",
        quemUsa: "igual",
        restricoes: "diverge",
        glossario: [{ termo: "Bureau", definicao: "x" }],
      },
      produto({ quemUsa: "igual", restricoes: "outro" })
    );

    // 1 novo + 1 diverge + 1 termo = 3. O `igual` não entra.
    expect(decisoesNaProposta(proposta)).toBe(3);
  });
});
