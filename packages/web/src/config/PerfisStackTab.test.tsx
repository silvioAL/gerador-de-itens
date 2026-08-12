import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
vi.mock("../api/client", () => ({
  apiStacks: {
    catalogo: vi.fn(),
    criar: vi.fn(),
    definirValores: vi.fn(),
    capturar: vi.fn(),
  },
}));

import { apiStacks } from "../api/client";
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
    camunda: {
      label: "Processo Camunda",
      derives: "process",
      techs: [],
      contextos: [],
      color: "#f59e0b",
      spec: [{ key: "framework", label: "Framework", type: "text", required: false }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

/** O achado do usuário (§190): o "perfil" antigo misturava componentes num
 * nome só. Aqui cada stack é de UM componente — catálogo com três stacks. */
const catalogo = {
  stacks: [
    { id: "s1", tipoNo: "service", nome: "Java + Spring Boot", criadoPor: "dev", valores: { linguagem: "Java", framework: "Spring Boot" } },
    { id: "s2", tipoNo: "service", nome: "Node", criadoPor: "dev", valores: { linguagem: "Node" } },
    { id: "s3", tipoNo: "camunda", nome: "Camunda 7", criadoPor: "dev", valores: { framework: "Camunda 7" } },
  ],
};

function montar() {
  const onPerfisMudaram = vi.fn();
  render(<PerfisStackTab config={config} onPerfisMudaram={onPerfisMudaram} />);
  return { onPerfisMudaram };
}

beforeEach(() => {
  vi.clearAllMocks();
  (apiStacks.catalogo as Mock).mockResolvedValue(catalogo);
});

describe("PerfisStackTab (SPEC-43 — stacks conhecidas, catálogo global)", () => {
  it("agrupa por COMPONENTE: 'Java + Spring Boot' fica no Serviço e 'Camunda 7' no Processo — nada de pacote misto", async () => {
    montar();
    const cardJava = await screen.findByTestId("stack-Java + Spring Boot");
    expect(within(cardJava).getByText("Spring Boot", { exact: true })).toBeInTheDocument();
    // O card do Serviço NÃO carrega Camunda dentro (o defeito do print do §190).
    expect(within(cardJava).queryByText(/Camunda/)).not.toBeInTheDocument();
    expect(screen.getByTestId("stack-Camunda 7")).toBeInTheDocument();
    // Sem nenhuma menção a time ou "usado por" — o catálogo é global.
    expect(screen.queryByText(/usado por|time ativo|do time/i)).not.toBeInTheDocument();
  });

  it("editar um valor age na STACK via definirValores, e recarrega as sugestões do App", async () => {
    const { onPerfisMudaram } = montar();
    (apiStacks.definirValores as Mock).mockResolvedValue({ linguagem: "Java 21" });

    const cardJava = await screen.findByTestId("stack-Java + Spring Boot");
    fireEvent.click(within(cardJava).getByRole("button", { name: "Editar linguagem da stack Java + Spring Boot" }));

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "Java 21" } });
    fireEvent.click(screen.getByTestId("salvar-valor-de-stack"));

    await waitFor(() => expect(apiStacks.definirValores).toHaveBeenCalledWith("s1", { linguagem: "Java 21" }));
    await waitFor(() => expect(onPerfisMudaram).toHaveBeenCalled());
  });

  it("criar stack pede o COMPONENTE junto do nome", async () => {
    (apiStacks.criar as Mock).mockResolvedValue({ id: "novo", tipoNo: "camunda", nome: "Camunda 8", criadoPor: "x", valores: {} });
    montar();
    await screen.findByTestId("stack-Node");

    fireEvent.change(screen.getByLabelText("Componente da nova stack"), { target: { value: "camunda" } });
    fireEvent.change(screen.getByLabelText("Nome da nova stack"), { target: { value: "Camunda 8" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Criar stack" }));

    await waitFor(() => expect(apiStacks.criar).toHaveBeenCalledWith("camunda", "Camunda 8"));
  });

  it("catálogo vazio conduz: criar a primeira stack ou capturar pelo painel", async () => {
    (apiStacks.catalogo as Mock).mockResolvedValue({ stacks: [] });
    montar();
    expect(await screen.findByText(/Catálogo vazio/)).toBeInTheDocument();
  });
});
