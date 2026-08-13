import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
import type { EspecificacaoTemplate } from "../api/client";
import { ConfigScreen, type AbaConfig } from "./ConfigScreen";

/**
 * SPEC-40 F1 — a régua de abas morreu: cada área é uma TELA, dirigida pela
 * rota. A lista abaixo é a declaração de "isto deveria funcionar" — uma área
 * nova entra aqui, de propósito manualmente.
 */
const AREAS: { area: AbaConfig; rotulo: RegExp }[] = [
  { area: "perfis", rotulo: /Stacks conhecidas/ },
  { area: "campos", rotulo: /Padrões por componente/ },
  { area: "camposAresta", rotulo: /Campos por tipo de conexão/ },
  { area: "membros", rotulo: /Membros/ },
  { area: "acessos", rotulo: /Acessos/ },
  { area: "regras", rotulo: /Regras de refinamento/ },
  { area: "especificacao", rotulo: /Especificação de solução/ },
  { area: "pipeline", rotulo: /Pipeline de IA/ },
  { area: "modeloIa", rotulo: /Modelo de IA/ },
  { area: "pdca", rotulo: /PDCA — melhoria contínua/ },
  { area: "exportacao", rotulo: /Exportação/ },
];

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

function renderTela(area: AbaConfig, extras: { onAbrirMenu?: () => void; onFechar?: () => void } = {}) {
  return render(
    <ConfigScreen
      config={config}
      timeIds={["time-pagamentos"]}
      camposNo={[]}
      camposAresta={[]}
      especificacaoTemplate={especificacaoTemplate}
      pipelineAgentes={{ confirmacaoObrigatoria: true }}
      timeAtivo="time-x"
      onPerfisMudaram={vi.fn()}
      onCriarCampoNo={vi.fn()}
      onAtualizarCampoNo={vi.fn()}
      onExcluirCampoNo={vi.fn()}
      onCriarCampoAresta={vi.fn()}
      onAtualizarCampoAresta={vi.fn()}
      onExcluirCampoAresta={vi.fn()}
      onSalvarEspecificacaoTemplate={vi.fn()}
      onSalvarPipelineAgentes={vi.fn()}
      onFechar={extras.onFechar ?? vi.fn()}
      area={area}
      onAbrirMenu={extras.onAbrirMenu ?? vi.fn()}
    />
  );
}

/**
 * Herdeiro do "nenhuma aba visível abre em branco" (achado real: Regras abria
 * vazia no hospedado). A pergunta continua por TODAS as áreas — agora cada
 * uma é uma tela, então cada uma renderiza direto pela prop de rota.
 */
describe("ConfigScreen — nenhuma ÁREA abre em branco, e o header diz onde se está", () => {
  for (const { area, rotulo } of AREAS) {
    it(`área "${area}" mostra conteúdo e o título da tela`, () => {
      const { unmount } = renderTela(area);
      expect((screen.getByTestId("corpo-da-aba").textContent ?? "").trim()).not.toBe("");
      // O rótulo aparece no header da tela (sense of place da SPEC-40).
      expect(screen.getAllByText(rotulo).length).toBeGreaterThan(0);
      unmount();
    });
  }
});

describe("ConfigScreen — a navegação é do menu e da rota", () => {
  it("☰ Menu abre o menu; Voltar ao canvas fecha a tela — e não existe mais régua de abas", () => {
    const onAbrirMenu = vi.fn();
    const onFechar = vi.fn();
    renderTela("membros", { onAbrirMenu, onFechar });

    screen.getByRole("button", { name: "☰ Menu" }).click();
    expect(onAbrirMenu).toHaveBeenCalled();
    screen.getByRole("button", { name: "Voltar ao canvas" }).click();
    expect(onFechar).toHaveBeenCalled();
    // Régua morta: não há botão de OUTRA área dentro da tela de Membros.
    expect(screen.queryByRole("button", { name: /Pipeline de IA/ })).not.toBeInTheDocument();
  });
});
