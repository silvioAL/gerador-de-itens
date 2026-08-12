import { describe, expect, it } from "vitest";
import { ConfigInvalida, validarEscritaPipelineAgentes } from "./normalizacao.js";

/**
 * SPEC-35 — a escrita recusa o que a leitura tolera. `sanearPapeis` continua
 * saneando config antiga na exibição; estes casos provam que um PUT com a
 * mesma sujeira vira erro NOMEADO em vez de descarte silencioso.
 */
describe("validarEscritaPipelineAgentes (SPEC-35)", () => {
  const papel = (id: string) => ({ id, nome: id, grupo: "po", ativo: true, contextos: [] });

  it("sem a chave `papeis` passa — é o formato antigo, só o toggle", () => {
    expect(() => validarEscritaPipelineAgentes({ confirmacaoObrigatoria: true })).not.toThrow();
  });

  it("papel sem id é recusado dizendo a posição — era descartado em silêncio", () => {
    expect(() =>
      validarEscritaPipelineAgentes({ papeis: [papel("po"), { nome: "Sem id", grupo: "qa" }] })
    ).toThrow(/posição 2/);
  });

  it("id duplicado é recusado nomeando o id", () => {
    expect(() => validarEscritaPipelineAgentes({ papeis: [papel("po"), papel("po")] })).toThrow(/"po"/);
  });

  it("`papeis` vazio é recusado com o caminho de volta (remover a chave)", () => {
    expect(() => validarEscritaPipelineAgentes({ papeis: [] })).toThrow(ConfigInvalida);
    expect(() => validarEscritaPipelineAgentes({ papeis: [] })).toThrow(/remova a chave/);
  });

  it("lista válida passa — o portão não é mais estrito que o necessário", () => {
    expect(() => validarEscritaPipelineAgentes({ papeis: [papel("po"), papel("qa")] })).not.toThrow();
  });
});
