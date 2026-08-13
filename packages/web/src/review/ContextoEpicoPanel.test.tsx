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

    // SPEC-53 — o terceiro argumento é o produto da demanda; sem seletor na
    // tela (nenhum produto cadastrado), ele é `null`, não `undefined`: "nenhum
    // produto" é uma resposta, e é ela que precisa atravessar até o banco.
    expect(onSalvar).toHaveBeenCalledWith(
      "Contexto anterior. Mais detalhe.",
      [{ nome: "retro.md", conteudo: "conteúdo anterior" }],
      null
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
    expect(onSalvar).toHaveBeenCalledWith("", [{ nome: "material.txt", conteudo: "conteúdo do arquivo" }], null);
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
    expect(onSalvar).toHaveBeenCalledWith("", [{ nome: "b.md", conteudo: "conteúdo b" }], null);
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

/**
 * SPEC-53 — o produto da demanda mora aqui, e não no header: é a mesma
 * pergunta do resto do painel ("de que estamos falando"), só que respondida
 * uma vez por produto em vez de recolada a cada demanda.
 */
describe("ContextoEpicoPanel — o produto da demanda (SPEC-53)", () => {
  const produtos = [
    { id: "p1", nome: "Portabilidade" },
    { id: "p2", nome: "Fatura" },
  ];

  it("escolher o produto devolve o id no salvar", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();
    render(<ContextoEpicoPanel produtos={produtos} onSalvar={onSalvar} onFechar={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Produto desta demanda"), "p2");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith("", [], "p2");
  });

  it("sem produto cadastrado, o seletor NÃO aparece — lista vazia é pior que nada", () => {
    render(<ContextoEpicoPanel produtos={[]} onSalvar={vi.fn()} onFechar={vi.fn()} />);
    expect(screen.queryByLabelText("Produto desta demanda")).not.toBeInTheDocument();
  });

  it("a demanda que já tinha produto abre com ele selecionado", () => {
    render(<ContextoEpicoPanel produtos={produtos} produtoId="p1" onSalvar={vi.fn()} onFechar={vi.fn()} />);
    expect(screen.getByLabelText("Produto desta demanda")).toHaveValue("p1");
  });

  it("voltar para '— nenhum —' desliga o vínculo: null, não string vazia", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();
    render(<ContextoEpicoPanel produtos={produtos} produtoId="p1" onSalvar={onSalvar} onFechar={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Produto desta demanda"), "");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith("", [], null);
  });
});
