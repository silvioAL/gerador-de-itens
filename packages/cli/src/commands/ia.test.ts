import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        tamanhoAproximadoBytes: 2_500_000_000, raciocinador: false, selecionado: true,
      },
      {
        id: "deepseek-local", nome: "DeepSeek-R1 8B", papel: "DeepSeek-R1 (raciocinador)", instalado: false,
        tamanhoAproximadoBytes: 5_027_785_216, raciocinador: true, selecionado: false,
      },
    ],
  };
}
const verificarStatusMock = vi.fn(async () => statusFake(false));

vi.mock("@gerador/llm", async () => {
  const real = await vi.importActual<typeof import("@gerador/llm")>("@gerador/llm");
  return {
    ...real,
    baixarModelo: baixarModeloMock,
    verificarStatus: verificarStatusMock,
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
  writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
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
