import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Atividade, FichaItem } from "@gerador/engine";
import { ConversaEspecificacao } from "./ConversaEspecificacao";

const alterarItemMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  // SPEC-30 Fase 1a: a janela agora pergunta ao servidor se o provedor
  // transcreve (`useVozNaEntrada`). Sem `status` no mock, o componente
  // quebra — e o mock incompleto seria uma mentira sobre o contrato.
  // "não transcreve" mantém estas specs no cenário que elas descrevem.
  apiIa: { alterarItem: alterarItemMock, status: async () => ({ capacidades: { transcricao: false } }) },
}));

function placeholder(chave: string, rotulo: string, valor?: string) {
  return { chave, tech: "", rotulo, resposta: valor ? { valor, origem: "manual" as const } : undefined };
}

function ficha(chave: string, rotulo: string): FichaItem {
  return {
    numero: 1,
    chave,
    rotulo,
    descricao: "",
    tipo: "História",
    tamanho: "M",
    techs: [],
    contextos: [],
    dependencias: [],
    especificacaoTecnica: [{ noId: "n1", label: "srv-checkout", tipoLabel: "Serviço", status: "novo" }],
    historiaUsuario: placeholder("_historiaUsuario", "História de usuário", "Como cliente, quero fechar o pedido."),
    criteriosAceiteContextual: placeholder("_criteriosAceite", "Critérios de aceite", "1. Responde em 300ms."),
    contrato: {
      noVinculado: placeholder("_contratoNoVinculado", "Nó vinculado"),
      request: placeholder("_contratoRequest", "Request"),
      response: placeholder("_contratoResponse", "Response"),
      erros: placeholder("_contratoErros", "Erros"),
      dependencias: placeholder("_contratoDependencias", "Dependências"),
    },
    regrasTeste: placeholder("_regrasTeste", "Regras de teste"),
    cenarioFeature: placeholder("_cenarioFeature", "Cenário"),
    checklistTecnico: [],
    volumetria: [],
  } as unknown as FichaItem;
}

function atividade(chave: string, over: Partial<Atividade> = {}): Atividade {
  return {
    chave,
    rotulo: chave,
    tipo: "História",
    tamanho: "M",
    descricao: "",
    techs: [],
    contextos: [],
    dependencias: [],
    origem: { nodeId: "n1" },
    ...over,
  } as unknown as Atividade;
}

const atividades = [
  atividade("01"),
  atividade("02", { dependencias: [{ type: "dependent", alvoChave: "01" }] }),
];
const fichas = new Map([
  ["01", ficha("01", "01")],
  ["02", ficha("02", "02")],
]);

function montar(onAplicar = vi.fn()) {
  render(
    <ConversaEspecificacao
      atividades={atividades}
      fichas={fichas}
      atividadeSelecionada={atividades[0]}
      onAplicar={onAplicar}
      onFechar={vi.fn()}
    />
  );
  return onAplicar;
}

beforeEach(() => {
  alterarItemMock.mockReset();
  alterarItemMock.mockResolvedValue({ alteracoes: [] });
});

describe("ConversaEspecificacao (SPEC-27 Fase 2 — alterar item e revisar os demais)", () => {
  it("manda os campos COM o valor atual — sem o 'antes' o modelo reescreve em vez de ajustar", async () => {
    montar();
    fireEvent.change(screen.getByLabelText("Descreva o que você quer"), {
      target: { value: "o timeout passou para 150ms" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(alterarItemMock).toHaveBeenCalled());
    const [pedido] = alterarItemMock.mock.calls.at(-1)!;
    expect(pedido.instrucao).toBe("o timeout passou para 150ms");
    expect(pedido.itemRotulo).toBe("01");
    expect(pedido.campos).toContainEqual({
      chave: "_criteriosAceite",
      rotulo: "Critérios de aceite",
      valorAtual: "1. Responde em 300ms.",
    });
    expect(pedido.contextoNo).toContain("srv-checkout");
  });

  it("a proposta mostra antes/depois e o porquê, e só aplica no Aceitar", async () => {
    alterarItemMock.mockResolvedValue({
      alteracoes: [{ campo: "_criteriosAceite", valor: "1. Responde em 150ms.", motivo: "o timeout mudou" }],
    });
    const onAplicar = montar();

    fireEvent.change(screen.getByLabelText("Descreva o que você quer"), { target: { value: "150ms" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByTestId("alteracao-_criteriosAceite")).toBeInTheDocument());
    expect(screen.getByText("1. Responde em 300ms.")).toBeInTheDocument(); // antes
    expect(screen.getByText("1. Responde em 150ms.")).toBeInTheDocument(); // depois
    expect(screen.getByText("o timeout mudou")).toBeInTheDocument();
    expect(onAplicar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(onAplicar).toHaveBeenCalledWith("01", "_criteriosAceite", {
      valor: "1. Responde em 150ms.",
      origem: "sugerido",
      confirmado: true,
    });
  });

  it("Rejeitar não aplica nada e tira o cartão de pendente", async () => {
    alterarItemMock.mockResolvedValue({
      alteracoes: [{ campo: "_criteriosAceite", valor: "novo texto", motivo: "porque sim" }],
    });
    const onAplicar = montar();
    fireEvent.change(screen.getByLabelText("Descreva o que você quer"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Rejeitar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Rejeitar" }));

    expect(onAplicar).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Aceitar" })).not.toBeInTheDocument();
  });

  it("'Revisar os demais' só habilita depois de aceitar algo — é a mudança aceita que se propaga", async () => {
    alterarItemMock.mockResolvedValue({
      alteracoes: [{ campo: "_criteriosAceite", valor: "1. Responde em 150ms.", motivo: "timeout" }],
    });
    montar();
    const botao = screen.getByTestId("revisar-demais") as HTMLButtonElement;
    expect(botao).toHaveTextContent("Revisar os demais (1)"); // o item 02 depende do 01
    expect(botao.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Descreva o que você quer"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Aceitar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));

    expect((screen.getByTestId("revisar-demais") as HTMLButtonElement).disabled).toBe(false);
  });

  it("revisar os demais manda o QUE MUDOU e não a instrução — é propagação, não reescrita", async () => {
    alterarItemMock.mockResolvedValue({
      alteracoes: [{ campo: "_criteriosAceite", valor: "1. Responde em 150ms.", motivo: "timeout" }],
    });
    montar();
    fireEvent.change(screen.getByLabelText("Descreva o que você quer"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Aceitar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));

    alterarItemMock.mockClear();
    fireEvent.click(screen.getByTestId("revisar-demais"));

    await waitFor(() => expect(alterarItemMock).toHaveBeenCalled());
    const [pedido] = alterarItemMock.mock.calls.at(-1)!;
    // Uma chamada por item impactado — só o 02, que depende do 01.
    expect(pedido.itemRotulo).toBe("02");
    expect(pedido.oQueMudou).toContain("1. Responde em 150ms.");
    expect(pedido.instrucao).toBe("");
  });

  it("item sem nada a mudar responde 'nada a mudar' — lista vazia é resposta válida", async () => {
    montar();
    fireEvent.change(screen.getByLabelText("Descreva o que você quer"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(screen.getByText("Não vi nada neste item que precise mudar com esse pedido.")).toBeInTheDocument()
    );
  });

  it("falha num item impactado não derruba a revisão dos outros", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    alterarItemMock.mockResolvedValue({
      alteracoes: [{ campo: "_criteriosAceite", valor: "novo", motivo: "m" }],
    });
    montar();
    fireEvent.change(screen.getByLabelText("Descreva o que você quer"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Aceitar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));

    alterarItemMock.mockRejectedValue(new Error("modelo travou"));
    fireEvent.click(screen.getByTestId("revisar-demais"));

    await waitFor(() => expect(screen.getByText(/02: não consegui revisar/)).toBeInTheDocument());
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
