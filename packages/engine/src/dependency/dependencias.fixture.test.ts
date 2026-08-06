import { describe, expect, it } from "vitest";
import { resolverDependencias, type AtividadeComDependencias } from "./dependencias.js";
import { readFixture } from "../test-support/fixtures.js";

interface CasoFixture {
  nome: string;
  atividades: AtividadeComDependencias[];
  esperado: {
    ciclos?: Array<{ caminho: string[] }>;
    conflitos?: Array<{ codigo: string; atividades: string[]; alvo?: string }>;
    ordemTopologica?: string[];
    podeDerivar: boolean;
  };
}

interface Fixture02 {
  casos: CasoFixture[];
}

const fixture = readFixture<Fixture02>("02-ciclos-e-conflitos.json");

describe("fixtures/02-ciclos-e-conflitos.json — dependências, ciclos e conflitos", () => {
  for (const caso of fixture.casos) {
    it(caso.nome, () => {
      const resultado = resolverDependencias(caso.atividades);

      expect(resultado.podeDerivar).toBe(caso.esperado.podeDerivar);

      if (caso.esperado.ciclos) {
        expect(resultado.ciclos).toEqual(caso.esperado.ciclos);
      }
      if (caso.esperado.conflitos) {
        expect(resultado.conflitos).toEqual(
          expect.arrayContaining(caso.esperado.conflitos.map((c) => expect.objectContaining(c)))
        );
        expect(resultado.conflitos).toHaveLength(caso.esperado.conflitos.length);
      }
      if (caso.esperado.ordemTopologica) {
        expect(resultado.ordemTopologica).toEqual(caso.esperado.ordemTopologica);
      }
    });
  }
});
