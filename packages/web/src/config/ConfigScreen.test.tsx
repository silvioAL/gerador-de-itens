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

function renderTela(mostrarMembros: boolean) {
  return render(
    <ConfigScreen
      config={config}
      perfisTime={{}}
      camposNo={[]}
      especificacaoTemplate={especificacaoTemplate}
      timeAtivo="time-x"
      mostrarMembros={mostrarMembros}
      onEditarValorPerfilTime={vi.fn()}
      onCriarCampoNo={vi.fn()}
      onAtualizarCampoNo={vi.fn()}
      onExcluirCampoNo={vi.fn()}
      onSalvarEspecificacaoTemplate={vi.fn()}
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
