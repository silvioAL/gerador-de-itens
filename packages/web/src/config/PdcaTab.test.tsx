import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";

vi.mock("../api/client", () => ({
  apiPdca: {
    config: vi.fn(),
    salvarConfig: vi.fn(),
    listarFeedback: vi.fn(),
    descartarFeedback: vi.fn(),
    listarAjustes: vi.fn(),
    criarAjuste: vi.fn(),
    decidirAjuste: vi.fn(),
    aplicarAjuste: vi.fn(),
  },
  apiRegras: { obter: vi.fn() },
  apiIa: { sugerir: vi.fn() },
}));

import { apiIa, apiPdca, apiRegras } from "../api/client";
import { PdcaTab } from "./PdcaTab";

const config: DiagramaConfig = {
  nodeTypes: {
    fila: {
      label: "Fila Rabbit",
      derives: "queue",
      techs: ["Backend"],
      contextos: ["Backend-mensageria"],
      spec: [{ key: "nome", label: "Nome da fila", type: "text", required: true, identificador: true }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

const regras = {
  tipos: [],
  tamanhos: [],
  porTech: { Backend: { checklistTecnico: [{ texto: "Logs relevantes emitidos", contextos: [] }], testes: [] } },
};

const feedback = {
  id: "f1",
  email: "dev@empresa.com",
  timeId: "time-pagamentos",
  texto: "faltou item de DLQ nas filas",
  estado: "novo" as const,
  solicitacaoId: null,
  criadoEm: new Date("2026-08-12T10:00:00Z").toISOString(),
};

function montar() {
  render(<PdcaTab config={config} timeAtivo="time-pagamentos" onAbrirArea={vi.fn()} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  (apiPdca.config as Mock).mockResolvedValue({ cadenciaUsos: 5, cadenciaFeedback: 3 });
  (apiPdca.listarFeedback as Mock).mockResolvedValue([feedback]);
  (apiPdca.listarAjustes as Mock).mockResolvedValue([]);
  (apiRegras.obter as Mock).mockResolvedValue(regras);
});

describe("PdcaTab — a jornada do PDCA (SPEC-45)", () => {
  it("o feedback do agente APARECE — era o buraco do §194 (escrita-só)", async () => {
    montar();
    expect(await screen.findByText(/faltou item de DLQ nas filas/)).toBeInTheDocument();
    expect(screen.getByTestId("feedbacks-do-ciclo").textContent).toContain("1 sem tratar");
  });

  it("propor ajuste abre o estúdio, e a prévia mostra a linha ENTRANDO num item de exemplo", async () => {
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));

    fireEvent.change(screen.getByLabelText("Texto do item"), { target: { value: "Política de DLQ definida" } });

    const previa = screen.getByTestId("previa-do-ajuste");
    await waitFor(() => expect(within(previa).getByTestId("previa-adicionado").textContent).toContain("Política de DLQ definida"));
    // O item simulado é o documento de verdade, com a regra já aplicada.
    expect(within(previa).getByTestId("previa-markdown").textContent).toContain("Política de DLQ definida");
  });

  it("tecnologia que o componente não usa avisa que NADA muda — o erro fácil de cometer", async () => {
    (apiRegras.obter as Mock).mockResolvedValue({
      ...regras,
      porTech: { ...regras.porTech, Frontend: { checklistTecnico: [], testes: [] } },
    });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));
    fireEvent.change(screen.getByLabelText("Texto do item"), { target: { value: "Acessibilidade verificada" } });
    fireEvent.change(screen.getByLabelText("Tecnologia alvo"), { target: { value: "Frontend" } });

    await waitFor(() => expect(screen.getByTestId("previa-sem-efeito").textContent).toContain("não é a deste componente"));
  });

  it("salvar cria a solicitação com a OPERAÇÃO e amarrada ao feedback", async () => {
    (apiPdca.criarAjuste as Mock).mockResolvedValue({ id: "s1" });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));
    fireEvent.change(screen.getByLabelText("Texto do item"), { target: { value: "Política de DLQ definida" } });
    fireEvent.click(screen.getByTestId("salvar-ajuste"));

    await waitFor(() =>
      expect(apiPdca.criarAjuste).toHaveBeenCalledWith(
        expect.objectContaining({
          recurso: "regras",
          feedbackId: "f1",
          operacao: {
            tipo: "adicionar-checklist",
            tech: "Backend",
            contextos: ["Backend-mensageria"],
            texto: "Política de DLQ definida",
          },
        })
      )
    );
  });

  it("o ✨ redige o texto do item a partir do feedback", async () => {
    (apiIa.sugerir as Mock).mockResolvedValue({ valor: "DLQ configurada e monitorada" });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));
    fireEvent.click(screen.getByTestId("redigir-com-ia"));

    await waitFor(() => expect(screen.getByLabelText("Texto do item")).toHaveValue("DLQ configurada e monitorada"));
    expect((apiIa.sugerir as Mock).mock.calls[0][0].contextoNo).toContain("faltou item de DLQ nas filas");
  });

  it("as solicitações aparecem JÁ no mount, e a aprovada aplica de verdade (o Act que faltava)", async () => {
    (apiPdca.listarAjustes as Mock).mockResolvedValue([
      {
        id: "s1",
        timeId: "time-pagamentos",
        solicitante: "dev@empresa.com",
        recurso: "regras",
        descricao: "faltou item de DLQ",
        estado: "aprovada",
        operacao: { tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "DLQ" },
        criadoEm: new Date().toISOString(),
      },
    ]);
    (apiPdca.aplicarAjuste as Mock).mockResolvedValue({ id: "s1", estado: "aplicada", aplicadaPor: "dev" });
    montar();

    await waitFor(() => expect(screen.getByTestId("solicitacoes-do-pdca")).toBeInTheDocument());
    expect(within(screen.getByTestId("ajuste-s1")).getByText(/faltou item de DLQ/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("aplicar-s1"));
    await waitFor(() => expect(apiPdca.aplicarAjuste).toHaveBeenCalledWith("s1"));
  });

  it("descartar registra a decisão de não tratar", async () => {
    (apiPdca.descartarFeedback as Mock).mockResolvedValue({ id: "f1", estado: "descartado" });
    montar();
    fireEvent.click(await screen.findByTestId("descartar-f1"));
    await waitFor(() => expect(apiPdca.descartarFeedback).toHaveBeenCalledWith("f1"));
  });
});
