import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RegrasTab } from "./RegrasTab";

const obterMock = vi.hoisted(() => vi.fn());
const salvarMock = vi.hoisted(() => vi.fn());
const sugerirConfigMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiRegras: { obter: obterMock, salvar: salvarMock },
  apiIa: { sugerirConfig: sugerirConfigMock },
}));

const REGRAS = {
  tipos: ["História", "Task"],
  tamanhos: ["P", "M", "G"],
  porTech: {
    Backend: {
      checklistTecnico: [
        { texto: "Definir timeout e política de retry", contextos: ["Backend-http"] },
        { texto: "Definir plano de migração", contextos: [], when: { campo: "status", igual: "existente" } },
      ],
      // Preservado no salvamento, mesmo sem UI própria ainda.
      checklistProcesso: [{ texto: "Levantar massa de teste", contextos: [] }],
      testes: [{ tipo: "unitário", validacao: "cobertura", contextos: [], dev: true, hlg: false }],
    },
    Frontend: { checklistTecnico: [], testes: [] },
  },
};

beforeEach(() => {
  obterMock.mockReset();
  salvarMock.mockReset();
  sugerirConfigMock.mockReset();
  obterMock.mockResolvedValue(structuredClone(REGRAS));
  salvarMock.mockResolvedValue(undefined);
});

describe("RegrasTab (SPEC-23 fluxo 5 — regras.json ganha tela)", () => {
  it("lista os requisitos da tech selecionada e marca o que tem condição", async () => {
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByDisplayValue("Definir timeout e política de retry")).toBeTruthy());
    expect(screen.getByDisplayValue("Backend-http")).toBeTruthy();
    // O `when` não é editável na tela, mas fica visível pra ninguém achar que
    // o requisito aparece sempre.
    expect(screen.getByText("condicional")).toBeTruthy();
  });

  it("adicionar um requisito grava o arquivo inteiro preservando processo/testes da tech", async () => {
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByLabelText("Novo item")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Novo item"), {
      target: { value: "Definir a chave de idempotência da mensagem" },
    });
    fireEvent.change(screen.getByLabelText("Contextos do novo item"), { target: { value: "Backend-mensagens" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Adicionar" }));

    await waitFor(() => expect(salvarMock).toHaveBeenCalled());
    const gravado = salvarMock.mock.calls.at(-1)![0];
    expect(gravado.porTech.Backend.checklistTecnico.at(-1)).toEqual({
      texto: "Definir a chave de idempotência da mensagem",
      contextos: ["Backend-mensagens"],
    });
    // O que a tela não edita continua no arquivo — a UI não é dona dele.
    expect(gravado.porTech.Backend.checklistProcesso).toHaveLength(1);
    expect(gravado.porTech.Backend.testes).toHaveLength(1);
    expect(gravado.porTech.Frontend).toEqual({ checklistTecnico: [], testes: [] });
    expect(gravado.tipos).toEqual(["História", "Task"]);
  });

  it("remover tira só o requisito escolhido", async () => {
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByLabelText("Remover item 1")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Remover item 1"));

    await waitFor(() => expect(salvarMock).toHaveBeenCalled());
    const gravado = salvarMock.mock.calls.at(-1)![0];
    expect(gravado.porTech.Backend.checklistTecnico.map((r: { texto: string }) => r.texto)).toEqual([
      "Definir plano de migração",
    ]);
  });

  it("a sugestão da IA entra como requisito novo da tech, com o contexto do que já existe no prompt", async () => {
    sugerirConfigMock.mockResolvedValue({
      texto: "Definir o tratamento de mensagem duplicada",
      contextos: ["Backend-mensagens"],
    });
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByTestId("sugerir-ia-regra-refinamento")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Descreva o que a IA deve propor"), {
      target: { value: "algo sobre duplicidade de mensagem" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sugerir/ }));

    await waitFor(() => expect(salvarMock).toHaveBeenCalled());
    const gravado = salvarMock.mock.calls.at(-1)![0];
    expect(gravado.porTech.Backend.checklistTecnico.at(-1)).toEqual({
      texto: "Definir o tratamento de mensagem duplicada",
      contextos: ["Backend-mensagens"],
    });
    // O prompt leva os requisitos existentes — sem isso o modelo repete o que já está lá.
    const [pedido] = sugerirConfigMock.mock.calls.at(-1)!;
    expect(pedido.contexto).toContain("Tecnologia: Backend");
    expect(pedido.contexto).toContain("Definir timeout e política de retry");
  });

  it("trocar de tech mostra a lista da outra tech", async () => {
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByLabelText("Tecnologia")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Tecnologia"), { target: { value: "Frontend" } });
    await waitFor(() => expect(screen.getByText("Nada configurado para esta tecnologia ainda.")).toBeTruthy());
  });
});

describe("RegrasTab — as quatro listas em seções separadas (SPEC-20 aplicada à tela)", () => {
  it("a seção de processo edita `checklistProcesso` sem tocar no checklist técnico", async () => {
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByTestId("secao-processo")).toBeTruthy());
    fireEvent.click(screen.getByTestId("secao-processo"));

    expect(screen.getByDisplayValue("Levantar massa de teste")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Novo item"), { target: { value: "Pedir acesso ao broker de HLG" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Adicionar" }));

    await waitFor(() => expect(salvarMock).toHaveBeenCalled());
    const gravado = salvarMock.mock.calls.at(-1)![0];
    expect(gravado.porTech.Backend.checklistProcesso.map((i: { texto: string }) => i.texto)).toEqual([
      "Levantar massa de teste",
      "Pedir acesso ao broker de HLG",
    ]);
    expect(gravado.porTech.Backend.checklistTecnico).toHaveLength(2);
  });

  it("a seção de testes edita tipo, validação e os ambientes de cada ciclo", async () => {
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByTestId("secao-testes")).toBeTruthy());
    fireEvent.click(screen.getByTestId("secao-testes"));

    expect(screen.getByDisplayValue("unitário")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Teste 1 roda em hlg"));

    await waitFor(() => expect(salvarMock).toHaveBeenCalled());
    expect(salvarMock.mock.calls.at(-1)![0].porTech.Backend.testes[0]).toEqual({
      tipo: "unitário", validacao: "cobertura", contextos: [], dev: true, hlg: true,
    });
  });

  it("volumetria é um interruptor: desligar remove a chave, ligar devolve com os contextos", async () => {
    obterMock.mockResolvedValue({
      ...structuredClone(REGRAS),
      porTech: {
        Backend: {
          checklistTecnico: [],
          testes: [],
          volumetria: { contextos: ["Backend-http"] },
        },
      },
    });
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByTestId("secao-volumetria")).toBeTruthy());
    fireEvent.click(screen.getByTestId("secao-volumetria"));

    expect(screen.getByDisplayValue("Backend-http")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Exigir requisitos de volumetria"));

    await waitFor(() => expect(salvarMock).toHaveBeenCalled());
    expect(salvarMock.mock.calls.at(-1)![0].porTech.Backend.volumetria).toBeUndefined();
  });

  it("a sugestão de ciclo de teste entra com os ambientes que a IA indicou", async () => {
    sugerirConfigMock.mockResolvedValue({
      tipo: "Teste de contrato",
      validacao: "Payload bate com o schema acordado",
      contextos: ["Backend-mensagens"],
      dev: true,
      hlg: false,
    });
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByTestId("secao-testes")).toBeTruthy());
    fireEvent.click(screen.getByTestId("secao-testes"));

    fireEvent.change(screen.getByLabelText("Descreva o que a IA deve propor"), {
      target: { value: "algo que prove o contrato" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sugerir/ }));

    await waitFor(() => expect(salvarMock).toHaveBeenCalled());
    expect(salvarMock.mock.calls.at(-1)![0].porTech.Backend.testes.at(-1)).toEqual({
      tipo: "Teste de contrato",
      validacao: "Payload bate com o schema acordado",
      contextos: ["Backend-mensagens"],
      dev: true,
      hlg: false,
    });
  });
});
