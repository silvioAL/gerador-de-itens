import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextoEpicoPanel } from "./ContextoEpicoPanel";

describe("ContextoEpicoPanel (Fase 1b, SPEC-23)", () => {
  it("pré-preenche com demandInfo/anexosContexto já salvos, e Salvar devolve o texto editado", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();

    render(
      <ContextoEpicoPanel
        demandInfo="Contexto anterior."
        anexosContexto={[{ nome: "retro.md", conteudo: "conteúdo anterior" }]}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />
    );

    const textarea = screen.getByLabelText("Contexto do épico (texto)");
    expect(textarea).toHaveValue("Contexto anterior.");
    expect(screen.getByText("retro.md")).toBeInTheDocument();

    await user.type(textarea, " Mais detalhe.");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith(
      "Contexto anterior. Mais detalhe.",
      [{ nome: "retro.md", conteudo: "conteúdo anterior" }]
    );
  });

  it("anexar um arquivo de texto lê o conteúdo via FileReader e adiciona à lista", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();

    render(<ContextoEpicoPanel onSalvar={onSalvar} onFechar={vi.fn()} />);

    const arquivo = new File(["conteúdo do arquivo"], "material.txt", { type: "text/plain" });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, arquivo);

    expect(await screen.findByText("material.txt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith("", [{ nome: "material.txt", conteudo: "conteúdo do arquivo" }]);
  });

  it("remover um anexo já adicionado tira só aquele, preservando os demais", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();

    render(
      <ContextoEpicoPanel
        anexosContexto={[
          { nome: "a.md", conteudo: "conteúdo a" },
          { nome: "b.md", conteudo: "conteúdo b" },
        ]}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remover anexo a.md" }));
    expect(screen.queryByText("a.md")).not.toBeInTheDocument();
    expect(screen.getByText("b.md")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith("", [{ nome: "b.md", conteudo: "conteúdo b" }]);
  });

  it("Cancelar fecha sem chamar onSalvar", async () => {
    const onSalvar = vi.fn();
    const onFechar = vi.fn();
    const user = userEvent.setup();

    render(<ContextoEpicoPanel onSalvar={onSalvar} onFechar={onFechar} />);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onSalvar).not.toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalled();
  });
});
