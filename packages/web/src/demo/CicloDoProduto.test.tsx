import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CicloDoProduto } from "./CicloDoProduto";
import { ESTAGIOS_DO_CICLO } from "./ciclo";

/**
 * SPEC-76 fatias B e C — a página que explica o ciclo.
 *
 * A régua: **a página não pode prometer o que o produto não faz.** Ela é a
 * mesma que o produto cobra lá dentro, e violá-la na porta de entrada seria o
 * pior lugar possível.
 */
describe("CicloDoProduto (SPEC-76)", () => {
  it("mostra todos os estágios, inclusive os que ainda não existem", () => {
    render(<CicloDoProduto />);

    for (const estagio of ESTAGIOS_DO_CICLO) {
      expect(screen.getByTestId(`estagio-item-${estagio.id}`)).toBeInTheDocument();
    }
  });

  it("o que não existe vem MARCADO — e a marca é palavra, não só cor", () => {
    // Status vem com ícone e palavra, nunca com cor sozinha: quem não distingue
    // as cores tem que ler a mesma coisa. Vale para daltonismo, impressão e
    // alto contraste.
    render(<CicloDoProduto />);
    const ausente = ESTAGIOS_DO_CICLO.find((e) => e.estado === "ausente")!;

    expect(screen.getByTestId(`estagio-item-${ausente.id}`)).toHaveTextContent("ainda não existe");
  });

  it("todo estágio incompleto diz o que é, e o completo não vira ruído", () => {
    /**
     * **Reescrito na SPEC-79, e o motivo é o próprio produto avançando.**
     *
     * A versão anterior fazia `find((e) => e.estado === "parcial")!` e assumia
     * que sempre existiria um. A SPEC-79 zerou o único que havia (`padroes`), e
     * o `!` virou `undefined.id` — teste vermelho por acerto, não por defeito.
     *
     * A versão nova não depende de QUAL estado ocorre nos dados: ela cobra a
     * mecânica. Todo estágio não-completo carrega a sua palavra; nenhum completo
     * carrega marca. Isso continua valendo no dia em que um `parcial` voltar — e
     * a SPEC-83 §4 explica por que a máquina não se apaga quando as marcas ficam
     * todas iguais.
     */
    render(<CicloDoProduto />);

    const incompletos = ESTAGIOS_DO_CICLO.filter((e) => e.estado !== "completo");
    for (const estagio of incompletos) {
      const palavra = estagio.estado === "parcial" ? "parcial" : "não existe";
      expect(screen.getByTestId(`estagio-item-${estagio.id}`)).toHaveTextContent(palavra);
    }

    // Marcar o que está certo é a definição de ruído — e ruído se aprende a
    // ignorar, junto com o que importava.
    for (const estagio of ESTAGIOS_DO_CICLO.filter((e) => e.estado === "completo")) {
      expect(screen.getByTestId(`estagio-item-${estagio.id}`)).not.toHaveTextContent("existe");
    }
  });

  it("clicar num estágio abre o desdobramento; clicar de novo fecha", () => {
    render(<CicloDoProduto />);
    const alvo = ESTAGIOS_DO_CICLO[0];

    fireEvent.click(screen.getByTestId(`estagio-item-${alvo.id}`));
    expect(screen.getByTestId(`estagio-detalhe-${alvo.id}`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`estagio-item-${alvo.id}`));
    expect(screen.queryByTestId(`estagio-detalhe-${alvo.id}`)).toBeNull();
  });

  it("o desdobramento do que falta DIZ o que falta", () => {
    render(<CicloDoProduto />);
    const ausente = ESTAGIOS_DO_CICLO.find((e) => e.estado === "ausente")!;

    fireEvent.click(screen.getByTestId(`estagio-item-${ausente.id}`));

    expect(screen.getByTestId(`estagio-detalhe-${ausente.id}`)).toHaveTextContent("O que falta");
  });

  it("a contagem sai do dado — prosa continuaria mentindo depois da próxima entrega", () => {
    render(<CicloDoProduto />);
    const existem = ESTAGIOS_DO_CICLO.filter((e) => e.estado !== "ausente").length;

    expect(screen.getByTestId("ciclo-contagem")).toHaveTextContent(
      `${existem} dos ${ESTAGIOS_DO_CICLO.length} estágios existem hoje`
    );
  });

  it("o centro diz a tese: a IA propõe e não aplica sozinha", () => {
    // É a coisa mais difícil de comunicar, porque é uma AUSÊNCIA de
    // comportamento — e é o que separa isto de um gerador.
    render(<CicloDoProduto />);

    expect(screen.getByTestId("ciclo-do-produto")).toHaveTextContent("propõe, nunca");
    expect(screen.getByTestId("ciclo-do-produto")).toHaveTextContent("aplica sozinha");
  });
});
