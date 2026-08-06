import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execMock = vi.fn();
vi.mock("node:child_process", () => ({ exec: (...args: unknown[]) => execMock(...args) }));

const { exportVault } = await import("./exportVault.js");

const AQUI = dirname(fileURLToPath(import.meta.url));
// packages/cli/src/commands -> repo root
const RAIZ_REPO = resolve(AQUI, "../../../..");

let dirOriginal: string;
let dirTemp: string;
let dirVault: string;

beforeEach(() => {
  dirOriginal = process.cwd();
  dirTemp = mkdtempSync(join(tmpdir(), "gerador-cli-vault-"));
  mkdirSync(join(dirTemp, "config"));

  for (const [origem, destino] of [
    ["config/diagrama.example.json", "diagrama.json"],
    ["config/regras.example.json", "regras.json"],
  ] as const) {
    writeFileSync(join(dirTemp, "config", destino), readFileSync(resolve(RAIZ_REPO, origem)));
  }

  // config/referencias/*.json local (SPEC-17) — sem servidor, sem fetch.
  mkdirSync(join(dirTemp, "config", "referencias"));
  writeFileSync(
    join(dirTemp, "config", "referencias", "retry-com-backoff.json"),
    JSON.stringify({
      titulo: "Retry com backoff exponencial",
      racional: "Evita martelar o broker durante uma instabilidade curta.",
      designPatterns: ["retry", "circuit breaker"],
      codigoRelacionado: ["packages/engine/src/derive/derivar.ts", "caminho/que/nao/existe.ts"],
      linkExterno: null,
    })
  );
  // Referência sem os campos opcionais — o formato precisa tolerar isso.
  writeFileSync(
    join(dirTemp, "config", "referencias", "sem-campos-opcionais.json"),
    JSON.stringify({ titulo: "Referência mínima", racional: "Só título e racional, o resto é opcional." })
  );

  // Vault fixture pequeno — imita o formato real que `graphify export obsidian`
  // gera (frontmatter com source_file, CRLF — achado real confirmado contra
  // um vault gerado de verdade), sem depender do Graphify instalado no teste.
  dirVault = join(dirTemp, "vault");
  mkdirSync(dirVault, { recursive: true });
  writeFileSync(
    join(dirVault, "derivar.ts.md"),
    '---\r\nsource_file: "packages/engine/src/derive/derivar.ts"\r\ntype: "code"\r\nlocation: "L1"\r\n---\r\n\r\n# derivar.ts\r\n'
  );
  // Nota de símbolo com o MESMO source_file, título diferente — não deve ser
  // escolhida como alvo do wikilink (só a nota do arquivo inteiro deve ser).
  writeFileSync(
    join(dirVault, "derivar().md"),
    '---\r\nsource_file: "packages/engine/src/derive/derivar.ts"\r\ntype: "code"\r\nlocation: "L199"\r\n---\r\n\r\n# derivar()\r\n'
  );

  execMock.mockClear();
  process.chdir(dirTemp);
});

afterEach(() => {
  process.chdir(dirOriginal);
  rmSync(dirTemp, { recursive: true, force: true });
});

describe("comando `export-vault` (SPEC-17 — local, sem servidor)", () => {
  it("escreve uma nota por referência local, com wikilink resolvido pro arquivo real e caminho não mapeado explícito", async () => {
    await exportVault(["--dir", dirVault]);

    const arquivos = readdirSync(join(dirVault, "referencias"));
    expect(arquivos).toHaveLength(2);
    const conteudo = readFileSync(join(dirVault, "referencias", "retry-com-backoff-exponencial.md"), "utf-8");

    expect(conteudo).toContain("# Retry com backoff exponencial");
    expect(conteudo).toContain("[[derivar.ts]] (`packages/engine/src/derive/derivar.ts`)");
    expect(conteudo).toContain("caminho/que/nao/existe.ts _(não encontrado no vault do Graphify");
  });

  it("referência sem designPatterns/codigoRelacionado/linkExterno não quebra", async () => {
    await exportVault(["--dir", dirVault]);

    const conteudo = readFileSync(join(dirVault, "referencias", "referencia-minima.md"), "utf-8");
    expect(conteudo).toContain("# Referência mínima");
    expect(conteudo).not.toContain("## Código relacionado");
    expect(conteudo).not.toContain("## Link externo");
  });

  it("sem config/referencias/ nenhuma, não é erro — só zero referências exportadas", async () => {
    rmSync(join(dirTemp, "config", "referencias"), { recursive: true, force: true });
    await exportVault(["--dir", dirVault]);
    expect(readdirSync(join(dirVault, "referencias"))).toHaveLength(0);
  });

  it("escreve uma nota de padrão por tipo de nó, com o cenário Gherkin já configurado", async () => {
    await exportVault(["--dir", dirVault]);

    const arquivos = readdirSync(join(dirVault, "patterns"));
    expect(arquivos.length).toBeGreaterThan(0);

    const notaKafka = readFileSync(join(dirVault, "patterns", "kafka.md"), "utf-8");
    expect(notaKafka).toContain("# Tópico Kafka");
    expect(notaKafka).toContain("## Campos-chave");
    expect(notaKafka).toContain("## Cenário Gherkin padrão");
    expect(notaKafka).toContain("```gherkin");
  });

  it("idempotente: rodar duas vezes não duplica arquivos", async () => {
    await exportVault(["--dir", dirVault]);
    await exportVault(["--dir", dirVault]);

    expect(readdirSync(join(dirVault, "referencias"))).toHaveLength(2);
  });

  it("erro claro quando o vault não existe (graphify export obsidian não rodou ainda)", async () => {
    await expect(exportVault(["--dir", join(dirTemp, "vault-inexistente")])).rejects.toThrow(
      /graphify export obsidian/
    );
  });

  it("imprime a URI obsidian://open com o nome do vault e a primeira referência, e não abre nada sem --abrir", async () => {
    const spy = vi.spyOn(console, "log");
    await exportVault(["--dir", dirVault]);

    const linhaUri = spy.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith("Abrir no Obsidian:"));
    expect(linhaUri).toBeDefined();
    expect(linhaUri).toMatch(/obsidian:\/\/open\?vault=vault&file=referencias%2F/);
    expect(execMock).not.toHaveBeenCalled();
  });

  it("--vault-nome sobrescreve o nome do vault na URI", async () => {
    const spy = vi.spyOn(console, "log");
    await exportVault(["--dir", dirVault, "--vault-nome", "Meu Vault"]);

    const linhaUri = spy.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith("Abrir no Obsidian:"));
    expect(linhaUri).toContain("vault=Meu+Vault");
  });

  it("--abrir chama o launcher do SO com a URI (Windows)", async () => {
    // Achado real: o CI roda em Ubuntu — `abrirNoSistema` só chama `exec` em
    // win32, senão só imprime. Força a plataforma pra testar o ramo que
    // dispara o launcher, independente do SO que roda a suíte.
    const plataformaOriginal = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      await exportVault(["--dir", dirVault, "--abrir"]);
      expect(execMock).toHaveBeenCalledTimes(1);
      expect(String(execMock.mock.calls[0][0])).toContain("obsidian://open?vault=vault");
    } finally {
      Object.defineProperty(process, "platform", { value: plataformaOriginal });
    }
  });

  it("--abrir fora do Windows não chama exec, só avisa que precisa abrir manualmente", async () => {
    const plataformaOriginal = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });
    const spy = vi.spyOn(console, "log");
    try {
      await exportVault(["--dir", dirVault, "--abrir"]);
      expect(execMock).not.toHaveBeenCalled();
      expect(spy.mock.calls.map((c) => String(c[0])).some((l) => l.includes("Abra manualmente"))).toBe(true);
    } finally {
      Object.defineProperty(process, "platform", { value: plataformaOriginal });
    }
  });
});
