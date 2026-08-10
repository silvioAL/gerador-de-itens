import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baixarModeloMock = vi.fn(async () => "/caminho/fake/modelo.gguf");
function statusFake(instalado: boolean) {
  return {
    chatInstalado: instalado,
    embeddingInstalado: instalado,
    pronto: instalado,
    caminhoModelos: "/caminho/fake/models",
    provedor: "qwen-local",
    modelosChat: [
      {
        id: "qwen-local", nome: "Qwen3-4B", papel: "Qwen3-4B (chat)", instalado,
        tamanhoAproximadoBytes: 2_500_000_000, raciocinador: true, selecionado: true,
      },
    ],
    gateway: { configurado: false },
  };
}
const verificarStatusMock = vi.fn(async () => statusFake(false));

/** Credenciais em memória: a rota real grava no HOME da máquina, e um teste
 * não pode mexer na credencial do usuário. A persistência de verdade está
 * coberta em `packages/llm/src/credenciais.test.ts`. */
const credenciais = vi.hoisted(() => ({ atual: {} as Record<string, unknown> }));
const salvarCredencialMock = vi.fn(async (id: string, cred: unknown) => {
  credenciais.atual = { ...credenciais.atual, [id]: cred };
});
const lerCredenciaisMock = vi.fn(async () => credenciais.atual);

vi.mock("@gerador/llm", async () => {
  const real = await vi.importActual<typeof import("@gerador/llm")>("@gerador/llm");
  return {
    ...real,
    baixarModelo: baixarModeloMock,
    verificarStatus: verificarStatusMock,
    salvarCredencial: salvarCredencialMock,
    lerCredenciais: lerCredenciaisMock,
  };
});

const { ia } = await import("./ia.js");

let logs: string[] = [];
let logSpy: ReturnType<typeof vi.spyOn>;
let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logs = [];
  logSpy = vi.spyOn(console, "log").mockImplementation((msg: string) => {
    logs.push(String(msg));
  });
  // `as never`: a assinatura de `process.stdout.write` tem sobrecargas, e o
  // tipo do spy não casa com o `MockInstance` genérico. Silenciar aqui é
  // aceitável porque o spy só existe pra engolir a barra de progresso.
  writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true) as never;
  baixarModeloMock.mockClear();
  verificarStatusMock.mockClear();
});

afterEach(() => {
  logSpy.mockRestore();
  writeSpy.mockRestore();
});

describe("comando `gerador ia`", () => {
  it("sem subcomando (ou desconhecido) lança erro de uso", async () => {
    await expect(ia([])).rejects.toThrow(/uso: gerador ia/);
    await expect(ia(["outra-coisa"])).rejects.toThrow(/uso: gerador ia/);
  });

  it("`instalar` baixa os dois modelos registrados, um de cada vez", async () => {
    await ia(["instalar"]);
    expect(baixarModeloMock).toHaveBeenCalledTimes(2);
    expect(logs.join("\n")).toContain("Pronto");
  });

  it("`status` mostra o resultado de verificarStatus — não instalado", async () => {
    await ia(["status"]);
    expect(verificarStatusMock).toHaveBeenCalledOnce();
    expect(logs.join("\n")).toContain("não instalada");
  });

  it("achado real: `status` avisa 'pronta pra uso' quando os dois modelos estão instalados", async () => {
    verificarStatusMock.mockResolvedValueOnce(statusFake(true));
    await ia(["status"]);
    expect(logs.join("\n")).toContain("pronta pra uso");
  });
});

describe("`gerador ia conectar` (SPEC-25 Fase 2)", () => {
  let dirProjeto: string;

  beforeEach(() => {
    credenciais.atual = {};
    salvarCredencialMock.mockClear();
    dirProjeto = mkdtempSync(join(tmpdir(), "gerador-ia-conectar-"));
  });

  afterEach(() => {
    rmSync(dirProjeto, { recursive: true, force: true });
  });

  it("grava a credencial FORA do projeto e o provedor DENTRO — só o segundo vai pro git", async () => {
    await ia(["conectar", "--url", "https://gw.interno/v1", "--chave", "sk-secreta", "--modelo", "deepseek-chat"], dirProjeto);

    expect(salvarCredencialMock).toHaveBeenCalledWith("compativel-openai", {
      baseUrl: "https://gw.interno/v1",
      chave: "sk-secreta",
      modelo: "deepseek-chat",
    });
    // `config/ia.json` diz QUAL provedor usar; a chave não está nele.
    const config = readFileSync(join(dirProjeto, "config", "ia.json"), "utf-8");
    expect(JSON.parse(config)).toEqual({ provedorPadrao: "compativel-openai" });
    expect(config).not.toContain("sk-secreta");
  });

  it("faltando um dos três, explica o uso em vez de salvar credencial pela metade", async () => {
    await expect(ia(["conectar", "--url", "https://gw/v1", "--chave", "sk-1"], dirProjeto)).rejects.toThrow(
      /uso: gerador ia conectar/
    );
    expect(salvarCredencialMock).not.toHaveBeenCalled();
  });

  it("sem argumentos, mostra o que está configurado — com a chave MASCARADA", async () => {
    credenciais.atual = {
      "compativel-openai": { baseUrl: "https://gw/v1", chave: "sk-1234567890", modelo: "deepseek-chat" },
    };
    await ia(["conectar"], dirProjeto);

    const saida = logs.join("\n");
    expect(saida).toContain("https://gw/v1");
    expect(saida).toContain("sk-…7890");
    expect(saida).not.toContain("sk-1234567890");
  });

  it("`usar compativel-openai` é aceito e avisa que falta a credencial", async () => {
    await ia(["usar", "compativel-openai"], dirProjeto);
    expect(JSON.parse(readFileSync(join(dirProjeto, "config", "ia.json"), "utf-8"))).toEqual({
      provedorPadrao: "compativel-openai",
    });
    expect(logs.join("\n")).toContain("gerador ia conectar");
  });

  it("id inventado continua recusado", async () => {
    await expect(ia(["usar", "gpt-imaginario"], dirProjeto)).rejects.toThrow(/uso: gerador ia usar/);
  });
});
