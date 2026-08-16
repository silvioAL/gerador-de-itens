import { describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import type { Decisao } from "@gerador/engine";
import { DecisoesDoNo } from "./DecisoesDoNo";

function decisao(p: Partial<Decisao> & { id: string }): Decisao {
  return {
    noId: "n1",
    titulo: `título de ${p.id}`,
    alternativas: [{ titulo: "Fila com retry" }, { titulo: "Chamada síncrona", consequencia: "acopla a queda do parceiro" }],
    escolhida: "Fila com retry",
    porque: "desacopla a disponibilidade do parceiro",
    status: "aceita",
    origem: "manual",
    autor: "quem decidiu",
    em: "2026-08-15T12:00:00.000Z",
    ...p,
  };
}

function montar(props: Partial<React.ComponentProps<typeof DecisoesDoNo>> = {}) {
  const onRegistrar = vi.fn();
  const onAceitar = vi.fn();
  const onSubstituir = vi.fn();
  render(
    <DecisoesDoNo
      noId="n1"
      decisoes={[]}
      autor="silvio@exemplo"
      onRegistrar={onRegistrar}
      onAceitar={onAceitar}
      onSubstituir={onSubstituir}
      {...props}
    />
  );
  return { onRegistrar, onAceitar, onSubstituir };
}

describe("DecisoesDoNo — o porquê ancorado no nó (SPEC-57 fatia C)", () => {
  it("mostra a escolhida E as descartadas, com o custo de cada uma", () => {
    // O que serve daqui a um ano é o descartado. Um painel que só mostra a
    // escolhida documenta o que foi feito e perde exatamente isso.
    montar({ decisoes: [decisao({ id: "d1" })] });

    expect(screen.getByText(/Fila com retry/)).toBeTruthy();
    expect(screen.getByText(/Chamada síncrona/)).toBeTruthy();
    expect(screen.getByText(/acopla a queda do parceiro/)).toBeTruthy();
  });

  it("proposta do agente aparece separada e exige aceite", () => {
    const { onAceitar } = montar({ decisoes: [decisao({ id: "d1", status: "proposta", origem: "sugerido" })] });

    expect(screen.getByTestId("decisao-proposta")).toBeTruthy();
    expect(screen.queryByTestId("decisao-vigente")).toBeNull();

    fireEvent.click(screen.getByTestId("aceitar-d1"));
    expect(onAceitar).toHaveBeenCalledWith("d1");
  });

  it("§253 — proposta de DEMONSTRAÇÃO leva a marca e não oferece aceite", () => {
    // Botão que não faz nada é pior que botão ausente: foi o que produziu o
    // "aceitei e o chip continua" do print. E §235: onde entra dado de
    // demonstração, entra a marca — faltava justamente nas decisões.
    const { onAceitar } = montar({
      decisoes: [decisao({ id: "decisao-do-tour-2", status: "proposta", origem: "sugerido" })],
      ehDeDemonstracao: (id) => id.startsWith("decisao-do-tour-"),
    });

    expect(screen.getByTestId("decisao-de-demonstracao")).toBeTruthy();
    expect(screen.queryByTestId("aceitar-decisao-do-tour-2")).toBeNull();
    expect(onAceitar).not.toHaveBeenCalled();
  });

  it("proposta REAL continua com o botão de aceite", () => {
    const { onAceitar } = montar({
      decisoes: [decisao({ id: "d-agente-1", status: "proposta", origem: "sugerido" })],
      ehDeDemonstracao: (id) => id.startsWith("decisao-do-tour-"),
    });

    fireEvent.click(screen.getByTestId("aceitar-d-agente-1"));
    expect(onAceitar).toHaveBeenCalledWith("d-agente-1");
    expect(screen.queryByTestId("decisao-de-demonstracao")).toBeNull();
  });

  it("decisão vigente sem porquê é apontada na cara, não escondida", () => {
    montar({ decisoes: [decisao({ id: "d1", porque: "" })] });

    expect(screen.getByTestId("decisao-sem-porque")).toBeTruthy();
  });

  it("não deixa registrar com uma opção só — isso é campo, não decisão", () => {
    // A régua que impede ADR de virar wiki. Sem ela, "preenchi um campo" vira
    // decisão e o mecanismo morre de excesso.
    const { onRegistrar } = montar();
    fireEvent.click(screen.getByTestId("registrar-decisao"));

    fireEvent.change(screen.getByPlaceholderText(/a decisão, em uma linha/), { target: { value: "Fila" } });
    fireEvent.change(screen.getByPlaceholderText("opção 1"), { target: { value: "Fila com retry" } });

    const salvar = screen.getByTestId("salvar-decisao") as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("opção 2"), { target: { value: "Chamada síncrona" } });
    fireEvent.change(screen.getByLabelText("alternativa escolhida"), { target: { value: "Fila com retry" } });
    expect((screen.getByTestId("salvar-decisao") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("salvar-decisao"));
    const registrada = onRegistrar.mock.calls[0][0] as Decisao;
    expect(registrada.alternativas).toHaveLength(2);
    expect(registrada.escolhida).toBe("Fila com retry");
    expect(registrada.noId).toBe("n1");
    expect(registrada.autor).toBe("silvio@exemplo");
  });

  it("renomear a opção já escolhida não desfaz a escolha", () => {
    // Achado real de formulário: a escolha guarda o TÍTULO (para reordenar não
    // trocar a decisão), então editar o título depois de escolher apagaria a
    // seleção em silêncio e o botão salvar voltaria a ficar cinza sem motivo
    // visível.
    const { onRegistrar } = montar();
    fireEvent.click(screen.getByTestId("registrar-decisao"));
    fireEvent.change(screen.getByPlaceholderText(/a decisão, em uma linha/), { target: { value: "Fila" } });
    fireEvent.change(screen.getByPlaceholderText("opção 1"), { target: { value: "Fila" } });
    fireEvent.change(screen.getByPlaceholderText("opção 2"), { target: { value: "Síncrono" } });
    fireEvent.change(screen.getByLabelText("alternativa escolhida"), { target: { value: "Fila" } });

    fireEvent.change(screen.getByPlaceholderText("opção 1"), { target: { value: "Fila com retry" } });

    fireEvent.click(screen.getByTestId("salvar-decisao"));
    expect((onRegistrar.mock.calls[0][0] as Decisao).escolhida).toBe("Fila com retry");
  });

  it("revisar uma decisão substitui em vez de apagar", () => {
    const { onSubstituir } = montar({ decisoes: [decisao({ id: "d1" })] });
    fireEvent.click(screen.getByText("revisar esta decisão"));

    fireEvent.change(screen.getByPlaceholderText(/a decisão, em uma linha/), { target: { value: "Voltar ao síncrono" } });
    fireEvent.change(screen.getByPlaceholderText("opção 1"), { target: { value: "Síncrono" } });
    fireEvent.change(screen.getByPlaceholderText("opção 2"), { target: { value: "Fila" } });
    fireEvent.change(screen.getByLabelText("alternativa escolhida"), { target: { value: "Síncrono" } });
    fireEvent.click(screen.getByTestId("salvar-decisao"));

    expect(onSubstituir).toHaveBeenCalled();
    expect(onSubstituir.mock.calls[0][0]).toBe("d1");
  });

  it("sem o callback do agente, o botão nem existe — e com ele, mostra que está lendo", async () => {
    montar();
    expect(screen.queryByTestId("pedir-decisao-ao-agente")).toBeNull();

    let liberar: () => void = () => {};
    const onPedirAoAgente = vi.fn(() => new Promise<void>((r) => (liberar = r)));
    render(
      <DecisoesDoNo
        noId="n1"
        decisoes={[]}
        autor="silvio@exemplo"
        onRegistrar={vi.fn()}
        onAceitar={vi.fn()}
        onSubstituir={vi.fn()}
        onPedirAoAgente={onPedirAoAgente}
      />
    );

    const botao = screen.getByTestId("pedir-decisao-ao-agente") as HTMLButtonElement;
    fireEvent.click(botao);
    // O rótulo diz o que ele LÊ, não só que está carregando: é a tese da
    // SPEC-56 §0.7 na tela — o motor mede, o agente explica.
    expect(screen.getByTestId("pedir-decisao-ao-agente").textContent).toContain("o motor mediu");
    expect((screen.getByTestId("pedir-decisao-ao-agente") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      liberar();
    });
    expect((screen.getByTestId("pedir-decisao-ao-agente") as HTMLButtonElement).disabled).toBe(false);
  });

  it("falha do agente aparece na tela, não some no console", async () => {
    const onPedirAoAgente = vi.fn(() => Promise.reject(new Error("sem credencial de IA configurada")));
    render(
      <DecisoesDoNo
        noId="n1"
        decisoes={[]}
        autor="silvio@exemplo"
        onRegistrar={vi.fn()}
        onAceitar={vi.fn()}
        onSubstituir={vi.fn()}
        onPedirAoAgente={onPedirAoAgente}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("pedir-decisao-ao-agente"));
    });

    expect(screen.getByTestId("erro-decisao-agente").textContent).toContain("sem credencial");
    // E o botão volta a funcionar: erro não pode deixar a tela travada.
    expect((screen.getByTestId("pedir-decisao-ao-agente") as HTMLButtonElement).disabled).toBe(false);
  });

  it("decisão de OUTRO nó não aparece neste painel", () => {
    montar({ decisoes: [decisao({ id: "d1", noId: "n2" })] });

    expect(screen.queryByTestId("decisao-vigente")).toBeNull();
  });
});

/**
 * SPEC-60 fatia A (§263) — a remedição no aceite da decisão.
 */
describe("DecisoesDoNo — o delta do aceite", () => {
  const DIAGRAMA = { nodes: [{ id: "n1" }], edges: [] } as never;

  it("diz o que aceitar move no placar, antes de mover", () => {
    montar({
      diagrama: DIAGRAMA,
      decisoes: [decisao({ id: "d1", status: "proposta", origem: "sugerido" })],
    });

    const delta = screen.getByTestId("delta-decisao-d1");
    expect(delta.textContent).toContain("propostas esperando 1 → 0");
    expect(delta.textContent).toContain("decisões vigentes 0 → 1");
  });

  it("proposta sem o porquê avisa que aceitar cria dívida", () => {
    montar({
      diagrama: DIAGRAMA,
      decisoes: [decisao({ id: "d1", status: "proposta", origem: "sugerido", porque: "" })],
    });

    expect(screen.getByTestId("delta-alerta").textContent).toContain("ninguém vai conseguir explicar");
  });

  it("SEM diagrama o aceite continua ali — a medição é acréscimo, não condição", () => {
    // A regressão que eu mesmo escrevi na primeira versão: `Delta` não desenha
    // caixa vazia, e o botão dentro dele sumia junto.
    const { onAceitar } = montar({ decisoes: [decisao({ id: "d1", status: "proposta", origem: "sugerido" })] });

    fireEvent.click(screen.getByTestId("aceitar-d1"));
    expect(onAceitar).toHaveBeenCalledWith("d1");
    expect(screen.queryByTestId("delta-decisao-d1")).toBeNull();
  });
});

/**
 * §263 — a demonstração mede, mas não oferece o aceite.
 */
describe("DecisoesDoNo — o delta na decisão de demonstração", () => {
  it("mostra o delta e NÃO mostra o botão de aceitar", () => {
    // §253 tirou o aceite da decisão de demonstração (ele gravaria numa quebra
    // que não é a sua). A medição não grava nada — e escondê-la faria o tour
    // deixar de mostrar a capacidade, que é o mesmo que ela não existir.
    montar({
      diagrama: { nodes: [{ id: "n1" }], edges: [] } as never,
      decisoes: [decisao({ id: "d1", status: "proposta", origem: "sugerido" })],
      ehDeDemonstracao: () => true,
    });

    expect(screen.getByTestId("delta-decisao-d1").textContent).toContain("propostas esperando 1 → 0");
    expect(screen.queryByTestId("aceitar-d1")).toBeNull();
    expect(screen.getByTestId("decisao-de-demonstracao")).toBeTruthy();
  });
});
