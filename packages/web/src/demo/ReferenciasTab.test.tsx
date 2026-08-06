import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReferenciasTab } from "./ReferenciasTab";
import type { Referencia } from "../api/client";

const REFERENCIA_EXEMPLO: Referencia = {
  id: "importador-graphify",
  timeId: null,
  titulo: "Import Graphify -> nós tipados",
  racional: "Tabela de regras com fallback explícito para não mapeados.",
  designPatterns: ["Rule table / strategy"],
  codigoRelacionado: ["packages/engine/src/adapters/graphify/importarGrafo.ts"],
  linkExterno: null,
  criadoEm: "2026-08-04",
};

describe("ReferenciasTab", () => {
  it("sem referências e sem estar criando, mostra a mensagem de biblioteca vazia", () => {
    render(<ReferenciasTab referencias={[]} onCriar={vi.fn()} onAtualizarLinkExterno={vi.fn()} />);
    expect(screen.getByText(/Nenhuma referência cadastrada ainda/)).toBeInTheDocument();
  });

  it("lista referências existentes com título, racional, padrões e código relacionado", () => {
    render(<ReferenciasTab referencias={[REFERENCIA_EXEMPLO]} onCriar={vi.fn()} onAtualizarLinkExterno={vi.fn()} />);

    expect(screen.getByText(REFERENCIA_EXEMPLO.titulo)).toBeInTheDocument();
    expect(screen.getByText(REFERENCIA_EXEMPLO.racional)).toBeInTheDocument();
    expect(screen.getByText("Rule table / strategy")).toBeInTheDocument();
    expect(screen.getByText("packages/engine/src/adapters/graphify/importarGrafo.ts")).toBeInTheDocument();
  });

  it("sem link externo ainda, mostra o convite pra colar um — e salva via onAtualizarLinkExterno", async () => {
    const user = userEvent.setup();
    const onAtualizarLinkExterno = vi.fn().mockResolvedValue(undefined);
    render(
      <ReferenciasTab referencias={[REFERENCIA_EXEMPLO]} onCriar={vi.fn()} onAtualizarLinkExterno={onAtualizarLinkExterno} />
    );

    await user.click(screen.getByText("sem link externo ainda — colar link"));
    await user.type(screen.getByPlaceholderText(/atlassian\.net/), "https://empresa.atlassian.net/wiki/pages/1");
    await user.click(screen.getByText("salvar"));

    expect(onAtualizarLinkExterno).toHaveBeenCalledWith("importador-graphify", "https://empresa.atlassian.net/wiki/pages/1");
  });

  it("com link já publicado, mostra o link em vez do convite pra colar", () => {
    render(
      <ReferenciasTab
        referencias={[{ ...REFERENCIA_EXEMPLO, linkExterno: "https://empresa.atlassian.net/wiki/pages/1" }]}
        onCriar={vi.fn()}
        onAtualizarLinkExterno={vi.fn()}
      />
    );

    expect(screen.getByRole("link", { name: /ver link externo/ })).toHaveAttribute(
      "href",
      "https://empresa.atlassian.net/wiki/pages/1"
    );
  });

  it("nova referência: preencher título/racional/padrões/código e salvar chama onCriar com os dados certos", async () => {
    const user = userEvent.setup();
    const onCriar = vi.fn().mockResolvedValue(undefined);
    render(<ReferenciasTab referencias={[]} onCriar={onCriar} onAtualizarLinkExterno={vi.fn()} />);

    await user.click(screen.getByText("+ Nova referência"));

    await user.type(screen.getByPlaceholderText(/Retry com backoff/), "Minha referência");
    await user.type(screen.getByPlaceholderText(/motivou essa decisão/), "Motivo qualquer");
    await user.type(screen.getByPlaceholderText(/circuit breaker/), "circuit breaker, retry");
    await user.type(screen.getByPlaceholderText(/derive\/derivar\.ts/), "packages/engine/src/derive/derivar.ts");

    await user.click(screen.getByText("Salvar"));

    expect(onCriar).toHaveBeenCalledWith({
      titulo: "Minha referência",
      racional: "Motivo qualquer",
      designPatterns: ["circuit breaker", "retry"],
      codigoRelacionado: ["packages/engine/src/derive/derivar.ts"],
    });
  });

  it("botão de salvar fica desabilitado sem título ou sem racional preenchido", async () => {
    const user = userEvent.setup();
    render(<ReferenciasTab referencias={[]} onCriar={vi.fn()} onAtualizarLinkExterno={vi.fn()} />);
    await user.click(screen.getByText("+ Nova referência"));

    expect(screen.getByText("Salvar")).toBeDisabled();
  });
});
