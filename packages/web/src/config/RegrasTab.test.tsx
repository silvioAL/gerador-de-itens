import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RegrasTab } from "./RegrasTab";

/** As techs agora aparecem EMPILHADAS (o seletor "Tecnologia" saiu — achado do
 * usuário: "nem precisaria existir essa label; nós temos padrão por
 * componente"). Com dois grupos na tela, os gestos são escopados pelo grupo. */
const grupo = (tech: string) => within(screen.getByTestId(`regras-grupo-${tech}`));

const obterMock = vi.hoisted(() => vi.fn());

/** SPEC-31 Fase 3: a aba passou a pedir o envelope (documento + diagnóstico)
 * em vez do documento cru — é o que permite avisar sobre config de outra era.
 * O helper embrulha o documento com um diagnóstico "tudo em dia". */
const semAviso = (documento: unknown) => ({
  documento,
  personalizado: true,
  versaoTemplate: null,
  atualizadoEm: null,
  diagnostico: {
    chave: "regras",
    atual: {},
    template: {},
    secoesVazias: [],
    possivelmenteDesatualizada: false,
    mensagem: null,
  },
});
const salvarMock = vi.hoisted(() => vi.fn());
const sugerirConfigMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiRegras: { obterComDiagnostico: obterMock, salvar: salvarMock },
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
  obterMock.mockResolvedValue(semAviso(structuredClone(REGRAS)));
  salvarMock.mockResolvedValue(undefined);
});

describe("RegrasTab (SPEC-23 fluxo 5 — regras.json ganha tela)", () => {
  /**
   * SPEC-31 Fase 3 — o aviso do JOURNEY §108 chegando à tela. A ferramenta
   * nunca sobrescreve a config; o que ela passou a fazer é nomear a seção que
   * ficou vazia porque nasceu depois do arquivo do usuário.
   */
  it("avisa quando a config é de uma versão anterior — e não avisa quando está em dia", async () => {
    obterMock.mockResolvedValue({
      ...semAviso(structuredClone(REGRAS)),
      diagnostico: {
        chave: "regras",
        atual: { checklistTecnico: 0, testes: 12 },
        template: { checklistTecnico: 32, testes: 19 },
        secoesVazias: [{ secao: "checklistTecnico", noTemplate: 32 }],
        possivelmenteDesatualizada: true,
        mensagem: "A sua configuração de \"regras\" não tem nenhuma entrada de checklist técnico (32 no padrão desta versão).",
      },
    });

    render(<RegrasTab />);

    const aviso = await screen.findByTestId("aviso-config-desatualizada");
    expect(aviso.textContent).toContain("checklist técnico (32 no padrão desta versão)");
  });

  it("config em dia não mostra aviso nenhum", async () => {
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByTestId("secao-volumetria")).toBeTruthy());

    expect(screen.queryByTestId("aviso-config-desatualizada")).toBeNull();
  });

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
    await waitFor(() => expect(screen.getByTestId("regras-grupo-Backend")).toBeTruthy());

    fireEvent.change(grupo("Backend").getByLabelText("Novo item"), {
      target: { value: "Definir a chave de idempotência da mensagem" },
    });
    fireEvent.change(grupo("Backend").getByLabelText("Contextos do novo item"), {
      target: { value: "Backend-mensagens" },
    });
    fireEvent.click(grupo("Backend").getByRole("button", { name: "+ Adicionar" }));

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
    await waitFor(() => expect(screen.getByTestId("regras-grupo-Backend")).toBeTruthy());

    fireEvent.change(grupo("Backend").getByLabelText("Descreva o que a IA deve propor"), {
      target: { value: "algo sobre duplicidade de mensagem" },
    });
    fireEvent.click(grupo("Backend").getByRole("button", { name: /Sugerir/ }));

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

  it("o menu de contexto de um grupo só oferece os contextos DAQUELA tech", async () => {
    obterMock.mockResolvedValue(
      semAviso({
        tipos: [],
        tamanhos: [],
        porTech: {
          Backend: { checklistTecnico: [{ texto: "Definir retry", contextos: [] }], testes: [] },
          Mobile: { checklistTecnico: [{ texto: "Definir offline", contextos: [] }], testes: [] },
        },
      })
    );
    render(
      <RegrasTab contextos={["Backend-http", "Backend-dados", "Mobile-android", "Mobile-ios"]} />
    );
    await waitFor(() => expect(screen.getByTestId("regras-grupo-Mobile")).toBeTruthy());

    // "Backend-dados" numa regra Mobile nunca casaria com item nenhum — era o
    // que fazia o eixo de tech parecer redundante ao lado do contexto.
    fireEvent.click(grupo("Mobile").getByRole("button", { name: "Contextos do item 1: adicionar" }));
    const opcoes = grupo("Mobile")
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opcoes).toEqual(["Mobile-android", "Mobile-ios"]);
  });

  it("as techs aparecem empilhadas, sem seletor — agrupamento se lê, seletor se opera", async () => {
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByTestId("regras-grupo-Backend")).toBeTruthy());

    // O grupo da outra tech está na MESMA tela, sem nenhum gesto de troca.
    expect(screen.getByTestId("regras-grupo-Frontend")).toBeTruthy();
    expect(grupo("Frontend").getByText("Nada configurado para esta tecnologia ainda.")).toBeTruthy();
    // E o seletor não existe mais — devolver o select seria devolver o problema.
    expect(screen.queryByLabelText("Tecnologia")).toBeNull();
  });
});

describe("RegrasTab — as quatro listas em seções separadas (SPEC-20 aplicada à tela)", () => {
  it("a seção de processo edita `checklistProcesso` sem tocar no checklist técnico", async () => {
    render(<RegrasTab />);
    await waitFor(() => expect(screen.getByTestId("secao-processo")).toBeTruthy());
    fireEvent.click(screen.getByTestId("secao-processo"));

    expect(screen.getByDisplayValue("Levantar massa de teste")).toBeTruthy();
    fireEvent.change(grupo("Backend").getByLabelText("Novo item"), { target: { value: "Pedir acesso ao broker de HLG" } });
    fireEvent.click(grupo("Backend").getByRole("button", { name: "+ Adicionar" }));

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
    obterMock.mockResolvedValue(semAviso({
      ...structuredClone(REGRAS),
      porTech: {
        Backend: {
          checklistTecnico: [],
          testes: [],
          volumetria: { contextos: ["Backend-http"] },
        },
      },
    }));
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

    fireEvent.change(grupo("Backend").getByLabelText("Descreva o que a IA deve propor"), {
      target: { value: "algo que prove o contrato" },
    });
    fireEvent.click(grupo("Backend").getByRole("button", { name: /Sugerir/ }));

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
