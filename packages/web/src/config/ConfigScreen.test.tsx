import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiagramaConfig } from "@gerador/engine";
import type { EspecificacaoTemplate } from "../api/client";
import { ConfigScreen } from "./ConfigScreen";

/** Os rótulos das abas, para separar os botões de aba dos botões de dentro do
 * conteúdo. Uma aba nova entra aqui — e é de propósito que seja manual: a lista
 * é a declaração de "isto deveria funcionar". */
const ROTULOS_DE_ABA = [
  "Perfis de time",
  "Padrões por componente",
  "Campos por tipo de conexão",
  "Membros",
  "Acessos",
  "Regras de refinamento",
  "Especificação de solução",
  "Pipeline de IA",
  "Modelo de IA",
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

function renderTela() {
  return render(
    <ConfigScreen
      config={config}
      perfisTime={{}}
      camposNo={[]}
      camposAresta={[]}
      especificacaoTemplate={especificacaoTemplate}
      pipelineAgentes={{ confirmacaoObrigatoria: true }}
      timeAtivo="time-x"
      onPerfisMudaram={vi.fn()}
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

describe("ConfigScreen — só o hospedado existe (SPEC-33), sem props de modo", () => {
  it("Membros e Campos por tipo de conexão SEMPRE aparecem — o gate de modo era o ramo morto da §158", () => {
    renderTela();
    expect(screen.getByRole("button", { name: "Membros" })).toBeInTheDocument();
    // A aba de campos de conexão ficou INALCANÇÁVEL por meses atrás de
    // `modo === "local"`, com rotas vivas no servidor desde a SPEC-31 e a
    // porta desde o #303 — destravada junto com a remoção do gate.
    expect(screen.getByRole("button", { name: /Campos por tipo de conexão/ })).toBeInTheDocument();
  });
});

/**
 * ACHADO REAL do usuário: no modo HOSPEDADO a aba "Regras de refinamento" abria
 * EM BRANCO — botão presente, conteúdo nenhum. O gate `mostrarCamposAresta`
 * (que significa "modo local") tinha saído da declaração da aba na rodada do
 * #289 e continuado no corpo dela. Dois lugares decidem se uma aba existe, e só
 * um foi revisado.
 *
 * Este teste não pergunta pela aba de Regras: pergunta por TODAS. Um teste
 * específico teria fechado este caso e deixado o próximo aberto — que é
 * literalmente o que aconteceu da primeira vez.
 */
describe("ConfigScreen — nenhuma aba visível abre em branco", () => {
  it("toda aba oferecida mostra conteúdo ao ser aberta", async () => {
    const user = userEvent.setup();
    renderTela();

    const abas = screen.getAllByRole("button").filter((b) => ROTULOS_DE_ABA.some((r) => b.textContent?.startsWith(r)));
    expect(abas.length).toBeGreaterThan(3);

    const vazias: string[] = [];
    for (const aba of abas) {
      const rotulo = aba.textContent ?? "?";
      await user.click(aba);
      if (!(screen.getByTestId("corpo-da-aba").textContent ?? "").trim()) vazias.push(rotulo);
    }
    expect(vazias, `abas que abrem em branco: ${vazias.join(", ")}`).toEqual([]);
  });
});
