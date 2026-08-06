import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportarGraphify } from "./ImportarGraphify";

const GRAFO_EXEMPLO = {
  nodes: [
    { id: "n1", label: "x", source_file: "src/controllers/PagamentoController.java", source_location: "L1" },
    { id: "n2", label: "y", source_file: "src/utils/Helpers.java", source_location: "L1" },
  ],
};

const MAPEAMENTO_EXEMPLO = {
  regras: [{ padrao: "controllers?/", tipo: "service" }],
};

function arquivoJson(conteudo: unknown, nome = "graph.json"): File {
  return new File([JSON.stringify(conteudo)], nome, { type: "application/json" });
}

function respostaJson(corpo: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 404, json: () => Promise.resolve(corpo) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ImportarGraphify", () => {
  it("seleciona um graph.json, busca o mapeamento, e mostra nós mapeados + arquivos sem regra", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(respostaJson(MAPEAMENTO_EXEMPLO)))
    );
    const user = userEvent.setup();
    render(<ImportarGraphify onImportar={vi.fn()} />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, arquivoJson(GRAFO_EXEMPLO));

    expect(await screen.findByText(/nó\(s\) existente\(s\)\/extraído\(s\) encontrado\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 arquivo\(s\) sem regra de mapeamento/)).toBeInTheDocument();
  });

  it("sem config/graphify-mapping.json (404): mostra erro explicando o que fazer, não quebra", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(respostaJson(null, false)))
    );
    const user = userEvent.setup();
    render(<ImportarGraphify onImportar={vi.fn()} />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, arquivoJson(GRAFO_EXEMPLO));

    expect(await screen.findByText("Não deu pra importar")).toBeInTheDocument();
    expect(screen.getByText(/graphify-mapping\.json não encontrado/)).toBeInTheDocument();
  });

  it("adicionar ao canvas chama onImportar só com os nós mapeados (não gera arestas)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(respostaJson(MAPEAMENTO_EXEMPLO)))
    );
    const onImportar = vi.fn();
    const user = userEvent.setup();
    render(<ImportarGraphify onImportar={onImportar} />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, arquivoJson(GRAFO_EXEMPLO));
    await screen.findByText(/nó\(s\) existente\(s\)\/extraído\(s\) encontrado\(s\)/);

    await user.click(screen.getByRole("button", { name: "+ Adicionar ao canvas" }));

    expect(onImportar).toHaveBeenCalledTimes(1);
    const nos = onImportar.mock.calls[0][0];
    expect(nos).toHaveLength(1);
    expect(nos[0].type).toBe("service");
    expect(screen.getByText("✓ Adicionado")).toBeInTheDocument();
  });

  it("JSON inválido no arquivo selecionado: mostra erro, não quebra a tela", async () => {
    const user = userEvent.setup();
    render(<ImportarGraphify onImportar={vi.fn()} />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(["{ isso nao e json"], "graph.json", { type: "application/json" }));

    expect(await screen.findByText("Não deu pra importar")).toBeInTheDocument();
  });
});
