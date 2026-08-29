import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Atividade, CoberturaDaSpec } from "@gerador/engine";
import { SpecScreen } from "./SpecScreen";

/**
 * SPEC-84 fatia A — **a porta da spec, do lado da tela.**
 *
 * O motor já tinha teste desde o §315. O que não existia era o caminho entre ele
 * e uma pessoa, e é isso que estas provas guardam.
 */

function atividade(chave: string, rotulo = chave): Atividade {
  return { chave, rotulo, nodeId: "n1", tipo: "service" } as unknown as Atividade;
}

function tela(extras: Partial<Parameters<typeof SpecScreen>[0]> = {}) {
  const props = {
    titulo: "Vitrine que aguenta o pico",
    markdown: "# Vitrine\n\n_(quem pediu, e com que palavras)_ <- ✍️ especificar\n",
    escrita: {},
    onMudarEscrita: vi.fn(),
    cobertura: { cobertas: [], descobertas: [], orfas: [] } as CoberturaDaSpec,
    onAlternarItem: vi.fn(),
    lacunas: 3,
    onBaixarMarkdown: vi.fn(),
    onVoltar: vi.fn(),
    ...extras,
  };
  render(<SpecScreen {...props} />);
  return props;
}

describe("a tela da spec (SPEC-84 fatia A)", () => {
  it("NÃO oferece escrever as seções de julgamento com IA", () => {
    /**
     * A prova mais importante do arquivo, e a razão de ela ser um teste e não um
     * comentário: a SPEC-80 fatia D trava o motor, mas nada impediria uma tela de
     * chamar `/ia/sugerir` e colar o resultado em `origem`. O botão que não existe
     * é o que mantém a trava de pé.
     */
    tela({ escrita: {} });

    // `✦` é a marca de "isto foi a IA" em todo o produto — se aparecer aqui, é
    // porque alguém acoplou um modelo às seções de julgamento.
    expect(screen.queryByText(/✦/)).toBeNull();
    // O padrão evita `/ia/i` solto de propósito: ele casaria com "fatia", e um
    // teste que falha pelo motivo errado é pior que teste nenhum.
    expect(screen.queryByRole("button", { name: /escrever para mim|sugerir|gerar com a? ?IA|preencher com/i })).toBeNull();
  });

  it("as três seções de julgamento aparecem, e cada uma diz POR QUE está sendo perguntada", () => {
    tela();

    for (const testid of ["secao-origem", "secao-recusas", "secao-fatias"]) {
      expect(screen.getByTestId(testid)).toBeInTheDocument();
    }
    // O porquê ao lado da pergunta, não num tour: quem abre pela primeira vez
    // precisa saber o que está sendo pedido antes de escrever.
    expect(screen.getByText(/recusar é decidir/)).toBeInTheDocument();
    expect(screen.getByText(/Fatia sem prova é intenção/)).toBeInTheDocument();
  });

  it("escrever numa seção avisa quem chama, sem perder as outras", () => {
    // O `...escrita` importa: um `onMudar` que mandasse só o campo editado
    // apagaria os outros dois a cada tecla.
    const { onMudarEscrita } = tela({ escrita: { recusas: "não entra relatório" } });

    fireEvent.click(screen.getByRole("button", { name: /quem pediu/ }));
    fireEvent.change(screen.getByLabelText("De onde veio"), { target: { value: "a Ana, no comitê" } });

    expect(onMudarEscrita).toHaveBeenCalledWith({ recusas: "não entra relatório", origem: "a Ana, no comitê" });
  });

  it("a conta de lacunas fica no CABEÇALHO — antes do clique de baixar", () => {
    // Quem vai dar esta spec a um agente precisa ver o número antes, não depois.
    tela({ lacunas: 3 });

    expect(screen.getByTestId("lacunas-da-spec")).toHaveTextContent("3 a especificar");
  });

  it("spec sem lacuna diz isso, em vez de mostrar zero", () => {
    tela({ lacunas: 0 });

    expect(screen.getByTestId("lacunas-da-spec")).toHaveTextContent("nenhuma lacuna");
  });

  it("cobrir e descobrir um item são o MESMO gesto", () => {
    /**
     * Dois botões duplicariam a regra de "o que já está lá" em dois lugares, e a
     * lista de cobertos é um conjunto — entrar e sair dele é a mesma operação.
     */
    const { onAlternarItem } = tela({
      cobertura: { cobertas: [atividade("a", "Criar a fila")], descobertas: [atividade("b", "Publicar o evento")], orfas: [] },
    });

    expect(screen.getByLabelText("Criar a fila")).toBeChecked();
    expect(screen.getByLabelText("Publicar o evento")).not.toBeChecked();

    fireEvent.click(screen.getByLabelText("Criar a fila"));
    expect(onAlternarItem).toHaveBeenCalledWith("a");
  });

  it("o item ÓRFÃO aparece — é o que envelhece pior e ninguém pensa em olhar", () => {
    /**
     * A spec continua parecendo completa enquanto aponta para item que não existe
     * mais no desenho. Esconder a órfã seria deixar a spec mentir em silêncio.
     */
    tela({ cobertura: { cobertas: [], descobertas: [], orfas: ["item-que-sumiu"] } });

    expect(screen.getByTestId("itens-orfaos")).toHaveTextContent("item-que-sumiu");
    expect(screen.getByTestId("itens-orfaos")).toHaveTextContent("não existem mais no desenho");
  });

  it("sem órfã, a caixa das órfãs não aparece", () => {
    tela({ cobertura: { cobertas: [atividade("a")], descobertas: [], orfas: [] } });

    expect(screen.queryByTestId("itens-orfaos")).toBeNull();
  });

  it("demanda sem item derivado diz isso, em vez de lista vazia sem explicação", () => {
    tela();

    expect(screen.getByTestId("cobertura-da-spec")).toHaveTextContent("ainda não derivou itens");
  });

  it("o markdown na tela é o MESMO que o botão baixa", () => {
    // Duas montagens fariam o arquivo divergir do que a pessoa leu antes de
    // baixar — e ela não teria como notar.
    const { onBaixarMarkdown, markdown } = tela();

    expect(screen.getByTestId("spec-markdown")).toHaveTextContent("quem pediu, e com que palavras");
    expect(markdown).toContain("quem pediu");
    fireEvent.click(screen.getByTestId("baixar-spec"));
    expect(onBaixarMarkdown).toHaveBeenCalled();
  });
});
