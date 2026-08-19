import { describe, expect, it } from "vitest";
import { criarCasosDeUsoDeConfig } from "./config.js";
import { CAMPO_GLOBAL, type DocumentoConfig, type RepositorioDeConfig } from "../portas/repositorioDeConfig.js";

const TEMPLATE = {
  tipos: ["História", "Task"],
  tamanhos: ["P", "M"],
  porTech: { Backend: { checklistTecnico: [{ texto: "timeout", contextos: [] }], testes: [] } },
  percursos: [
    { texto: "orçamento de latência", checagem: { campo: "timeoutMs", agregacao: "soma", operador: "lte", valor: 2000 } },
    { texto: "saltos", checagem: { campo: "saltos", operador: "lte", valor: 4 } },
  ],
};

function repoCom(documento: unknown): RepositorioDeConfig {
  return {
    async obter() {
      return documento === null
        ? null
        : ({ chave: "regras", timeId: CAMPO_GLOBAL, documento, versaoTemplate: null, atualizadoEm: null } as DocumentoConfig);
    },
    async salvar() {
      throw new Error("não usado neste teste");
    },
  } as unknown as RepositorioDeConfig;
}

/**
 * §272 — a seção que o documento NEM TEM nasce preenchida.
 *
 * O diagnóstico do §108 avisava que faltava a régua de percurso e a frase
 * "fica vazia para sempre" descrevia literalmente o que acontecia: a única
 * saída era digitar à mão o que o padrão já traz.
 */
describe("obter — completar seções ausentes (§272)", () => {
  it("seção que não existe no documento salvo vem do padrão", async () => {
    const casos = criarCasosDeUsoDeConfig(repoCom({ tipos: ["História"], tamanhos: ["P"], porTech: {} }));

    const { documento, diagnostico } = await casos.obter("regras", TEMPLATE);

    expect((documento as typeof TEMPLATE).percursos).toHaveLength(2);
    // E o aviso some junto: ele existia para dizer exatamente isto.
    expect(diagnostico.secoesVazias.map((s) => s.secao)).not.toContain("regrasDePercurso");
  });

  it("o que o documento TEM não é tocado — nem quando tem menos que o padrão", async () => {
    // A promessa de "nunca sobrescrever o que você editou" continua inteira:
    // config enxuta é escolha de time, não desatualização.
    const meu = { tipos: ["Task"], tamanhos: ["G"], porTech: {}, percursos: [] };
    const casos = criarCasosDeUsoDeConfig(repoCom(meu));

    const { documento } = await casos.obter("regras", TEMPLATE);

    expect(documento).toMatchObject({ tipos: ["Task"], tamanhos: ["G"] });
    // Vazio de propósito CONTINUA vazio: ausente é uma coisa, esvaziado é
    // outra — e só a primeira é sinal de documento velho.
    expect((documento as typeof meu).percursos).toEqual([]);
  });

  it("não mescla por dentro: uma tech apagada não volta", async () => {
    // Completar `porTech` chave a chave devolveria a regra que alguém tirou —
    // o oposto de respeitar a edição.
    const casos = criarCasosDeUsoDeConfig(
      repoCom({ tipos: [], tamanhos: [], porTech: { Frontend: { checklistTecnico: [], testes: [] } }, percursos: [] })
    );

    const { documento } = await casos.obter("regras", TEMPLATE);

    expect(Object.keys((documento as typeof TEMPLATE).porTech)).toEqual(["Frontend"]);
  });

  it("documento nunca editado continua sendo o próprio padrão", async () => {
    const casos = criarCasosDeUsoDeConfig(repoCom(null));

    const { documento, personalizado } = await casos.obter("regras", TEMPLATE);

    expect(personalizado).toBe(false);
    expect(documento).toEqual(TEMPLATE);
  });
});
