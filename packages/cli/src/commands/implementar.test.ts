import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { implementar } from "./implementar.js";

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

async function capturarStdout(fn: () => Promise<void>): Promise<string> {
  const escreveu: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    escreveu.push(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return escreveu.join("");
}

describe("comando `implementar` (SPEC-14 — documento único por quebra)", () => {
  it("gera a especificação de solução da quebra inteira, com os 6 itens da fixture numerados", async () => {
    const saida = await capturarStdout(() => implementar(["quebra.json"]));

    expect(saida).toContain("# Especificação de solução");
    // Contexto (demandInfo) aparece uma vez só, não repetido por item.
    expect(saida.match(/Nova esteira de portabilidade com notificação assíncrona/g)).toHaveLength(1);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(saida).toContain(`### ${n}.`);
    }
    expect(saida).toContain("srv-portabilidade");
  });

  it("--out grava em arquivo em vez de imprimir", async () => {
    await implementar(["quebra.json", "--out", "especificacao.md"]);
    const conteudo = readFileSync(join(dirTemp, "especificacao.md"), "utf-8");
    expect(conteudo).toContain("#### Especificação técnica");
  });

  it("atividade de aresta: mostra origem e destino, e o refinamento técnico do item", async () => {
    const saida = await capturarStdout(() => implementar(["quebra.json"]));
    expect(saida).toContain("##### srv-portabilidade");
    expect(saida).toContain("##### proposta.aprovada.q");
    expect(saida).toContain("#### Requisitos de refinamento técnico");
  });

  it("rejeita sem o argumento de quebra", async () => {
    await expect(implementar([])).rejects.toThrow(/uso: gerador implementar/);
    await expect(implementar(["--out", "x.md"])).rejects.toThrow(/uso: gerador implementar/);
  });
});
