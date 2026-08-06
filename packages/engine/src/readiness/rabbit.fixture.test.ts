import { describe, expect, it } from "vitest";
import type { Aresta, No } from "../model/types.js";
import type { FieldSpec } from "../config/types.js";
import { camposVisiveis, resolverDefault } from "../spec/campos.js";
import { calcularProntidao } from "./prontidao.js";
import { readFixture } from "../test-support/fixtures.js";

interface CasoFixture {
  nome: string;
  contexto: { no: Partial<No> & { id: string; type: string; status: No["status"] }; arestas: Aresta[] };
  esperado: {
    camposVisiveis?: string[];
    obrigatoriosEmAberto?: string[];
    prontidao: string;
    defaultsResolvidos?: Record<string, unknown>;
    inferidosPendentes?: string[];
    erros?: { campo: string; codigo: string }[];
  };
}

interface RabbitFixture {
  specDoTipo: FieldSpec[];
  casos: CasoFixture[];
}

const fixture = readFixture<RabbitFixture>("rabbit.json");

function toNo(parcial: CasoFixture["contexto"]["no"]): No {
  return {
    x: 0,
    y: 0,
    label: parcial.id,
    ...parcial,
    spec: parcial.spec ?? {},
    specNA: parcial.specNA ?? {},
  } as No;
}

describe("fixtures/rabbit.json — condicionalidade e prontidão", () => {
  for (const caso of fixture.casos) {
    it(caso.nome, () => {
      const no = toNo(caso.contexto.no);
      const arestas = caso.contexto.arestas;

      if (caso.esperado.camposVisiveis) {
        const visiveis = camposVisiveis(fixture.specDoTipo, no, arestas).map((c) => c.key);
        expect(visiveis).toEqual(caso.esperado.camposVisiveis);
      }

      const prontidao = calcularProntidao(fixture.specDoTipo, no, arestas);

      if (caso.esperado.obrigatoriosEmAberto) {
        expect(prontidao.obrigatoriosEmAberto).toEqual(caso.esperado.obrigatoriosEmAberto);
      }

      expect(prontidao.nivel).toBe(caso.esperado.prontidao);

      if (caso.esperado.inferidosPendentes) {
        expect(prontidao.inferidosPendentes).toEqual(caso.esperado.inferidosPendentes);
      }

      if (caso.esperado.erros) {
        expect(prontidao.erros).toEqual(caso.esperado.erros);
      }

      if (caso.esperado.defaultsResolvidos) {
        for (const [key, esperado] of Object.entries(caso.esperado.defaultsResolvidos)) {
          const campo = fixture.specDoTipo.find((c) => c.key === key)!;
          expect(resolverDefault(campo, no)).toBe(esperado);
        }
      }
    });
  }
});
