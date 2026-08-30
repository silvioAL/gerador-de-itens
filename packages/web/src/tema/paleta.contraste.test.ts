import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contraste } from "@gerador/engine";

/**
 * SPEC-93 fatia D — **a paleta provada com a régua do próprio produto.**
 *
 * A SPEC-79 construiu `contraste()` para o motor cobrar contraste no design
 * system **do time**. Um produto que mede o contraste dos outros e não mede o
 * próprio é o tipo de incoerência que o §327 e o §328 já pegaram em outras
 * formas — então a paleta clara passa pela mesma função.
 *
 * Não é "ficou bonito": é aritmética de WCAG, e o teste falha se alguém
 * escurecer um cinza demais no futuro.
 */

const CSS = readFileSync(resolve(import.meta.dirname, "..", "styles.css"), "utf-8");

/** Lê um bloco de variáveis do CSS de verdade — uma cópia aqui divergiria dele
 * na primeira mudança, que é o defeito que este teste existe para pegar. */
function paleta(seletor: string): Record<string, string> {
  const i = CSS.indexOf(seletor);
  const bloco = CSS.slice(i, CSS.indexOf("}", i));
  const cores: Record<string, string> = {};
  for (const m of bloco.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) cores[m[1]] = m[2];
  return cores;
}

const CLARO = paleta('[data-tema="claro"]');
const ESCURO = paleta(":root");

/**
 * WCAG AA: 4,5:1 para texto normal, 3:1 para texto grande e elementos de apoio.
 *
 * Os cinzas de apoio (`--texto-fraco`, `--texto-mudo`) vão no 3: carregam
 * legenda e ajuda, nunca conteúdo — e exigir 4,5 deles apagaria a hierarquia,
 * que é justamente o trabalho que eles fazem.
 */
const PARES: { texto: string; sobre: string; minimo: number }[] = [
  { texto: "--texto", sobre: "--fundo", minimo: 4.5 },
  { texto: "--texto", sobre: "--painel", minimo: 4.5 },
  { texto: "--texto-2", sobre: "--painel", minimo: 4.5 },
  { texto: "--texto-fraco", sobre: "--painel", minimo: 3 },
  { texto: "--texto-mudo", sobre: "--painel", minimo: 3 },
  { texto: "--acento", sobre: "--painel", minimo: 3 },
  { texto: "--verde", sobre: "--painel", minimo: 3 },
  { texto: "--vermelho", sobre: "--painel", minimo: 3 },
  { texto: "--amarelo", sobre: "--painel", minimo: 3 },
  { texto: "--acento-gente-texto", sobre: "--painel", minimo: 3 },
];

for (const [nome, cores] of [
  ["claro", CLARO],
  ["escuro", ESCURO],
] as const) {
  describe(`a paleta ${nome} passa na régua que o produto cobra dos outros`, () => {
    it("declara todas as variáveis que os pares usam", () => {
      // Variável faltando faria o teste comparar `undefined` e passar por
      // omissão — o modo mais silencioso de uma trava morrer.
      const faltando = PARES.flatMap((p) => [p.texto, p.sobre]).filter((v) => !cores[v]);

      expect([...new Set(faltando)]).toEqual([]);
    });

    for (const { texto, sobre, minimo } of PARES) {
      it(`${texto} sobre ${sobre} >= ${minimo}:1`, () => {
        const razao = contraste(cores[texto], cores[sobre]);

        expect(razao, `${cores[texto]} sobre ${cores[sobre]}`).toBeDefined();
        expect(razao!, `${texto} sobre ${sobre} no tema ${nome}`).toBeGreaterThanOrEqual(minimo);
      });
    }
  });
}
