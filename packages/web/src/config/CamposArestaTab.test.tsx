import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiagramaConfig } from "@gerador/engine";
import type { CampoAresta } from "../api/client";
import { CamposArestaTab } from "./CamposArestaTab";

const config: DiagramaConfig = {
  nodeTypes: {},
  edgeTypes: {
    http: {
      label: "HTTP",
      spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number", required: false }],
    },
    publishes: { label: "publica", spec: [] },
  },
  edgeRules: {},
};

describe("CamposArestaTab", () => {
  it("lista os campos padrão de cada tipo de conexão mesmo sem nenhum campos_aresta cadastrado", () => {
    render(
      <CamposArestaTab
        config={config}
        camposAresta={[]}
        timeAtivo="time-x"
        onCriar={vi.fn()}
        onAtualizar={vi.fn()}
        onExcluir={vi.fn()}
      />
    );

    expect(screen.getByText("HTTP")).toBeInTheDocument();
    expect(screen.getByText(/Timeout \(ms\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sobrescrever" })).toBeInTheDocument();
    expect(screen.getByText("Nenhum campo ainda.")).toBeInTheDocument(); // publishes, sem spec nem custom
  });

  it("clicar em 'sobrescrever' pré-preenche o formulário, escopo já em 'time ativo'", async () => {
    const user = userEvent.setup();
    render(
      <CamposArestaTab
        config={config}
        camposAresta={[]}
        timeAtivo="time-x"
        onCriar={vi.fn()}
        onAtualizar={vi.fn()}
        onExcluir={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "sobrescrever" }));

    expect(screen.getByDisplayValue("Timeout (ms)")).toBeInTheDocument();
    expect(screen.getByLabelText("Escopo")).toHaveValue("time");
  });

  it("salvar uma sobrescrita chama onCriar com timeId do time ativo e a mesma key do campo padrão", async () => {
    const user = userEvent.setup();
    const onCriar = vi.fn();
    render(
      <CamposArestaTab
        config={config}
        camposAresta={[]}
        timeAtivo="time-x"
        onCriar={onCriar}
        onAtualizar={vi.fn()}
        onExcluir={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "sobrescrever" }));
    await user.type(screen.getByLabelText("Ajuda"), "Default do time: 3000ms");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onCriar).toHaveBeenCalledWith(
      expect.objectContaining({
        timeId: "time-x",
        tipoAresta: "http",
        key: "timeoutMs",
        ajuda: "Default do time: 3000ms",
      })
    );
  });

  it("+ Adicionar campo cria um campo novo (não sobrescrita) com key gerada do Rótulo", async () => {
    const user = userEvent.setup();
    const onCriar = vi.fn();
    render(
      <CamposArestaTab
        config={config}
        camposAresta={[]}
        timeAtivo="time-x"
        onCriar={onCriar}
        onAtualizar={vi.fn()}
        onExcluir={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "+ Adicionar campo" }));
    await user.type(screen.getByLabelText("Rótulo"), "Chave de roteamento");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onCriar).toHaveBeenCalledWith(
      expect.objectContaining({ timeId: "time-x", key: "chaveDeRoteamento", label: "Chave de roteamento" })
    );
  });

  it("um campo padrão já sobrescrito pelo time ativo mostra o aviso 'sobrescrito abaixo'", () => {
    const camposAresta: CampoAresta[] = [
      {
        id: "c1",
        timeId: "time-x",
        tipoAresta: "http",
        key: "timeoutMs",
        label: "Timeout (ms)",
        type: "number",
        required: false,
        valorPadrao: "3000",
        opcoes: null,
        ajuda: null,
        ordem: 0,
      },
    ];
    render(
      <CamposArestaTab
        config={config}
        camposAresta={camposAresta}
        timeAtivo="time-x"
        onCriar={vi.fn()}
        onAtualizar={vi.fn()}
        onExcluir={vi.fn()}
      />
    );

    expect(screen.getByText("sobrescrito abaixo pro seu time")).toBeInTheDocument();
    expect(screen.getAllByText("time-x").length).toBeGreaterThan(1); // texto intro + tag do campo custom
  });

  it("excluir um campo customizado chama onExcluir com o id", async () => {
    const user = userEvent.setup();
    const onExcluir = vi.fn();
    const camposAresta: CampoAresta[] = [
      {
        id: "c1",
        timeId: "__global__",
        tipoAresta: "publishes",
        key: "roteamento",
        label: "Chave de roteamento",
        type: "text",
        required: false,
        valorPadrao: null,
        opcoes: null,
        ajuda: null,
        ordem: 0,
      },
    ];
    render(
      <CamposArestaTab
        config={config}
        camposAresta={camposAresta}
        timeAtivo="time-x"
        onCriar={vi.fn()}
        onAtualizar={vi.fn()}
        onExcluir={onExcluir}
      />
    );

    await user.click(screen.getByRole("button", { name: "excluir" }));
    expect(onExcluir).toHaveBeenCalledWith("c1");
  });
});
