import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
vi.mock("../api/client", () => ({
  apiPerfisStack: {
    catalogo: vi.fn(),
    criar: vi.fn(),
    apontar: vi.fn(),
    definirValores: vi.fn(),
  },
}));

import { apiPerfisStack } from "../api/client";
import { PerfisStackTab } from "./PerfisStackTab";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: [],
      contextos: [],
      color: "#3b82f6",
      spec: [
        { key: "nome", label: "Nome do serviço", type: "text", required: true, identificador: true },
        { key: "linguagem", label: "Linguagem/Stack", type: "select", options: ["Java", "Node"], required: false },
        { key: "framework", label: "Framework", type: "text", required: false },
      ],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

/** O cenário do print do usuário (§189): DOIS times apontando o MESMO perfil. */
const catalogoCompartilhado = {
  perfis: [
    {
      id: "p1",
      nome: "Java + Spring Boot",
      criadoPor: "dev",
      valores: { service: { linguagem: "Java", framework: "Spring Boot" } },
    },
    { id: "p2", nome: "Node", criadoPor: "dev", valores: { service: { linguagem: "Node" } } },
  ],
  ponteiros: { "time-pagamentos": "p1", "time-silvio": "p1", "time-portabilidade": "p2" },
};

function montar() {
  const onPerfisMudaram = vi.fn();
  render(<PerfisStackTab config={config} timeAtivo="time-silvio" onPerfisMudaram={onPerfisMudaram} />);
  return { onPerfisMudaram };
}

beforeEach(() => {
  vi.clearAllMocks();
  (apiPerfisStack.catalogo as Mock).mockResolvedValue(catalogoCompartilhado);
});

describe("PerfisStackTab (SPEC-42 — time não é stack)", () => {
  it("cards são por PERFIL, cada um UMA vez, com 'usado por' dizendo quem aponta — nunca um card por time", async () => {
    montar();
    const cardJava = await screen.findByTestId("perfil-Java + Spring Boot");
    expect(within(cardJava).getByText(/usado por: time-pagamentos, time-silvio/)).toBeInTheDocument();
    expect(within(screen.getByTestId("perfil-Node")).getByText(/usado por: time-portabilidade/)).toBeInTheDocument();
    // O defeito do print: 3 times, 2 perfis → DOIS cards (um por perfil),
    // nunca um card por time.
    expect(screen.getAllByTestId(/^perfil-/)).toHaveLength(2);
  });

  it("editar um valor age no PERFIL via definirValores, e o aviso diz pra quantos times vale", async () => {
    const { onPerfisMudaram } = montar();
    (apiPerfisStack.definirValores as Mock).mockResolvedValue({ linguagem: "Java 21" });

    const cardJava = await screen.findByTestId("perfil-Java + Spring Boot");
    fireEvent.click(
      within(cardJava).getByRole("button", { name: "Editar linguagem de Serviço no perfil Java + Spring Boot" })
    );

    // O aviso que faltava: o alcance da edição, em times.
    expect(screen.getByTestId("alcance-do-valor").textContent).toContain(
      'vale para os 2 times que apontam "Java + Spring Boot"'
    );

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "Java 21" } });
    fireEvent.click(screen.getByTestId("salvar-valor-de-perfil"));

    await waitFor(() =>
      expect(apiPerfisStack.definirValores).toHaveBeenCalledWith("p1", "service", { linguagem: "Java 21" })
    );
    await waitFor(() => expect(onPerfisMudaram).toHaveBeenCalled());
  });

  it("apontar um perfil pro time ativo continua funcionando (o vínculo do time, separado do catálogo)", async () => {
    const { onPerfisMudaram } = montar();
    (apiPerfisStack.apontar as Mock).mockResolvedValue({});

    await screen.findByTestId("perfil-Node");
    fireEvent.change(screen.getByLabelText("Perfil de stack do time ativo"), { target: { value: "p2" } });

    await waitFor(() => expect(apiPerfisStack.apontar).toHaveBeenCalledWith("time-silvio", "p2"));
    await waitFor(() => expect(onPerfisMudaram).toHaveBeenCalled());
  });

  it("catálogo vazio conduz: criar o primeiro perfil", async () => {
    (apiPerfisStack.catalogo as Mock).mockResolvedValue({ perfis: [], ponteiros: {} });
    (apiPerfisStack.criar as Mock).mockResolvedValue({ id: "novo", nome: "Node 20 + Fastify", criadoPor: "x", valores: {} });
    montar();

    expect(await screen.findByText(/Catálogo vazio/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome do novo perfil de stack"), { target: { value: "Node 20 + Fastify" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Criar perfil" }));
    await waitFor(() => expect(apiPerfisStack.criar).toHaveBeenCalledWith("Node 20 + Fastify"));
  });
});
