import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { derive } from "./derive.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
// packages/cli/src/commands -> repo root
const RAIZ_REPO = resolve(AQUI, "../../../..");

let dirOriginal: string;
let dirTemp: string;

beforeEach(() => {
  dirOriginal = process.cwd();
  dirTemp = mkdtempSync(join(tmpdir(), "gerador-cli-"));
  mkdirSync(join(dirTemp, "config"));

  for (const [origem, destino] of [
    ["config/app.example.json", "app.json"],
    ["config/diagrama.example.json", "diagrama.json"],
    ["config/regras.example.json", "regras.json"],
  ] as const) {
    writeFileSync(join(dirTemp, "config", destino), readFileSync(resolve(RAIZ_REPO, origem)));
  }

  const fixture = JSON.parse(
    readFileSync(resolve(RAIZ_REPO, "fixtures/01-servico-novo-fila-consumo.json"), "utf-8")
  );
  writeFileSync(join(dirTemp, "quebra.json"), JSON.stringify(fixture.quebra));

  process.chdir(dirTemp);
});

afterEach(() => {
  process.chdir(dirOriginal);
  rmSync(dirTemp, { recursive: true, force: true });
});

describe("comando `derive`", () => {
  it("grava os itens em Markdown com as 6 atividades da fixture 01", async () => {
    await derive(["quebra.json", "--out", "itens.md"]);

    const md = readFileSync(join(dirTemp, "itens.md"), "utf-8");
    expect(md).toContain("# Itens derivados");
    expect(md).toContain("srv-portabilidade");
    for (const rotulo of ["01", "02", "03", "04", "05", "06"]) {
      expect(md).toContain(`| ${rotulo} |`);
    }
  });

  it("grava CSV quando --out termina em .csv", async () => {
    await derive(["quebra.json", "--out", "itens.csv"]);
    const csv = readFileSync(join(dirTemp, "itens.csv"), "utf-8");
    expect(csv.split("\n")[0]).toBe("rotulo,tipo,tamanho,descricao,techs,contextos,dependencias,times,detalhes");
  });

  it("sem --out, imprime no stdout em vez de gravar arquivo", async () => {
    const escreveu: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      escreveu.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await derive(["quebra.json"]);
    } finally {
      process.stdout.write = original;
    }

    expect(escreveu.join("")).toContain("# Itens derivados");
  });

  it("rejeita sem argumento de quebra", async () => {
    await expect(derive([])).rejects.toThrow(/uso: gerador derive/);
  });
});
