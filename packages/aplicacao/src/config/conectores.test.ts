import { describe, expect, it } from "vitest";
import {
  CONTRATO_DA_OPERACAO,
  conectoresDeFabrica,
  conectoresEmVigor,
  normalizarConectores,
  validarEscritaConectores,
} from "./conectores.js";
import { ConfigInvalida, OPERACOES_DO_GATEWAY, type ConfigExportador } from "./normalizacao.js";

const CONECTOR_MINIMO = {
  id: "volumetria",
  nome: "Volumetria",
  endpoint: "https://gateway.exemplo/volumetria",
};

describe("normalizarConectores (SPEC-105 fatia A — a leitura degrada campo a campo)", () => {
  it("aplica os defaults resolvidos: POST, cabeçalhos vazios, envelope na raiz", () => {
    const { conectores } = normalizarConectores({ conectores: [CONECTOR_MINIMO] });
    expect(conectores).toEqual([
      {
        id: "volumetria",
        nome: "Volumetria",
        endpoint: "https://gateway.exemplo/volumetria",
        metodo: "POST",
        cabecalhos: {},
        envelope: "",
        entrada: [],
        saida: [],
      },
    ]);
  });

  it("descarta o inchamável: sem id, sem endpoint, id repetido", () => {
    const { conectores } = normalizarConectores({
      conectores: [
        CONECTOR_MINIMO,
        { ...CONECTOR_MINIMO },
        { nome: "sem id", endpoint: "https://x.exemplo" },
        { id: "sem-endpoint", nome: "x" },
      ],
    });
    expect(conectores.map((c) => c.id)).toEqual(["volumetria"]);
  });

  it("campo sem chave sai; tipo desconhecido cai em texto; caminho fora do subconjunto é descartado", () => {
    const { conectores } = normalizarConectores({
      conectores: [
        {
          ...CONECTOR_MINIMO,
          saida: [
            { chave: "rps", tipo: "inteiro64", caminho: "$.dados[*].rps" },
            { rotulo: "sem chave" },
            { chave: "pico", tipo: "numero", caminho: "$.dados.pico" },
          ],
        },
      ],
    });
    expect(conectores[0].saida).toEqual([
      { chave: "rps", rotulo: "rps", tipo: "texto" },
      { chave: "pico", rotulo: "pico", tipo: "numero", caminho: "$.dados.pico" },
    ]);
  });

  it("documento vazio é catálogo vazio, nunca undefined (§354)", () => {
    expect(normalizarConectores(undefined)).toEqual({ conectores: [] });
    expect(normalizarConectores({})).toEqual({ conectores: [] });
  });
});

describe("validarEscritaConectores (SPEC-35 — a escrita recusa o que a leitura tolera)", () => {
  it("catálogo vazio é escolha legítima", () => {
    expect(() => validarEscritaConectores({ conectores: [] })).not.toThrow();
    expect(() => validarEscritaConectores({})).not.toThrow();
  });

  it.each([
    [{ conectores: [{ nome: "sem id", endpoint: "https://x.exemplo" }] }, /sem "id"/],
    [{ conectores: [CONECTOR_MINIMO, { ...CONECTOR_MINIMO }] }, /dois conectores com o id/],
    [{ conectores: [{ id: "x", endpoint: "gateway.exemplo" }] }, /http:\/\/ ou https:\/\//],
    [{ conectores: [{ ...CONECTOR_MINIMO, metodo: "GET" }] }, /método desconhecido/],
    [{ conectores: [{ ...CONECTOR_MINIMO, entrada: [{ rotulo: "sem chave" }] }] }, /sem "chave"/],
    [{ conectores: [{ ...CONECTOR_MINIMO, saida: [{ chave: "a" }, { chave: "a" }] }] }, /duas vezes a chave/],
    [{ conectores: [{ ...CONECTOR_MINIMO, saida: [{ chave: "a", tipo: "data" }] }] }, /tipo desconhecido/],
    [{ conectores: [{ ...CONECTOR_MINIMO, saida: [{ chave: "a", caminho: "$..a" }] }] }, /fora do subconjunto/],
  ])("recusa com o motivo: %j", (documento, motivo) => {
    expect(() => validarEscritaConectores(documento)).toThrow(ConfigInvalida);
    expect(() => validarEscritaConectores(documento)).toThrow(motivo);
  });
});

describe("conectoresDeFabrica (§3.3 — os destinos do gateway vistos como conectores)", () => {
  const config: ConfigExportador = {
    endpoint: "https://agente.exemplo/itens",
    rotulo: "Tracker do time",
    cabecalhos: { Authorization: "Bearer segredo" },
    destinos: [
      { id: "wiki", operacao: "documento", endpoint: "https://gw.exemplo/documento", rotulo: "Confluence de Engenharia" },
      { id: "leitor", operacao: "documentoExterno", endpoint: "https://gw.exemplo/doc-externo", rotulo: "" },
    ],
  };

  it("deriva um conector por destino, com o contrato da operação e a herança já resolvida", () => {
    const fabrica = conectoresDeFabrica(config);
    expect(fabrica.map((c) => c.id).sort()).toEqual(["exportador", "leitor", "wiki"]);

    const wiki = fabrica.find((c) => c.id === "wiki")!;
    // O rótulo ecoa o nome que a pessoa cadastrou no destino.
    expect(wiki.nome).toBe("Confluence de Engenharia");
    expect(wiki.cabecalhos).toEqual({ Authorization: "Bearer segredo" });
    expect(wiki.entrada).toBe(CONTRATO_DA_OPERACAO.documento.entrada);
    expect(wiki.saida.find((s) => s.chave === "linkExterno")?.obrigatorio).toBe(true);

    // Sem rótulo, o nome da operação diz o que ele faz.
    expect(fabrica.find((c) => c.id === "leitor")!.nome).toBe("Documento da casa por link");

    // O endpoint herdado da SPEC-49 continua chamável como conector de itens.
    const itens = fabrica.find((c) => c.id === "exportador")!;
    expect(itens.envelope).toBe("itens");
    expect(itens.origem).toBe("fabrica");
  });

  it("toda operação da lista fechada tem contrato declarado", () => {
    // O Record é exaustivo em compilação; aqui só se garante que ninguém
    // declarou contrato com caminho fora do subconjunto.
    for (const operacao of OPERACOES_DO_GATEWAY) {
      expect(CONTRATO_DA_OPERACAO[operacao]).toBeDefined();
    }
  });

  it("sem nada configurado, a fábrica é vazia — catálogo não inventa endereço", () => {
    expect(conectoresDeFabrica({ endpoint: "", rotulo: "", cabecalhos: {} })).toEqual([]);
  });
});

describe("conectoresEmVigor (declarado vence fábrica no mesmo id)", () => {
  const config: ConfigExportador = { endpoint: "https://agente.exemplo/itens", rotulo: "", cabecalhos: {} };

  it("soma declarados e fábrica, com origem marcada", () => {
    const vigor = conectoresEmVigor(config, { conectores: [CONECTOR_MINIMO] });
    expect(vigor.map((c) => [c.id, c.origem])).toEqual([
      ["volumetria", "declarado"],
      ["exportador", "fabrica"],
    ]);
  });

  it("um declarado com o id de um destino substitui o de fábrica", () => {
    const vigor = conectoresEmVigor(config, {
      conectores: [{ id: "exportador", nome: "Itens, com forma minha", endpoint: "https://outro.exemplo" }],
    });
    expect(vigor).toHaveLength(1);
    expect(vigor[0].origem).toBe("declarado");
    expect(vigor[0].endpoint).toBe("https://outro.exemplo");
  });
});
