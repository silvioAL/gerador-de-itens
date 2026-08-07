import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QuebraResumo } from "../api/client";
import { AbrirQuebraScreen } from "./AbrirQuebraScreen";

const lista: QuebraResumo[] = [
  {
    id: "q1",
    titulo: "Aprovação de crédito v2",
    time: "time-pagamentos",
    criadoEm: "2026-01-10T10:00:00.000Z",
    atualizadoEm: "2026-01-12T10:00:00.000Z",
  },
  {
    id: "q2",
    titulo: "Portabilidade de conta",
    time: "time-portabilidade",
    criadoEm: "2026-02-05T10:00:00.000Z",
    atualizadoEm: "2026-02-05T10:00:00.000Z",
  },
  {
    id: "q3",
    titulo: null,
    time: "time-pagamentos",
    criadoEm: "2026-03-01T10:00:00.000Z",
    atualizadoEm: "2026-03-01T10:00:00.000Z",
  },
];

describe("AbrirQuebraScreen", () => {
  it("lista todas as quebras salvas, incluindo uma sem título ainda", () => {
    render(<AbrirQuebraScreen lista={lista} onAbrir={vi.fn()} onFechar={vi.fn()} />);

    expect(screen.getByText("Aprovação de crédito v2")).toBeInTheDocument();
    expect(screen.getByText("Portabilidade de conta")).toBeInTheDocument();
    expect(screen.getByText("(sem título)")).toBeInTheDocument();
  });

  it("busca por título filtra a lista em tempo real", async () => {
    const user = userEvent.setup();
    render(<AbrirQuebraScreen lista={lista} onAbrir={vi.fn()} onFechar={vi.fn()} />);

    await user.type(screen.getByLabelText("Buscar por título ou time"), "crédito");

    expect(screen.getByText("Aprovação de crédito v2")).toBeInTheDocument();
    expect(screen.queryByText("Portabilidade de conta")).not.toBeInTheDocument();
  });

  it("busca por time também filtra (não só título)", async () => {
    const user = userEvent.setup();
    render(<AbrirQuebraScreen lista={lista} onAbrir={vi.fn()} onFechar={vi.fn()} />);

    await user.type(screen.getByLabelText("Buscar por título ou time"), "portabilidade");

    expect(screen.getByText("Portabilidade de conta")).toBeInTheDocument();
    expect(screen.queryByText("Aprovação de crédito v2")).not.toBeInTheDocument();
  });

  it("filtro de data de criação usa criadoEm, não atualizadoEm", async () => {
    const user = userEvent.setup();
    render(<AbrirQuebraScreen lista={lista} onAbrir={vi.fn()} onFechar={vi.fn()} />);

    await user.type(screen.getByLabelText("Criada de"), "2026-02-01");

    expect(screen.queryByText("Aprovação de crédito v2")).not.toBeInTheDocument();
    expect(screen.getByText("Portabilidade de conta")).toBeInTheDocument();
    expect(screen.getByText("(sem título)")).toBeInTheDocument();
  });

  it("clicar numa quebra chama onAbrir com o id certo", async () => {
    const user = userEvent.setup();
    const onAbrir = vi.fn();
    render(<AbrirQuebraScreen lista={lista} onAbrir={onAbrir} onFechar={vi.fn()} />);

    await user.click(screen.getByText("Aprovação de crédito v2"));

    expect(onAbrir).toHaveBeenCalledWith("q1");
  });

  it("lista vazia mostra mensagem de nenhuma quebra salva ainda", () => {
    render(<AbrirQuebraScreen lista={[]} onAbrir={vi.fn()} onFechar={vi.fn()} />);

    expect(screen.getByText("Nenhuma quebra salva ainda.")).toBeInTheDocument();
  });

  it("busca sem resultado mostra mensagem específica, distinta de lista vazia", async () => {
    const user = userEvent.setup();
    render(<AbrirQuebraScreen lista={lista} onAbrir={vi.fn()} onFechar={vi.fn()} />);

    await user.type(screen.getByLabelText("Buscar por título ou time"), "não existe nenhuma assim");

    expect(screen.getByText("Nenhuma quebra encontrada com esse filtro.")).toBeInTheDocument();
  });
});
