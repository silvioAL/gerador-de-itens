import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiagramaConfig } from "@gerador/engine";
import type { CampoNo } from "../api/client";
import { CamposNoTab } from "./CamposNoTab";

const config: DiagramaConfig = {
  nodeTypes: {
    rabbit: {
      label: "Fila Rabbit",
      derives: "queue",
      techs: [],
      contextos: [],
      color: "#f97316",
      spec: [
        { key: "topic", label: "Nome do tópico", type: "text", required: true },
        { key: "dlxName", label: "Nome da DLQ", type: "text", required: false },
      ],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

describe("CamposNoTab", () => {
  it("lista os campos padrão de cada tipo de nó mesmo sem nenhum campos_no cadastrado", () => {
    render(
      <CamposNoTab config={config} camposNo={[]} timeAtivo="time-x" onCriar={vi.fn()} onAtualizar={vi.fn()} onExcluir={vi.fn()} />
    );

    expect(screen.getByText("Fila Rabbit")).toBeInTheDocument();
    expect(screen.getByText(/Nome do tópico/)).toBeInTheDocument();
    expect(screen.getByText(/Nome da DLQ/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "sobrescrever" })).toHaveLength(2);
  });

  it("clicar em 'sobrescrever' num campo padrão pré-preenche o formulário com os dados do campo, escopo já em 'time ativo'", async () => {
    const user = userEvent.setup();
    render(
      <CamposNoTab config={config} camposNo={[]} timeAtivo="time-x" onCriar={vi.fn()} onAtualizar={vi.fn()} onExcluir={vi.fn()} />
    );

    const [sobrescreverTopic] = screen.getAllByRole("button", { name: "sobrescrever" });
    await user.click(sobrescreverTopic);

    expect(screen.getByDisplayValue("Nome do tópico")).toBeInTheDocument();
    expect(screen.getByLabelText("Escopo")).toHaveValue("time");
  });

  it("salvar uma sobrescrita chama onCriar com timeId do time ativo e a mesma key do campo padrão", async () => {
    const user = userEvent.setup();
    const onCriar = vi.fn();
    render(
      <CamposNoTab config={config} camposNo={[]} timeAtivo="time-x" onCriar={onCriar} onAtualizar={vi.fn()} onExcluir={vi.fn()} />
    );

    const [sobrescreverTopic] = screen.getAllByRole("button", { name: "sobrescrever" });
    await user.click(sobrescreverTopic);

    const campoAjuda = screen.getByLabelText("Ajuda");
    await user.type(campoAjuda, "Sufixo obrigatório: .queue");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onCriar).toHaveBeenCalledWith(
      expect.objectContaining({ timeId: "time-x", tipoNo: "rabbit", key: "topic", ajuda: "Sufixo obrigatório: .queue" })
    );
  });

  it("um campo padrão já sobrescrito pelo time ativo mostra o aviso 'sobrescrito abaixo'", () => {
    const camposNo: CampoNo[] = [
      {
        id: "c1",
        timeId: "time-x",
        tipoNo: "rabbit",
        key: "topic",
        label: "Nome do tópico",
        type: "text",
        required: true,
        valorPadrao: null,
        opcoes: null,
        ajuda: "Sufixo .queue obrigatório",
        permiteNA: false,
        ordem: 0,
        itemSpec: null,
      },
    ];
    render(
      <CamposNoTab config={config} camposNo={camposNo} timeAtivo="time-x" onCriar={vi.fn()} onAtualizar={vi.fn()} onExcluir={vi.fn()} />
    );

    expect(screen.getByText("sobrescrito abaixo pro seu time")).toBeInTheDocument();
  });

  it("+ Adicionar campo continua criando um campo novo (não sobrescrita), com escopo selecionável", async () => {
    const user = userEvent.setup();
    render(
      <CamposNoTab config={config} camposNo={[]} timeAtivo="time-x" onCriar={vi.fn()} onAtualizar={vi.fn()} onExcluir={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "+ Adicionar campo" }));

    expect(screen.getByLabelText("Escopo")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chave")).not.toBeInTheDocument();
  });

  it("a chave (key) é gerada sozinha a partir do Rótulo — usuário comum nunca precisa preenchê-la", async () => {
    const user = userEvent.setup();
    const onCriar = vi.fn();
    render(
      <CamposNoTab config={config} camposNo={[]} timeAtivo="time-x" onCriar={onCriar} onAtualizar={vi.fn()} onExcluir={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "+ Adicionar campo" }));
    await user.type(screen.getByLabelText("Rótulo"), "Motor padrão");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onCriar).toHaveBeenCalledWith(expect.objectContaining({ key: "motorPadrao", label: "Motor padrão" }));
  });

  it("modo avançado revela a chave técnica e permite ajustá-la manualmente", async () => {
    const user = userEvent.setup();
    render(
      <CamposNoTab config={config} camposNo={[]} timeAtivo="time-x" onCriar={vi.fn()} onAtualizar={vi.fn()} onExcluir={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "+ Adicionar campo" }));
    await user.type(screen.getByLabelText("Rótulo"), "Motor padrão");
    await user.click(screen.getByRole("button", { name: "avançado: ver/editar a chave técnica" }));

    expect(screen.getByLabelText("Chave")).toHaveValue("motorPadrao");
    await user.clear(screen.getByLabelText("Chave"));
    await user.type(screen.getByLabelText("Chave"), "motorCustom");

    expect(screen.getByLabelText("Chave")).toHaveValue("motorCustom");
  });

  it("achado real: campo tipo 'lista' (ex.: Endpoints) é autorável pela UI — sub-campos do itemSpec vão no payload de criação", async () => {
    const user = userEvent.setup();
    const onCriar = vi.fn();
    render(
      <CamposNoTab config={config} camposNo={[]} timeAtivo="time-x" onCriar={onCriar} onAtualizar={vi.fn()} onExcluir={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "+ Adicionar campo" }));
    await user.type(screen.getByLabelText("Rótulo"), "Endpoints");
    await user.selectOptions(screen.getByLabelText("Tipo de campo"), "lista");

    await user.click(screen.getByRole("button", { name: "+ sub-campo" }));
    await user.type(screen.getByLabelText("Chave do sub-campo 1"), "method");
    await user.type(screen.getByLabelText("Rótulo do sub-campo 1"), "Method");

    await user.click(screen.getByRole("button", { name: "+ sub-campo" }));
    await user.type(screen.getByLabelText("Chave do sub-campo 2"), "path");
    await user.type(screen.getByLabelText("Rótulo do sub-campo 2"), "Path");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onCriar).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "lista",
        itemSpec: [
          { key: "method", label: "Method", type: "text", options: undefined },
          { key: "path", label: "Path", type: "text", options: undefined },
        ],
      })
    );
  });

  it("sub-campo sem chave/rótulo não entra no itemSpec salvo (linha em branco descartada)", async () => {
    const user = userEvent.setup();
    const onCriar = vi.fn();
    render(
      <CamposNoTab config={config} camposNo={[]} timeAtivo="time-x" onCriar={onCriar} onAtualizar={vi.fn()} onExcluir={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "+ Adicionar campo" }));
    await user.type(screen.getByLabelText("Rótulo"), "Endpoints");
    await user.selectOptions(screen.getByLabelText("Tipo de campo"), "lista");
    await user.click(screen.getByRole("button", { name: "+ sub-campo" }));
    // sub-campo fica em branco de propósito

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onCriar).toHaveBeenCalledWith(expect.objectContaining({ itemSpec: [] }));
  });
});
