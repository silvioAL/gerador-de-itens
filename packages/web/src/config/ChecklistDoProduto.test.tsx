import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChecklistDoProduto } from "./ChecklistDoProduto";
import { apiRegrasDoProduto } from "../api/client";

vi.mock("../api/client", () => ({
  apiRegrasDoProduto: { obter: vi.fn(), salvar: vi.fn() },
}));

/**
 * SPEC-86 fatia C — **a tela do checklist do produto.**
 *
 * A prova que importa mais neste arquivo é a última: o que a tela GRAVA. Todo o
 * resto é aparência; aquela é a diferença entre somar e congelar.
 */

const EM_VIGOR = {
  documento: {
    tipos: ["História"],
    tamanhos: ["P"],
    porTech: {
      Backend: {
        checklistTecnico: [
          { texto: "DLQ configurada", contextos: [] },
          { texto: "Acessibilidade AA", contextos: [] },
        ],
        testes: [],
      },
    },
  },
  origemDe: { "Backend|checklistTecnico|Acessibilidade AA": "produto" as const },
  doProduto: 1,
  declaradoNoProduto: {
    tipos: [],
    tamanhos: [],
    porTech: { Backend: { checklistTecnico: [{ texto: "Acessibilidade AA", contextos: [] }], testes: [] } },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiRegrasDoProduto.obter).mockResolvedValue(EM_VIGOR as never);
  vi.mocked(apiRegrasDoProduto.salvar).mockResolvedValue(undefined as never);
});

describe("o checklist do produto (SPEC-86 fatia C)", () => {
  it("mostra as regras do time e do produto NA MESMA lista, cada uma marcada", async () => {
    /**
     * Duas listas separadas obrigariam quem refina a juntá-las de cabeça para
     * saber o que vai ser cobrado — e essa soma o motor já faz. Mostrar separado
     * seria pedir à pessoa que refizesse a conta.
     */
    render(<ChecklistDoProduto produtoId="p1" timeId="t1" />);

    await waitFor(() => expect(screen.getByText("DLQ configurada")).toBeInTheDocument());
    expect(screen.getByText("Acessibilidade AA")).toBeInTheDocument();
    expect(screen.getAllByTestId("regra-time")).toHaveLength(1);
    expect(screen.getAllByTestId("regra-produto")).toHaveLength(1);
  });

  it("o que veio do time NÃO tem botão — editar regra de time é na tela do time", async () => {
    // A ausência do botão é o que comunica isso. Duas portas para o mesmo
    // arquivo é o §263, e a segunda sempre esquece uma validação da primeira.
    render(<ChecklistDoProduto produtoId="p1" timeId="t1" />);

    await waitFor(() => expect(screen.getByText("DLQ configurada")).toBeInTheDocument());
    expect(screen.queryByTestId("remover-DLQ configurada")).toBeNull();
    expect(screen.getByTestId("remover-Acessibilidade AA")).toBeInTheDocument();
  });

  it("GRAVA só o que é do produto — nunca a lista somada", async () => {
    /**
     * **A prova mais importante do arquivo.**
     *
     * Mandar a lista inteira (que inclui "DLQ configurada", do time) congelaria
     * o checklist da casa dentro do produto no primeiro clique — e o
     * congelamento seria invisível: a tela mostraria exatamente a mesma coisa no
     * dia seguinte, e só pararia de acompanhar as regras novas.
     *
     * É o defeito que o §306 mediu no `PipelineAgentesTab`, e a SPEC-86 existe
     * em boa parte para não repeti-lo.
     */
    render(<ChecklistDoProduto produtoId="p1" timeId="t1" />);
    await waitFor(() => expect(screen.getByText("DLQ configurada")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Novo item do checklist do produto"), {
      target: { value: "Conferir SEO" },
    });
    fireEvent.click(screen.getByTestId("checklist-produto-acrescentar"));

    await waitFor(() => expect(apiRegrasDoProduto.salvar).toHaveBeenCalled());
    const [, documento] = vi.mocked(apiRegrasDoProduto.salvar).mock.calls[0];
    const gravados = (documento as typeof EM_VIGOR.declaradoNoProduto).porTech.Backend.checklistTecnico;

    expect(gravados.map((i) => i.texto)).toEqual(["Acessibilidade AA", "Conferir SEO"]);
    expect(gravados.map((i) => i.texto)).not.toContain("DLQ configurada");
  });

  it("remover tira só o item do produto, e não toca no do time", async () => {
    render(<ChecklistDoProduto produtoId="p1" timeId="t1" />);
    await waitFor(() => expect(screen.getByTestId("remover-Acessibilidade AA")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("remover-Acessibilidade AA"));

    await waitFor(() => expect(apiRegrasDoProduto.salvar).toHaveBeenCalled());
    const [, documento] = vi.mocked(apiRegrasDoProduto.salvar).mock.calls[0];
    expect((documento as typeof EM_VIGOR.declaradoNoProduto).porTech.Backend.checklistTecnico).toEqual([]);
  });

  it("produto sem nada declarado DIZ que vale o checklist do time", async () => {
    // Estado legítimo e o mais comum. Uma lista sem explicação faria parecer que
    // não há regra nenhuma para este produto.
    vi.mocked(apiRegrasDoProduto.obter).mockResolvedValue({
      ...EM_VIGOR,
      origemDe: {},
      doProduto: 0,
      declaradoNoProduto: null,
    } as never);

    render(<ChecklistDoProduto produtoId="p1" timeId="t1" />);

    await waitFor(() =>
      expect(screen.getByTestId("checklist-produto-contagem")).toHaveTextContent("vale o checklist do time")
    );
  });

  it("a contagem diz que o resto EVOLUI com o time", async () => {
    // A frase existe para responder a pergunta que a tela provoca: "e se a casa
    // mudar a regra depois?". A resposta é que muda aqui também.
    render(<ChecklistDoProduto produtoId="p1" timeId="t1" />);

    await waitFor(() =>
      expect(screen.getByTestId("checklist-produto-contagem")).toHaveTextContent("evolui com ele")
    );
  });

  it("falha de leitura vira mensagem, não tela em branco", async () => {
    vi.mocked(apiRegrasDoProduto.obter).mockRejectedValue(new Error("servidor fora"));

    render(<ChecklistDoProduto produtoId="p1" timeId="t1" />);

    await waitFor(() => expect(screen.getByTestId("checklist-produto-erro")).toHaveTextContent("servidor fora"));
  });
});
