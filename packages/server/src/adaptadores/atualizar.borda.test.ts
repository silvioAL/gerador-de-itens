import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { corpoQuebra } from "../routes/quebras.js";

/**
 * SPEC-88 — **a trava do SEXTO funil.**
 *
 * ## O defeito que ela pega
 *
 * `quebrasEmPostgres.atualizar` monta um objeto `conteudo` campo a campo — uma
 * **segunda whitelist**, separada da do `criar`. Campo que entra na criação e
 * não aqui **salva e some no autosave**: a pessoa vê "salvo", recarrega, e
 * perdeu.
 *
 * ## Por que a trava do §310 não bastava
 *
 * Aquela cruza `keyof Quebra` com `corpoQuebra.shape` — ela guarda a **borda**.
 * O `modoDeOperacao` do §330 passou por ela sem problema: a borda tinha, a
 * coluna tinha, o `criar` tinha. Só o `atualizar` não tinha, e o campo salvava
 * na criação e sumia a cada autosave.
 *
 * ## Por que ler o ARQUIVO, e não chamar a função
 *
 * Chamar `atualizar` exige banco. O que precisa ser guardado aqui é textual:
 * **toda chave que a borda aceita aparece no bloco `conteudo`**. Ler o fonte é
 * grosseiro e é honesto sobre o que faz — e não custa um Postgres para acusar
 * um campo esquecido.
 */
const FONTE = readFileSync(resolve(import.meta.dirname, "quebrasEmPostgres.ts"), "utf-8");

/**
 * O que a borda aceita e o `atualizar` legitimamente NÃO grava, com o motivo.
 * Lista curta de propósito: cada entrada aqui é uma exceção que alguém teve que
 * justificar, e é assim que ela não vira gaveta.
 */
const NAO_GRAVA_NO_ATUALIZAR: Record<string, string> = {
  // O carimbo é do adaptador, nunca de quem manda (§ do `atualizadoEm` honesto).
  especificacaoGeradaEm: "o relógio é do adaptador, não do corpo da requisição",
};

describe("o `atualizar` não pode esquecer campo que a borda aceita (SPEC-88)", () => {
  it("toda chave do Zod aparece no bloco que o UPDATE grava", () => {
    const bloco = FONTE.slice(FONTE.indexOf("async atualizar"));
    const conteudo = bloco.slice(bloco.indexOf("const conteudo"), bloco.indexOf("const mudou"));

    const esquecidas = Object.keys(corpoQuebra.shape).filter(
      (chave) => !(chave in NAO_GRAVA_NO_ATUALIZAR) && !conteudo.includes(`${chave}:`)
    );

    expect(
      esquecidas,
      `estes campos a borda aceita e o UPDATE descarta — salvam na criação e somem no autosave:\n${esquecidas.join("\n")}`
    ).toEqual([]);
  });
});
