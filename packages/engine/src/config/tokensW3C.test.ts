import { describe, expect, it } from "vitest";
import { deTokensW3C, paraTokensW3C } from "./tokensW3C.js";

const CLARO = {
  cor: {
    fundo: { painel: { $value: "#ffffff", $type: "color", $description: "o fundo das superfícies" } },
    texto: { padrao: { $value: "#0f172a", $type: "color" } },
  },
  espaco: { "2": { $value: "8px", $type: "dimension" } },
};

const ESCURO = {
  cor: {
    fundo: { painel: { $value: "#0f172a", $type: "color" } },
    texto: { padrao: { $value: "#e5e7eb", $type: "color" } },
  },
};

describe("import e export do formato de tokens do W3C (SPEC-79 fatia A)", () => {
  it("achata grupos aninhados em nome pontuado, e guarda o grupo raiz", () => {
    const tokens = deTokensW3C(CLARO);

    expect(tokens).toEqual([
      { nome: "cor.fundo.painel", valor: "#ffffff", grupo: "cor", ajuda: "o fundo das superfícies" },
      { nome: "cor.texto.padrao", valor: "#0f172a", grupo: "cor" },
      { nome: "espaco.2", valor: "8px", grupo: "espaco" },
    ]);
  });

  it("casa o modo escuro por NOME, não por posição", () => {
    /**
     * A ordem das chaves de um JSON não é contrato. Casar por posição perderia
     * o par no primeiro token que alguém acrescentasse só num dos arquivos — e
     * perderia CALADO, atribuindo o valor escuro ao token errado.
     */
    const tokens = deTokensW3C(CLARO, ESCURO);

    expect(tokens.find((t) => t.nome === "cor.fundo.painel")?.valorEscuro).toBe("#0f172a");
    expect(tokens.find((t) => t.nome === "cor.texto.padrao")?.valorEscuro).toBe("#e5e7eb");
    // O que não existe no arquivo escuro fica sem `valorEscuro` — e não herda
    // o de outro token por acidente.
    expect(tokens.find((t) => t.nome === "espaco.2")?.valorEscuro).toBeUndefined();
  });

  it("ignora o que não é folha nem grupo, em vez de recusar o arquivo", () => {
    // Arquivo exportado de ferramenta real vem com metadado que não interessa.
    // Recusar o import inteiro por causa de uma chave desconhecida
    // transformaria a importação numa briga.
    const tokens = deTokensW3C({ $description: "meu sistema", cor: { base: { $value: "#fff" } }, versao: 3 });

    expect(tokens).toEqual([{ nome: "cor.base", valor: "#fff", grupo: "cor" }]);
  });

  it("alias entra literal, sem resolver — e é isso que faz a checagem se calar", () => {
    /**
     * Documentado como limitação, não como defeito: resolver alias exige grafo
     * com detecção de ciclo, e a fatia C não precisa. Uma cor que é alias não é
     * legível como cor, e a checagem de contraste se cala — que é o
     * comportamento certo, e não um silêncio acidental.
     */
    const tokens = deTokensW3C({ cor: { marca: { $value: "{cor.base.indigo}" } } });

    expect(tokens[0].valor).toBe("{cor.base.indigo}");
  });

  it("valor composto vira JSON em texto — não se perde, só não se mede", () => {
    const tokens = deTokensW3C({ sombra: { md: { $value: { x: 0, y: 2, blur: 4 }, $type: "shadow" } } });

    expect(tokens[0].valor).toBe('{"x":0,"y":2,"blur":4}');
  });

  it("a volta reconstrói a árvore, e o ciclo import→export→import é estável", () => {
    /**
     * O import não pode ser de mão única: um time que ajustou tokens aqui
     * precisa levá-los de volta para onde o design vive. Sem isso, esta tela
     * vira mais um lugar onde a verdade se bifurca (§263).
     */
    const ida = deTokensW3C(CLARO);
    const volta = paraTokensW3C(ida);

    expect(deTokensW3C(volta)).toEqual(ida);
  });

  it("e exportar no modo escuro usa `valorEscuro`, caindo no claro quando não há", () => {
    const tokens = deTokensW3C(CLARO, ESCURO);
    const escuro = paraTokensW3C(tokens, "escuro") as Record<string, Record<string, Record<string, { $value: string }>>>;

    expect(escuro.cor.fundo.painel.$value).toBe("#0f172a");
    // `espaco.2` não tem valor escuro: exporta o claro, em vez de sumir.
    const plano = paraTokensW3C(tokens, "escuro") as Record<string, Record<string, { $value: string }>>;
    expect(plano.espaco["2"].$value).toBe("8px");
  });
});
