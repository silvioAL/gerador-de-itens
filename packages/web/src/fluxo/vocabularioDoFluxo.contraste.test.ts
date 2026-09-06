import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contraste } from "@gerador/engine";
import { TIPOS_DE_NO_DO_FLUXO } from "@gerador/aplicacao";
import { CORES_POR_FAMILIA, ICONES_POR_FAMILIA, ROTULOS_POR_FAMILIA, configDoFluxo } from "./vocabularioDoFluxo";
import { MAPA_ICONES } from "../canvas/icones";

/**
 * SPEC-107 fatia D — **as cores por família, travadas nos DOIS temas
 * (§2.4-11)**, pela mesma régua que o produto cobra dos outros (o molde de
 * `paleta.contraste.test.ts`). A cor da família pinta a borda e o badge do
 * cartão sobre `--painel-alto`: ilegível no escuro é defeito, não detalhe.
 */

const CSS = readFileSync(resolve(import.meta.dirname, "..", "styles.css"), "utf-8");

function paleta(seletor: string): Record<string, string> {
  const i = CSS.indexOf(seletor);
  const bloco = CSS.slice(i, CSS.indexOf("}", i));
  const cores: Record<string, string> = {};
  for (const m of bloco.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) cores[m[1]] = m[2];
  return cores;
}

const CLARO = paleta('[data-tema="claro"]');
const ESCURO = paleta(":root");

describe("o vocabulário visual do fluxo (SPEC-107 fatia D)", () => {
  it("toda família do catálogo tem cor, ícone (do catálogo curado) e rótulo genérico", () => {
    for (const familia of TIPOS_DE_NO_DO_FLUXO) {
      expect(CORES_POR_FAMILIA[familia], familia).toMatch(/^#[0-9a-f]{6}$/i);
      // Ícone fora do catálogo renderia a string crua no badge — o §346 do
      // visual: nome oferecido sem desenho que o honre.
      expect(MAPA_ICONES[ICONES_POR_FAMILIA[familia]], `ícone de ${familia}`).toBeDefined();
      expect(ROTULOS_POR_FAMILIA[familia], familia).toBeTruthy();
    }
  });

  it("as cores das famílias são únicas — família é distinção, não decoração", () => {
    const cores = Object.values(CORES_POR_FAMILIA);
    expect(new Set(cores).size).toBe(cores.length);
  });

  it("o config gerado cobre exatamente os tipos de nó do fluxo", () => {
    expect(Object.keys(configDoFluxo().nodeTypes).sort()).toEqual([...TIPOS_DE_NO_DO_FLUXO].sort());
  });

  it("nenhuma família usa a cor de um tipo da MESA — o risco anotado na §2.2 (dois grafos indistinguíveis)", () => {
    const diagramaDaMesa = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "..", "..", "..", "..", "config", "diagrama.example.json"), "utf-8")
    ) as { nodeTypes: Record<string, { color?: string }> };
    const coresDaMesa = new Set(
      Object.values(diagramaDaMesa.nodeTypes)
        .map((t) => t.color?.toLowerCase())
        .filter(Boolean)
    );
    for (const [familia, cor] of Object.entries(CORES_POR_FAMILIA)) {
      expect(coresDaMesa.has(cor.toLowerCase()), `${familia} usa cor da mesa (${cor})`).toBe(false);
    }
  });

  for (const [nome, cores] of [
    ["claro", CLARO],
    ["escuro", ESCURO],
  ] as const) {
    describe(`legível no tema ${nome}`, () => {
      it("declara o fundo do cartão", () => {
        expect(cores["--painel-alto"]).toBeTruthy();
      });
      for (const familia of TIPOS_DE_NO_DO_FLUXO) {
        it(`${familia} sobre o cartão >= 3:1`, () => {
          const razao = contraste(CORES_POR_FAMILIA[familia], cores["--painel-alto"]);
          expect(razao, `${CORES_POR_FAMILIA[familia]} sobre ${cores["--painel-alto"]}`).toBeDefined();
          expect(razao!, `${familia} no tema ${nome}`).toBeGreaterThanOrEqual(3);
        });
      }
    });
  }
});
