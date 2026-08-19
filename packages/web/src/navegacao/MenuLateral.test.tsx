import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MenuLateral } from "./MenuLateral";

function montar(extras: Partial<Parameters<typeof MenuLateral>[0]> = {}) {
  const props = {
    aberto: true,
    onFechar: vi.fn(),
    timeAtivo: "time-pagamentos",
    timeIds: ["time-pagamentos", "time-portabilidade"],
    email: "dev@gerador.local",
    onTrocarTime: vi.fn(),
    onNavegar: vi.fn(),
    onNovaQuebra: vi.fn(),
    onAbrirQuebras: vi.fn(),
    onItens: vi.fn(),
    onDocumento: vi.fn(),
    onSistema: vi.fn(),
    onSair: vi.fn(),
    ...extras,
  };
  render(<MenuLateral {...props} />);
  return props;
}

describe("MenuLateral (SPEC-40 F1 — gestão no menu, frequência no header)", () => {
  it("agrupa por intenção: Demanda, Padrões do time, Pessoas & acesso, IA — e o rodapé de sessão", () => {
    montar();
    for (const grupo of ["Demanda", "Padrões do time", "Pessoas & acesso", "IA"]) {
      expect(screen.getByText(grupo)).toBeInTheDocument();
    }
    expect(screen.getByText("dev@gerador.local")).toBeInTheDocument();
    // §273 — o rodapé mostra o time ATIVO; a lista só aparece a pedido.
    expect(screen.getByTestId("time-ativo")).toHaveTextContent("time-pagamentos");
  });

  it("clicar num item navega pra ÁREA certa e fecha o menu", () => {
    const props = montar();
    fireEvent.click(screen.getByRole("button", { name: "Membros" }));
    expect(props.onNavegar).toHaveBeenCalledWith("membros");
    expect(props.onFechar).toHaveBeenCalled();

    montar().onNavegar; // segunda instância pra outro item
    const props2 = montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Modelo de IA" }).at(-1)!);
    expect(props2.onNavegar).toHaveBeenCalledWith("modeloIa");
  });

  it("fechado, não existe no DOM (overlay some de verdade)", () => {
    montar({ aberto: false });
    expect(screen.queryByTestId("menu-lateral")).not.toBeInTheDocument();
  });
});

describe("MenuLateral — time não é stack (SPEC-42/43)", () => {
  it("o seletor chama-se só 'Time', sem parêntese de stack nem linha de 'stack do time' (SPEC-43)", () => {
    montar();
    expect(screen.getByLabelText("Time")).toBeInTheDocument();
    expect(screen.queryByText(/stack conhecida\)/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("stack-do-time-menu")).not.toBeInTheDocument();
    // O ITEM de navegação "Stacks conhecidas" existe — é o catálogo, não o time.
    expect(screen.getByRole("button", { name: "Stacks conhecidas" })).toBeInTheDocument();
  });
});

/**
 * §221 — o menu passou a OCULTAR o que a pessoa não edita, em vez de mostrar
 * com cadeado (SPEC-51). O menu é a lista do que se administra; listar o que
 * não se administra é ruído em toda abertura.
 */
describe("MenuLateral — o que ela não edita não aparece (§221)", () => {
  it("área sem permissão SOME do menu, e nada de cadeado sobra", () => {
    montar({ podeEditarArea: (area) => area !== "modeloIa" });

    expect(screen.queryByRole("button", { name: /Modelo de IA/ })).not.toBeInTheDocument();
    // O que ela edita continua ali, sem enfeite nenhum.
    const permitido = screen.getByRole("button", { name: "Membros" });
    expect(permitido).toBeInTheDocument();
    expect(permitido.textContent).not.toContain("🔒");
    // O cadeado saiu do componente inteiro, não só do item negado.
    expect(screen.queryByText("🔒")).not.toBeInTheDocument();
    expect(document.querySelector("[data-bloqueada]")).toBeNull();
  });

  it("grupo que fica sem item nenhum não deixa o TÍTULO órfão", () => {
    // "Produto" tem um item só: negá-lo esvazia o grupo. Sem o filtro no
    // nível do grupo, sobraria um cabeçalho apontando para o nada.
    montar({ podeEditarArea: (area) => area !== "produtos" });

    expect(screen.queryByRole("button", { name: "Contexto do produto" })).not.toBeInTheDocument();
    expect(screen.queryByText("Produto")).not.toBeInTheDocument();
    // Grupo vizinho, que perdeu nenhum item, segue inteiro com seu título.
    expect(screen.getByText("Pessoas & acesso")).toBeInTheDocument();
  });

  it("sem a função de permissão (modo sem RBAC), o menu inteiro aparece", () => {
    montar();
    expect(screen.getByRole("button", { name: "Contexto do produto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Modelo de IA/ })).toBeInTheDocument();
    expect(screen.queryByText("🔒")).not.toBeInTheDocument();
  });
});

/**
 * §273 — o seletor que não escalava.
 */
describe("MenuLateral — trocar de time com muitos times", () => {
  const SESSENTA = Array.from({ length: 60 }, (_, i) => `time-${String(i).padStart(2, "0")}`);

  it("a lista NÃO fica aberta: o rodapé mostra o ativo e nada mais", () => {
    // Sessenta itens abertos no rodapé empurram o resto do menu para fora — é
    // o defeito original com outra roupa.
    montar({ timeIds: SESSENTA, timeAtivo: "time-07" });

    expect(screen.getByTestId("time-ativo")).toHaveTextContent("time-07");
    expect(screen.queryByTestId("lista-de-times")).toBeNull();
  });

  it("abrir dá busca, e escolher troca o time", () => {
    const { onTrocarTime } = montar({ timeIds: SESSENTA, timeAtivo: "time-07" });

    fireEvent.click(screen.getByTestId("time-ativo"));
    fireEvent.change(screen.getByLabelText("Buscar time"), { target: { value: "42" } });
    fireEvent.click(screen.getByTestId("time-time-42"));

    expect(onTrocarTime).toHaveBeenCalledWith("time-42");
    // E fecha: a lista cumpriu o que tinha a fazer.
    expect(screen.queryByTestId("lista-de-times")).toBeNull();
  });

  it("com um time só não oferece troca — não há para onde ir", () => {
    montar({ timeIds: ["time-silvio"], timeAtivo: "time-silvio" });

    fireEvent.click(screen.getByTestId("time-ativo"));
    expect(screen.queryByTestId("lista-de-times")).toBeNull();
  });
});
