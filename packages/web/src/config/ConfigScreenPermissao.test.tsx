import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";

vi.mock("../auth/usePermissoes", async () => {
  const real = await vi.importActual<typeof import("../auth/usePermissoes")>("../auth/usePermissoes");
  return { ...real, usePermissoes: vi.fn() };
});
vi.mock("../api/client", async () => {
  const real = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...real, apiPdca: { ...real.apiPdca, criarAjuste: vi.fn() } };
});

import { apiPdca } from "../api/client";
import { usePermissoes } from "../auth/usePermissoes";
import { ConfigScreen, type AbaConfig } from "./ConfigScreen";

const config: DiagramaConfig = { nodeTypes: {}, edgeTypes: {}, edgeRules: {} };
const template = { id: "t1", timeId: "__global__", conteudo: "# {{titulo}}\n{{itens}}", atualizadoEm: new Date().toISOString() };

function renderTela(area: AbaConfig) {
  render(
    <ConfigScreen
      config={config}
      timeIds={["time-pagamentos"]}
      camposNo={[]}
      camposAresta={[]}
      especificacaoTemplate={template}
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
      onFechar={vi.fn()}
      area={area}
      onAbrirMenu={vi.fn()}
    />
  );
}

/** RBAC ligado, e a pessoa só pode o que a lista disser. */
function comPermissoes(permitidos: string[]) {
  (usePermissoes as Mock).mockReturnValue({
    carregando: false,
    rbacAtivo: true,
    pode: (recurso: string) => permitidos.includes(recurso),
    nivel: "operar",
  });
}

beforeEach(() => vi.clearAllMocks());

describe("ConfigScreen — área negada (SPEC-51: SPEC-40 F2 + SPEC-39 F2)", () => {
  it("área sem permissão DIZ que é permissão — antes caía noutra tela em silêncio", () => {
    comPermissoes(["campos-no"]);
    renderTela("membros");

    expect(screen.getByTestId("area-sem-permissao").textContent).toContain("não tem permissão");
  });

  /**
   * SPEC-118 fatia G — **a fusão das duas abas não ampliou acesso nenhum.**
   *
   * As duas tinham recursos de RBAC diferentes: `exportacao` é aberta (sempre
   * foi) e `modeloIa` exige `credenciais-ia`. Fundi-las sem mais nada daria a
   * quem só cuida da exportação uma visão do formulário de credencial — uma
   * ampliação por efeito colateral de uma reorganização de tela.
   *
   * A régua ficou onde estava: a fusão é do MENU, e a seção de IA continua
   * atrás da permissão dela.
   */
  it("sem `credenciais-ia`, a tela de Conexões abre SEM a seção de IA", () => {
    comPermissoes(["campos-no"]);
    renderTela("exportacao");

    expect(screen.getByTestId("config-conexoes-unificada")).toBeInTheDocument();
    expect(screen.queryByTestId("conexao-ia")).not.toBeInTheDocument();
    expect(screen.getByTestId("conexao-casa")).toBeInTheDocument();
  });

  it("COM `credenciais-ia`, a seção de IA aparece — a permissão é o que decide", () => {
    comPermissoes(["credenciais-ia"]);
    renderTela("exportacao");

    expect(screen.getByTestId("conexao-ia")).toBeInTheDocument();
  });

  it("o link velho de `#/config/modelo-ia` chega em Conexões, e não em tela branca", () => {
    // §6.2 — "quem tem o link salvo não pode cair em tela branca", e o §308 já
    // custou por aba que trocou de lugar.
    comPermissoes(["credenciais-ia"]);
    renderTela("modeloIa");

    expect(screen.getByTestId("config-conexoes-unificada")).toBeInTheDocument();
    expect(screen.getByTestId("conexao-ia")).toBeInTheDocument();
  });

  it("o pedido nasce ALI: vira solicitação de ajuste com o recurso já certo", async () => {
    comPermissoes([]);
    (apiPdca.criarAjuste as Mock).mockResolvedValue({ id: "s1" });
    renderTela("campos");

    fireEvent.change(screen.getByLabelText("O que precisa mudar"), {
      target: { value: "falta o campo de DLQ na Fila Rabbit" },
    });
    fireEvent.click(screen.getByTestId("pedir-ajuste"));

    await waitFor(() =>
      expect(apiPdca.criarAjuste).toHaveBeenCalledWith({
        recurso: "campos-no",
        descricao: "falta o campo de DLQ na Fila Rabbit",
      })
    );
    expect(await screen.findByTestId("pedido-enviado")).toBeInTheDocument();
  });

  it("acesso e credencial NÃO se pedem por ajuste — a tela manda falar com um owner", () => {
    comPermissoes([]);
    renderTela("acessos");

    expect(screen.queryByTestId("pedir-ajuste")).not.toBeInTheDocument();
    expect(screen.getByTestId("area-sem-permissao").textContent).toContain("owner do time");
  });

  it("com permissão, nada disso aparece — o aviso é sobre ausência, não decoração", () => {
    comPermissoes(["campos-no"]);
    renderTela("campos");
    expect(screen.queryByTestId("area-sem-permissao")).not.toBeInTheDocument();
  });
});
