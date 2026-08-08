import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PipelineAgentesTab } from "./PipelineAgentesTab";
import { PAPEIS_PADRAO } from "../api/client";

describe("PipelineAgentesTab (SPEC-24 Fase F — pipeline configurável)", () => {
  it("config antiga (só o toggle) mostra os 4 papéis de fábrica na ordem", () => {
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true }} onSalvar={vi.fn()} />);
    const cards = screen.getAllByTestId(/papel-config-/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      "papel-config-po",
      "papel-config-arquiteto",
      "papel-config-especialista",
      "papel-config-qa",
    ]);
  });

  it("alternar a confirmação salva na hora, levando os papéis juntos (o arquivo é um só)", async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true }} onSalvar={onSalvar} />);

    await user.click(screen.getByLabelText(/Confirmação obrigatória/i, { selector: "input" }));

    expect(onSalvar).toHaveBeenCalledWith({ confirmacaoObrigatoria: false, papeis: PAPEIS_PADRAO });
  });

  it("reordenar (↑) e salvar manda a nova ordem", async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={onSalvar} />);

    await user.click(screen.getByLabelText("Subir QA"));
    await user.click(screen.getByRole("button", { name: "Salvar papéis" }));

    const salvo = onSalvar.mock.calls[0][0];
    expect(salvo.papeis.map((p: { id: string }) => p.id)).toEqual(["po", "arquiteto", "qa", "especialista"]);
  });

  it("desativar um papel mantém ele na lista com ativo: false", async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={onSalvar} />);

    await user.click(screen.getByLabelText("Papel QA ativo"));
    await user.click(screen.getByRole("button", { name: "Salvar papéis" }));

    const salvo = onSalvar.mock.calls[0][0];
    expect(salvo.papeis.find((p: { id: string }) => p.id === "qa")).toMatchObject({ ativo: false });
  });

  it("+ Agente contextual cria papel custom editável (nome, contextos, prompt) e removível", async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={onSalvar} />);

    await user.click(screen.getByRole("button", { name: "+ Agente contextual" }));
    const card = screen.getByTestId("papel-config-agente-custom");

    const nome = within(card).getByLabelText("Nome");
    await user.clear(nome);
    await user.type(nome, "Especialista Kafka");
    await user.type(within(card).getByLabelText(/Contextos\/techs/), "Backend-mensagens, Kafka");
    await user.type(within(card).getByLabelText(/Prompt do papel/), "Você é o especialista em mensageria do time.");
    await user.click(screen.getByRole("button", { name: "Salvar papéis" }));

    const salvo = onSalvar.mock.calls[0][0];
    expect(salvo.papeis.at(-1)).toMatchObject({
      id: "agente-custom",
      nome: "Especialista Kafka",
      grupo: "especialista",
      contextos: ["Backend-mensagens", "Kafka"],
      preambulo: "Você é o especialista em mensageria do time.",
      ativo: true,
    });

    // Papel custom pode ser removido; os 4 padrão, não (só desativados).
    expect(within(card).getByLabelText(/Remover/)).toBeInTheDocument();
    expect(within(screen.getByTestId("papel-config-po")).queryByLabelText(/Remover/)).not.toBeInTheDocument();
  });
});
