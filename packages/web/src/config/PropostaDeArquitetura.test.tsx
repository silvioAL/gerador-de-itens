import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PainelDeProposta } from "./PropostaDeArquitetura";

/**
 * SPEC-81 fatia F, do lado da tela — **aceitar é por campo, e custa um olhar.**
 */

function painel(proposta: Parameters<typeof PainelDeProposta>[0]["proposta"], extras = {}) {
  const onAceitarCampo = vi.fn();
  const onAceitarTermo = vi.fn();
  render(
    <PainelDeProposta
      proposta={proposta}
      origem="Confluence de Arquitetura"
      onAceitarCampo={onAceitarCampo}
      onAceitarTermo={onAceitarTermo}
      onFechar={vi.fn()}
      {...extras}
    />
  );
  return { onAceitarCampo, onAceitarTermo };
}

describe("o painel da proposta (SPEC-81 fatia F)", () => {
  it("campo `novo` mostra só o lado de lá — não há o que comparar", () => {
    // Repetir "(vazio)" para o lado de cá seria ruído: a pessoa já sabe que
    // está vazio, é por isso que a linha aparece.
    painel({ campos: [{ campo: "objetivo", atual: "", proposto: "Vender no atacado", situacao: "novo" }], termosNovos: [] });

    expect(screen.getByTestId("campo-objetivo")).toHaveTextContent("está vazio aqui");
    expect(screen.getByTestId("campo-objetivo")).toHaveTextContent("Vender no atacado");
    expect(screen.getByTestId("aceitar-objetivo")).toHaveTextContent("trazer");
  });

  it("campo `diverge` mostra OS DOIS lados, e o botão diz que substitui", () => {
    /**
     * A única situação em que existe algo a perder. É onde a régua do §306 vale:
     * declarado vence herdado, **e a tela diz qual é qual** — em vez de escolher
     * por quem lê.
     */
    painel({
      campos: [{ campo: "restricoes", atual: "LGPD, revisada em 2025", proposto: "LGPD e PCI-DSS", situacao: "diverge" }],
      termosNovos: [],
    });

    const linha = screen.getByTestId("campo-restricoes");
    expect(linha).toHaveTextContent("diverge do que está aqui");
    expect(linha).toHaveTextContent("LGPD, revisada em 2025");
    expect(linha).toHaveTextContent("LGPD e PCI-DSS");
    expect(screen.getByTestId("aceitar-restricoes")).toHaveTextContent("substituir pelo de lá");
  });

  it("campo `igual` NÃO aparece — não há decisão a tomar", () => {
    // Pedir decisão sobre o que não muda é a definição de ruído, e ruído se
    // aprende a ignorar junto com o que importava.
    painel({ campos: [{ campo: "objetivo", atual: "x", proposto: "x", situacao: "igual" }], termosNovos: [] });

    expect(screen.queryByTestId("campo-objetivo")).toBeNull();
    expect(screen.getByTestId("proposta-de-arquitetura")).toHaveTextContent("Nada a trazer");
  });

  it("não existe “aceitar tudo” — cada campo é uma decisão", () => {
    /**
     * Um botão único transformaria a importação num `overwrite` com passo extra:
     * a pessoa clicaria sem ler, e o texto que alguém desta casa escreveu
     * sumiria sem ninguém notar.
     */
    painel({
      campos: [
        { campo: "objetivo", atual: "", proposto: "a", situacao: "novo" },
        { campo: "sistemas", atual: "b", proposto: "c", situacao: "diverge" },
      ],
      termosNovos: [],
    });

    expect(screen.getAllByRole("button", { name: /trazer|substituir/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /tudo/i })).toBeNull();
  });

  it("aceitar avisa quem chamou, e o botão trava — dois cliques não são duas decisões", () => {
    const { onAceitarCampo } = painel({
      campos: [{ campo: "objetivo", atual: "", proposto: "Vender", situacao: "novo" }],
      termosNovos: [],
    });

    fireEvent.click(screen.getByTestId("aceitar-objetivo"));

    expect(onAceitarCampo).toHaveBeenCalledWith(expect.objectContaining({ campo: "objetivo", proposto: "Vender" }));
    expect(screen.getByTestId("aceitar-objetivo")).toBeDisabled();
    expect(screen.getByTestId("aceitar-objetivo")).toHaveTextContent("aceito");
  });

  it("a contagem desce conforme se decide", () => {
    painel({
      campos: [
        { campo: "objetivo", atual: "", proposto: "a", situacao: "novo" },
        { campo: "sistemas", atual: "", proposto: "b", situacao: "novo" },
      ],
      termosNovos: [],
    });

    expect(screen.getByTestId("proposta-de-arquitetura")).toHaveTextContent("2 a decidir");
    fireEvent.click(screen.getByTestId("aceitar-objetivo"));
    expect(screen.getByTestId("proposta-de-arquitetura")).toHaveTextContent("1 a decidir");
  });

  it("termos novos entram um a um, e dizem a definição antes de serem aceitos", () => {
    // Trazer um termo muda o sentido do que a IA escreve daí em diante — a
    // definição precisa estar visível ANTES do clique, não depois.
    const { onAceitarTermo } = painel({
      campos: [],
      termosNovos: [{ termo: "Bureau", definicao: "quem responde pelo score" }],
    });

    expect(screen.getByTestId("termo-Bureau")).toHaveTextContent("quem responde pelo score");
    fireEvent.click(screen.getByTestId("aceitar-termo-Bureau"));

    expect(onAceitarTermo).toHaveBeenCalledWith({ termo: "Bureau", definicao: "quem responde pelo score" });
  });

  it("diz DE ONDE veio — proposta sem origem é proposta em que não dá para confiar", () => {
    painel({ campos: [], termosNovos: [] });

    expect(screen.getByTestId("proposta-de-arquitetura")).toHaveTextContent("Confluence de Arquitetura");
  });
});
