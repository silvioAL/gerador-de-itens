import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "./types.js";
import { TIPOS_CAMPO } from "./types.js";
import { readConfigFile } from "../test-support/fixtures.js";

const schema = readConfigFile<Record<string, never>>("diagrama.schema.json");
const diagrama = readConfigFile<DiagramaConfig>("diagrama.example.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fieldSpec = (schema as any).$defs.fieldSpec;

/**
 * §237 — o `diagrama.schema.json` é tooling de EDITOR: nenhum código o
 * referencia, então nada o obrigava a acompanhar o engine. Ele tinha ficado
 * para trás em três pontos ao mesmo tempo — faltavam dois tipos de campo
 * (`textarea`, `lista`), faltavam duas propriedades (`identificador`,
 * `itemSpec`) e ele declara `additionalProperties: false`, o que transforma
 * cada ausência em erro falso no editor de quem escreve config à mão.
 *
 * Documentação que desinforma é pior que documentação faltando: ela é
 * consultada com confiança. Estes testes são a correia que faltava — não
 * validam o JSON Schema de verdade (isso exigiria uma dependência nova para
 * um arquivo que nenhum runtime lê), e sim que ele não DIVERGE do engine.
 */
describe("diagrama.schema.json não pode divergir do engine", () => {
  it("os tipos de campo do schema são exatamente os do engine", () => {
    expect([...fieldSpec.properties.type.enum].sort()).toEqual([...TIPOS_CAMPO].sort());
  });

  it("toda propriedade usada na config de exemplo está declarada no schema", () => {
    // `additionalProperties: false` faz de cada ausência um erro falso na
    // ferramenta de quem edita o arquivo à mão.
    const declaradas = new Set(Object.keys(fieldSpec.properties));
    const usadas = new Set<string>();

    function varrer(campos: { [k: string]: unknown }[] | undefined) {
      for (const campo of campos ?? []) {
        for (const chave of Object.keys(campo)) usadas.add(chave);
        varrer(campo.itemSpec as { [k: string]: unknown }[] | undefined);
      }
    }
    for (const tipo of Object.values(diagrama.nodeTypes)) varrer(tipo.spec as never);
    for (const tipo of Object.values(diagrama.edgeTypes)) varrer(tipo.spec as never);

    const faltando = [...usadas].filter((c) => !declaradas.has(c));
    expect(faltando, `propriedades usadas na config e ausentes no schema: ${faltando.join(", ")}`).toEqual([]);
  });

  it("o schema declara `itemSpec` recursivo — lista de lista é o único caso fora", () => {
    // O engine não suporta lista aninhada (comentário em `FieldSpec.itemSpec`),
    // mas o schema precisa aceitar a forma do item, que é um fieldSpec.
    expect(fieldSpec.properties.itemSpec.items.$ref).toBe("#/$defs/fieldSpec");
  });
});
