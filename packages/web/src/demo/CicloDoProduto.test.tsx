import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CicloDoProduto } from "./CicloDoProduto";
import { ESTAGIOS_DO_CICLO, type EstagioDoCiclo } from "./ciclo";

/**
 * SPEC-84 fatia B — dois estágios inventados, para provar a MÁQUINA.
 *
 * Não são dados de demonstração: são o mínimo para a marca de ausência continuar
 * verificável depois que o ciclo real ficou todo verde. O dia em que um estágio
 * novo nascer incompleto, a garantia já está de pé — em vez de ter apodrecido
 * junto com a última linha vermelha.
 */
const FALTANDO: EstagioDoCiclo = {
  id: "inventado",
  fase: "entrega",
  titulo: "Um estágio que não existe",
  resumo: "existe só neste teste",
  detalhe: "o desdobramento de um estágio ausente",
  estado: "ausente",
  oQueFalta: "a porta ainda não foi construída",
};

const EXISTINDO: EstagioDoCiclo = {
  id: "real",
  fase: "entrega",
  titulo: "Um estágio que existe",
  resumo: "existe só neste teste",
  detalhe: "o desdobramento de um estágio completo",
  estado: "completo",
  rota: { tela: "canvas" },
};

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
    /**
     * Status vem com ícone e palavra, nunca com cor sozinha: quem não distingue
     * as cores tem que ler a mesma coisa. Vale para daltonismo, impressão e alto
     * contraste.
     *
     * ## Por que o estágio é fabricado aqui (SPEC-84 fatia B)
     *
     * A versão anterior fazia `ESTAGIOS_DO_CICLO.find(e => e.estado ===
     * "ausente")!` — e a SPEC-84 fechou o último buraco do ciclo, então o `!`
     * virou `undefined.id`. É a **segunda** vez: a SPEC-79 tinha feito o mesmo
     * com o último `parcial` (ver o teste abaixo).
     *
     * A lição, na terceira repetição, deixou de ser comentário: a máquina de
     * marcar o que falta tem que continuar provável **depois** que os dados
     * ficam todos verdes, senão a garantia some justamente quando ninguém está
     * olhando. É o §263 aplicado ao teste em vez de ao produto.
     */
    render(<CicloDoProduto estagios={[FALTANDO, EXISTINDO]} />);

    expect(screen.getByTestId("estagio-item-inventado")).toHaveTextContent("ainda não existe");
    expect(screen.getByTestId("estagio-item-real")).not.toHaveTextContent("ainda não existe");
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
    // Mesmo motivo do de cima: o ciclo real não tem mais buraco, e a máquina de
    // exibir o buraco precisa continuar provável para o dia em que tiver.
    render(<CicloDoProduto estagios={[FALTANDO, EXISTINDO]} />);

    fireEvent.click(screen.getByTestId("estagio-item-inventado"));

    expect(screen.getByTestId("estagio-detalhe-inventado")).toHaveTextContent("O que falta");
    expect(screen.getByTestId("estagio-detalhe-inventado")).toHaveTextContent("a porta ainda não foi construída");
  });

  it("estágio completo NÃO ganha a caixa de 'o que falta'", () => {
    // Marcar o que está certo é a definição de ruído, e a caixa vazia sugeriria
    // um buraco que não existe.
    render(<CicloDoProduto estagios={[FALTANDO, EXISTINDO]} />);

    fireEvent.click(screen.getByTestId("estagio-item-real"));

    expect(screen.getByTestId("estagio-detalhe-real")).not.toHaveTextContent("O que falta");
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
