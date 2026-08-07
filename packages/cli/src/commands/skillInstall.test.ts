import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { skillInstall } from "./skillInstall.js";

let dirOriginal: string;
let dirTemp: string;

beforeEach(() => {
  dirOriginal = process.cwd();
  dirTemp = mkdtempSync(join(tmpdir(), "gerador-cli-skill-"));
  process.chdir(dirTemp);
});

afterEach(() => {
  process.chdir(dirOriginal);
  rmSync(dirTemp, { recursive: true, force: true });
});

describe("comando `skill-install` (SPEC-17 — skill vem empacotada no pacote npm)", () => {
  it("cria .claude/skills/gerador-de-itens/SKILL.md por padrão, sem depender do repositório", async () => {
    await skillInstall([]);

    const conteudo = readFileSync(join(dirTemp, ".claude", "skills", "gerador-de-itens", "SKILL.md"), "utf-8");
    expect(conteudo).toContain("name: gerador-de-itens");
    expect(conteudo).toContain("gerador derive");
    expect(conteudo).not.toContain("C:\\Users");
  });

  it("aceita um destino customizado", async () => {
    await skillInstall(["minha-pasta/skills/gerador"]);

    const conteudo = readFileSync(join(dirTemp, "minha-pasta", "skills", "gerador", "SKILL.md"), "utf-8");
    expect(conteudo).toContain("name: gerador-de-itens");
  });

  it("sobrescreve se já existir (skill é mantida pela ferramenta, não pelo usuário)", async () => {
    const alvo = join(dirTemp, ".claude", "skills", "gerador-de-itens");
    mkdirSync(alvo, { recursive: true });
    writeFileSync(join(alvo, "SKILL.md"), "versão antiga");

    await skillInstall([]);

    const conteudo = readFileSync(join(alvo, "SKILL.md"), "utf-8");
    expect(conteudo).not.toBe("versão antiga");
    expect(conteudo).toContain("name: gerador-de-itens");
  });
});
