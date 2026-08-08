import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
import type { EspecificacaoTemplate } from "../api/client";
import { ConfigScreen } from "./ConfigScreen";

const config: DiagramaConfig = {
  nodeTypes: {},
  edgeTypes: {},
  edgeRules: {},
};

const especificacaoTemplate: EspecificacaoTemplate = {
  id: "t1",
  timeId: "__global__",
  conteudo: "# {{titulo}}",
  atualizadoEm: new Date().toISOString(),
};

function renderTela(mostrarMembros: boolean, mostrarCamposAresta = true) {
  return render(
    <ConfigScreen
      config={config}
      perfisTime={{}}
      camposNo={[]}
      camposAresta={[]}
      especificacaoTemplate={especificacaoTemplate}
      pipelineAgentes={{ confirmacaoObrigatoria: true }}
      timeAtivo="time-x"
      mostrarMembros={mostrarMembros}
      mostrarCamposAresta={mostrarCamposAresta}
      onEditarValorPerfilTime={vi.fn()}
      onCriarCampoNo={vi.fn()}
      onAtualizarCampoNo={vi.fn()}
      onExcluirCampoNo={vi.fn()}
      onCriarCampoAresta={vi.fn()}
      onAtualizarCampoAresta={vi.fn()}
      onExcluirCampoAresta={vi.fn()}
      onSalvarEspecificacaoTemplate={vi.fn()}
      onSalvarPipelineAgentes={vi.fn()}
      onFechar={vi.fn()}
    />
  );
}

describe("ConfigScreen — aba Membros só no modo hospedado", () => {
  it("mostrarMembros=false (modo local/CLI) não renderiza a aba Membros", () => {
    renderTela(false);
    expect(screen.queryByRole("button", { name: "Membros" })).not.toBeInTheDocument();
  });

  it("mostrarMembros=true (modo hospedado) renderiza a aba Membros", () => {
    renderTela(true);
    expect(screen.getByRole("button", { name: "Membros" })).toBeInTheDocument();
  });
});

describe("ConfigScreen — aba Campos por tipo de conexão só no modo local (SPEC-21)", () => {
  it("mostrarCamposAresta=false (modo hospedado) não renderiza a aba — /campos-aresta não existe lá", () => {
    renderTela(true, false);
    expect(screen.queryByRole("button", { name: /Campos por tipo de conexão/ })).not.toBeInTheDocument();
  });

  it("mostrarCamposAresta=true (modo local) renderiza a aba", () => {
    renderTela(false, true);
    expect(screen.getByRole("button", { name: /Campos por tipo de conexão/ })).toBeInTheDocument();
  });
});
