import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PainelDaAnalise } from "./PainelDaAnalise";
import type { MetricasDoCiclo } from "../api/client";

/**
 * SPEC-94 fatia Z — o painel da análise crítica.
 *
 * O que estes casos guardam é uma régua de honestidade, não de layout: **um
 * conjunto vazio não pode parecer um resultado bom.** É a mesma disciplina da
 * lacuna contável — o que não se sabe aparece como não sabido.
 */

function metricas(p: Partial<MetricasDoCiclo> = {}): MetricasDoCiclo {
  return {
    solicitacoes: 0,
    porEstado: {},
    horasAteDecisaoMediana: null,
    pendentes: 0,
    diasDaEsperaMaisVelha: null,
    taxaDeInvalidacao: null,
    rejeitadasSemMotivo: 0,
    concentracaoPorRecurso: [],
    feedback: { total: 0, porEstado: {}, conversaoEmAjuste: null, sinalQueMorre: 0 },
    ...p,
  };
}

describe("o painel da análise (SPEC-94 fatia Z)", () => {
  it("sem métricas nenhumas, não renderiza nada — falhar em medir não é medir zero", () => {
    // `null` chega quando a chamada falhou. Desenhar um painel zerado nesse caso
    // afirmaria sobre um ciclo que ninguém conseguiu ler.
    const { container } = render(<PainelDaAnalise metricas={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("com o ciclo vazio, diz que não há o que medir — e não mostra 0%", () => {
    render(<PainelDaAnalise metricas={metricas()} />);

    expect(screen.getByTestId("analise-sem-dado").textContent).toMatch(/ainda não há o que medir/i);
    expect(screen.queryByTestId("medida-invalidacao")).toBeNull();
  });

  it("`null` numa medida vira 'ainda não há', nunca zero", () => {
    /**
     * **O caso que esta suíte existe para guardar.** Um ciclo com pedidos ainda
     * não decididos tem `taxaDeInvalidacao: null` — e `0%` de invalidação ali
     * leria como "está tudo ótimo" sobre um conjunto onde ninguém decidiu nada.
     */
    render(<PainelDaAnalise metricas={metricas({ solicitacoes: 3, pendentes: 3, diasDaEsperaMaisVelha: 12 })} />);

    expect(screen.getByTestId("medida-invalidacao").textContent).toMatch(/ainda não há/i);
    expect(screen.getByTestId("medida-invalidacao").textContent).not.toMatch(/0%/);
    expect(screen.getByTestId("medida-tempo-decisao").textContent).toMatch(/ainda não há/i);
  });

  it("mostra a fila e há quanto tempo espera a mais velha", () => {
    render(<PainelDaAnalise metricas={metricas({ solicitacoes: 2, pendentes: 2, diasDaEsperaMaisVelha: 45 })} />);

    const cartao = screen.getByTestId("medida-pendentes");
    expect(cartao.textContent).toContain("2");
    expect(cartao.textContent).toMatch(/45 dias/);
  });

  it("**a métrica que vale contra nós** aparece em destaque, e diz o que fazer", () => {
    /**
     * O produto interrompe quem trabalha a cada N gerações para coletar. Se o
     * que ele coleta apodrece, há duas saídas honestas — responder ou parar de
     * perguntar — e o texto precisa dizer as duas. Esconder isto num rodapé
     * seria coletar sinal e sonegar o resultado a quem o deu.
     */
    render(
      <PainelDaAnalise
        metricas={metricas({ feedback: { total: 9, porEstado: { novo: 7 }, conversaoEmAjuste: 0.1, sinalQueMorre: 7 } })}
      />,
    );

    const aviso = screen.getByTestId("sinal-que-morre");
    expect(aviso.textContent).toContain("7");
    expect(aviso.textContent).toMatch(/parar de perguntar/i);
  });

  it("e some quando não há sinal parado — marcar o que está certo é ruído", () => {
    render(
      <PainelDaAnalise
        metricas={metricas({ feedback: { total: 4, porEstado: {}, conversaoEmAjuste: 0.5, sinalQueMorre: 0 } })}
      />,
    );

    expect(screen.queryByTestId("sinal-que-morre")).toBeNull();
  });

  it("ordena os recursos pelo que mais gera pedido — é por aí que a análise começa", () => {
    render(
      <PainelDaAnalise
        metricas={metricas({
          solicitacoes: 6,
          concentracaoPorRecurso: [
            { recurso: "regras", total: 4 },
            { recurso: "campos-no", total: 2 },
          ],
        })}
      />,
    );

    const lista = screen.getByTestId("concentracao-por-recurso");
    expect(lista.textContent).toMatch(/o que mais gera pedido é o que menos serve/i);
    const itens = [...lista.querySelectorAll('[data-testid^="recurso-"]')].map((e) => e.getAttribute("data-testid"));
    expect(itens).toEqual(["recurso-regras", "recurso-campos-no"]);
  });

  it("conta recusa sem motivo sem chamá-la de erro — é assunto, não violação", () => {
    // A SPEC-62 deixou o motivo opcional de propósito. O painel informa; não
    // cobra.
    render(<PainelDaAnalise metricas={metricas({ solicitacoes: 3, rejeitadasSemMotivo: 2 })} />);

    expect(screen.getByTestId("rejeitadas-sem-motivo").textContent).toMatch(/não é obrigatório/i);
  });

  it("horas viram dias quando a espera passa de dois — 72 h é aritmética, 3 dias é resposta", () => {
    render(<PainelDaAnalise metricas={metricas({ solicitacoes: 1, horasAteDecisaoMediana: 72 })} />);
    expect(screen.getByTestId("medida-tempo-decisao").textContent).toMatch(/3 dias/);

    render(<PainelDaAnalise metricas={metricas({ solicitacoes: 1, horasAteDecisaoMediana: 6 })} />);
    expect(screen.getAllByTestId("medida-tempo-decisao").at(-1)!.textContent).toMatch(/6 h/);
  });

  it("decisão instantânea diz 'menos de 1 h' — zero é o número certo e a palavra errada", () => {
    /**
     * Achado na stack real: a tela mostrou **"0 h"**. É verdade — pedidos
     * decididos no mesmo instante em que nasceram —, e lê como defeito. O
     * número não estava errado; a forma de dizê-lo estava.
     */
    render(<PainelDaAnalise metricas={metricas({ solicitacoes: 4, horasAteDecisaoMediana: 0 })} />);

    const cartao = screen.getByTestId("medida-tempo-decisao");
    expect(cartao.textContent).toMatch(/menos de 1 h/);
    expect(cartao.textContent).not.toMatch(/\b0 h\b/);
  });
});
