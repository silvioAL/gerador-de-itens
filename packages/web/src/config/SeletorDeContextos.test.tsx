import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeletorDeContextos } from "./SeletorDeContextos";

const OPCOES = ["Backend-mensagens rabbitmq", "Backend-dados", "Mobile-android"];

describe("SeletorDeContextos — contexto vira clique, não digitação de cabeça", () => {
  it("adicionar pelo menu chama onMudar com o valor EXATO da lista — o typo deixa de existir", async () => {
    const onMudar = vi.fn();
    const user = userEvent.setup();
    render(
      <SeletorDeContextos valores={[]} opcoes={OPCOES} onMudar={onMudar} rotuloVazio="vazio vale sempre" ariaLabel="Contextos do item 1" />
    );

    expect(screen.getByText("vazio vale sempre")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Contextos do item 1: adicionar" }));
    await user.click(screen.getByRole("option", { name: "Backend-dados" }));

    expect(onMudar).toHaveBeenCalledWith(["Backend-dados"]);
  });

  it("o menu só oferece o que ainda não está marcado, e o chip remove ao clicar", async () => {
    const onMudar = vi.fn();
    const user = userEvent.setup();
    render(
      <SeletorDeContextos
        valores={["Backend-dados"]}
        opcoes={OPCOES}
        onMudar={onMudar}
        rotuloVazio="vazio vale sempre"
        ariaLabel="Contextos do item 1"
      />
    );

    await user.click(screen.getByRole("button", { name: "Contextos do item 1: adicionar" }));
    expect(screen.queryByRole("option", { name: "Backend-dados" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mobile-android" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remover contexto Backend-dados" }));
    expect(onMudar).toHaveBeenCalledWith([]);
  });

  it("valor legado fora da lista continua visível e removível — não some em silêncio", async () => {
    const onMudar = vi.fn();
    const user = userEvent.setup();
    render(
      <SeletorDeContextos
        valores={["backend-dados-typo-antigo"]}
        opcoes={OPCOES}
        onMudar={onMudar}
        rotuloVazio="vazio vale sempre"
        ariaLabel="Contextos do item 1"
      />
    );

    const chip = screen.getByRole("button", { name: "Remover contexto backend-dados-typo-antigo" });
    expect(chip).toHaveAttribute("title", expect.stringContaining("fora da lista"));
    await user.click(chip);
    expect(onMudar).toHaveBeenCalledWith([]);
  });

  it("sem lista de opções (config custom sem `contextos`), cai no input livre de antes", async () => {
    const onMudar = vi.fn();
    const user = userEvent.setup();
    render(
      <SeletorDeContextos valores={[]} opcoes={[]} onMudar={onMudar} rotuloVazio="vazio vale sempre" ariaLabel="Contextos do item 1" />
    );

    const input = screen.getByLabelText("Contextos do item 1");
    await user.type(input, "a, b");
    expect(onMudar).toHaveBeenLastCalledWith(["a", "b"]);
  });
});
