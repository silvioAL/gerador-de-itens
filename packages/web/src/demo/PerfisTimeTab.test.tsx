import { describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiagramaConfig, PerfisConfig } from "@gerador/engine";
vi.mock("../api/client", () => ({
  apiPerfisStack: {
    catalogo: vi.fn().mockResolvedValue({ perfis: [], ponteiros: {} }),
    criar: vi.fn(),
    apontar: vi.fn(),
  },
}));

import { PerfisTimeTab } from "./PerfisTimeTab";

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

describe("PerfisTimeTab", () => {
  it("SPEC-38 F2: apontar um perfil do catálogo chama a API e pede pro App recarregar a projeção", async () => {
    const { apiPerfisStack } = await import("../api/client");
    (apiPerfisStack.catalogo as Mock).mockResolvedValue({
      perfis: [{ id: "p1", nome: "Java + Spring Boot", criadoPor: "dev", valores: {} }],
      ponteiros: {},
    });
    (apiPerfisStack.apontar as Mock).mockResolvedValue({});
    const onPerfisMudaram = vi.fn();

    render(
      <PerfisTimeTab
        perfisTime={{}}
        config={config}
        timeAtivo="time-pagamentos"
        onPerfisMudaram={onPerfisMudaram}
        onEditarValor={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByRole("option", { name: "Java + Spring Boot" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Perfil de stack do time ativo"), { target: { value: "p1" } });

    await waitFor(() => expect(apiPerfisStack.apontar).toHaveBeenCalledWith("time-pagamentos", "p1"));
    await waitFor(() => expect(onPerfisMudaram).toHaveBeenCalled());
  });

  it("sem times cadastrados, mostra a mensagem de vazio", () => {
    render(<PerfisTimeTab perfisTime={{}} config={config} timeAtivo="time-pagamentos" onPerfisMudaram={() => {}} onEditarValor={vi.fn()} />);
    expect(screen.getByText(/Nenhum time apontando perfil de stack/)).toBeInTheDocument();
  });

  it("lista os times com seus valores conhecidos e um link de editar por campo", () => {
    const perfisTime: PerfisConfig = { "time-x": { service: { linguagem: "Java" } } };
    render(<PerfisTimeTab perfisTime={perfisTime} config={config} timeAtivo="time-pagamentos" onPerfisMudaram={() => {}} onEditarValor={vi.fn()} />);

    expect(screen.getByText("time-x")).toBeInTheDocument();
    expect(screen.getByText("linguagem:", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar linguagem de Serviço para time-x/ })).toBeInTheDocument();
  });

  it("declarar um valor novo direto pelo formulário (ex.: time trabalha com Java) chama onEditarValor com time/tipo/campo/valor", async () => {
    const user = userEvent.setup();
    const onEditarValor = vi.fn();
    render(<PerfisTimeTab perfisTime={{}} config={config} timeAtivo="time-pagamentos" onPerfisMudaram={() => {}} onEditarValor={onEditarValor} />);

    await user.click(screen.getByText("+ Adicionar ou corrigir um valor de stack"));

    await user.type(screen.getByPlaceholderText("ex.: time-pagamentos"), "time-checkout");
    await user.selectOptions(screen.getByDisplayValue("Linguagem/Stack (linguagem)"), "linguagem");
    await user.type(screen.getByPlaceholderText("ex.: Java"), "Java");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onEditarValor).toHaveBeenCalledWith("time-checkout", "service", "linguagem", "Java");
  });

  it("clicar em 'editar' num valor existente pré-preenche o formulário com aquele valor", async () => {
    const user = userEvent.setup();
    const onEditarValor = vi.fn();
    const perfisTime: PerfisConfig = { "time-x": { service: { linguagem: "Java" } } };
    render(<PerfisTimeTab perfisTime={perfisTime} config={config} timeAtivo="time-pagamentos" onPerfisMudaram={() => {}} onEditarValor={onEditarValor} />);

    await user.click(screen.getByRole("button", { name: /Editar linguagem de Serviço para time-x/ }));

    const campoValor = screen.getByDisplayValue("Java");
    await user.clear(campoValor);
    await user.type(campoValor, "Kotlin");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onEditarValor).toHaveBeenCalledWith("time-x", "service", "linguagem", "Kotlin");
  });

  it("achado real: campo de identidade (nome do serviço) nunca é sugerido — nem como default, nem como opção no seletor de Campo", async () => {
    const user = userEvent.setup();
    render(<PerfisTimeTab perfisTime={{}} config={config} timeAtivo="time-pagamentos" onPerfisMudaram={() => {}} onEditarValor={vi.fn()} />);

    await user.click(screen.getByText("+ Adicionar ou corrigir um valor de stack"));

    // Default já abre em "linguagem" (primeiro campo não-identidade), não em "nome"
    expect(screen.getByDisplayValue("Linguagem/Stack (linguagem)")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Nome do serviço (nome)")).not.toBeInTheDocument();

    // "Nome do serviço" nem aparece como opção selecionável
    const seletorCampo = screen.getByLabelText("Campo");
    expect(within(seletorCampo).queryByText("Nome do serviço (nome)")).not.toBeInTheDocument();
  });

  it("botão Salvar fica desabilitado sem time ou sem valor preenchido", async () => {
    const user = userEvent.setup();
    render(<PerfisTimeTab perfisTime={{}} config={config} timeAtivo="time-pagamentos" onPerfisMudaram={() => {}} onEditarValor={vi.fn()} />);
    await user.click(screen.getByText("+ Adicionar ou corrigir um valor de stack"));

    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });
});
