import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LeituraDoDesenho } from "@gerador/engine";
import { LeituraDoDesenhoPanel } from "./LeituraDoDesenhoPanel";

function leitura(parcial: Partial<LeituraDoDesenho> = {}): LeituraDoDesenho {
  return {
    tempos: [],
    fanOut: [],
    terceiros: [],
    conexoesNaoClassificadas: [],
    ...parcial,
  };
}

function fanOutDe(noId: string, chamadas: number) {
  return {
    noId,
    rotulo: noId,
    chamadas: Array.from({ length: chamadas }, (_, i) => ({
      tipo: "aresta" as const,
      id: `e${i}`,
      rotulo: `${noId} → alvo${i}`,
    })),
  };
}

const tempoCompleto = {
  percursoId: "pc::a>b",
  rotulo: "api → banco",
  ms: 1100,
  completo: true,
  semValor: [],
  contribuintes: 2,
  dominantes: [],
};

/**
 * SPEC-65 fatia C — *"precisa aparecer sem precisar abrir e especificar tudo"*.
 */
describe("LeituraDoDesenhoPanel — o número fica NO chip, não atrás dele", () => {
  it("o valor se lê sem clicar em nada", () => {
    // Os outros chips da faixa cobram uma ação e podem dizer só a contagem: o
    // valor está no que se faz depois de clicar. Este não cobra nada — ele É a
    // informação, e escondê-la seria voltar ao "precisa abrir para saber".
    render(<LeituraDoDesenhoPanel leitura={leitura({ tempoDoPiorTrecho: tempoCompleto, tempos: [tempoCompleto] })} />);

    expect(screen.getByTestId("leitura-resumo")).toHaveTextContent("resposta até 1,1 s");
    // E nada foi aberto para isso.
    expect(screen.queryByTestId("leitura-lista")).toBeNull();
  });

  it("sem nada a dizer, o chip NÃO existe", () => {
    // Chip permanente vira moldura: some da vista junto com o que deveria
    // mostrar. É a mesma disciplina do §244 aplicada ao contrário.
    render(<LeituraDoDesenhoPanel leitura={leitura()} />);

    expect(screen.queryByTestId("leitura-resumo")).toBeNull();
  });

  it("a cor é neutra — leitura não é cobrança", () => {
    // Vermelho e âmbar já significam "errado" e "atenção" na mesa. Pintar um
    // fato de âmbar transformaria leitura em régua, que é justamente o linter
    // de grafo que a SPEC-63 recusou.
    render(<LeituraDoDesenhoPanel leitura={leitura({ tempoDoPiorTrecho: tempoCompleto, tempos: [tempoCompleto] })} />);

    const chip = screen.getByTestId("leitura-resumo");
    expect(chip.style.color).not.toContain("amarelo");
    expect(chip.style.borderColor).not.toContain("amarelo");
  });
});

describe("LeituraDoDesenhoPanel — o detalhe, e os endereços", () => {
  const incompleto = {
    percursoId: "pc::a>b>c",
    rotulo: "api → srv → banco",
    ms: 300,
    completo: false,
    semValor: [{ tipo: "aresta" as const, id: "e2", rotulo: "srv → banco" }],
    contribuintes: 2,
    dominantes: [],
  };

  it("diz que a soma é PISO, e de quem está esperando o dado", () => {
    // §248 — somar o que existe e apresentar como total é um verde falso.
    const onSelecionarAresta = vi.fn();
    render(
      <LeituraDoDesenhoPanel
        leitura={leitura({ tempoDoPiorTrecho: incompleto, tempos: [incompleto] })}
        onSelecionarAresta={onSelecionarAresta}
      />
    );

    expect(screen.getByTestId("leitura-resumo")).toHaveTextContent("resposta ≥ 300 ms");
    fireEvent.click(screen.getByTestId("leitura-resumo"));

    // O endereço leva à CONEXÃO, que é onde o timeoutMs se preenche (SPEC-64).
    fireEvent.click(screen.getByTestId("leitura-falta-e2"));
    expect(onSelecionarAresta).toHaveBeenCalledWith("e2");
  });

  it("o fan-out diz o número E a consequência — número sozinho não ensina nada", () => {
    render(
      <LeituraDoDesenhoPanel
        leitura={leitura({
          fanOut: [
            {
              noId: "api",
              rotulo: "srv-credito-api",
              chamadas: [
                { tipo: "aresta", id: "e1", rotulo: "a" },
                { tipo: "aresta", id: "e2", rotulo: "b" },
                { tipo: "aresta", id: "e3", rotulo: "c" },
              ],
            },
          ],
        })}
      />
    );
    fireEvent.click(screen.getByTestId("leitura-resumo"));

    const bloco = screen.getByTestId("leitura-fanout-api");
    expect(bloco).toHaveTextContent("3");
    expect(bloco.getAttribute("title") ?? bloco.querySelector("[title]")?.getAttribute("title") ?? "").toContain("a soma");
  });

  it("declara o que ficou de fora por ninguém ter dito se espera", () => {
    // §57 — leitura que ignorou parte do desenho sem dizer é pior que leitura
    // nenhuma.
    render(
      <LeituraDoDesenhoPanel
        leitura={leitura({
          tempoDoPiorTrecho: tempoCompleto,
          tempos: [tempoCompleto],
          conexoesNaoClassificadas: [{ tipo: "binding", quantas: 2 }],
        })}
      />
    );
    fireEvent.click(screen.getByTestId("leitura-resumo"));

    expect(screen.getByTestId("leitura-ignoradas")).toHaveTextContent("2× binding");
  });

  it("sem quem trate, o verbo de calar NÃO aparece — nada de botão morto", () => {
    // §244 — a mesma disciplina do `onReabrir` do PercursosPanel.
    render(<LeituraDoDesenhoPanel leitura={leitura({ fanOut: [fanOutDe("api", 3)] })} />);
    fireEvent.click(screen.getByTestId("leitura-resumo"));

    expect(screen.queryByTestId("dispensar-leitura-api-fan-out")).toBeNull();
    // E "virar régua" também não: a régua de forma ainda não tem a checagem
    // de grau, e abrir um formulário onde a regra não cabe é pior que nada.
    expect(screen.queryByTestId("virar-regua-api-fan-out")).toBeNull();
  });

  it("calar devolve a MARCA, e ela carrega o par (nó, tipo) — não o nó inteiro", () => {
    const onDispensar = vi.fn();
    render(
      <LeituraDoDesenhoPanel leitura={leitura({ fanOut: [fanOutDe("api", 3)] })} onDispensar={onDispensar} />
    );
    fireEvent.click(screen.getByTestId("leitura-resumo"));
    fireEvent.click(screen.getByTestId("dispensar-leitura-api-fan-out"));

    expect(onDispensar).toHaveBeenCalledWith(expect.objectContaining({ noId: "api", tipo: "fan-out" }));
  });

  it("§283 — o que foi calado tem volta, e diz quem calou", () => {
    const onRestaurar = vi.fn();
    const dispensa = { noId: "api", tipo: "fan-out", autor: "alguem@time" };
    render(
      <LeituraDoDesenhoPanel
        leitura={leitura({ fanOut: [fanOutDe("api", 3)] })}
        dispensadas={[dispensa]}
        onRestaurar={onRestaurar}
      />
    );
    fireEvent.click(screen.getByTestId("leitura-resumo"));

    const caladas = screen.getByTestId("leitura-caladas");
    expect(caladas).toHaveTextContent("alguem@time");
    fireEvent.click(screen.getByTestId("restaurar-leitura-api-fan-out"));
    expect(onRestaurar).toHaveBeenCalledWith(dispensa);
  });

  it("diz que é leitura, não régua — a frase que impede lê-la como cobrança", () => {
    render(<LeituraDoDesenhoPanel leitura={leitura({ tempoDoPiorTrecho: tempoCompleto, tempos: [tempoCompleto] })} />);
    fireEvent.click(screen.getByTestId("leitura-resumo"));

    expect(screen.getByTestId("leitura-lista")).toHaveTextContent("leitura, não régua");
  });
});

/**
 * §305 — RELATO REAL: *"ele não está validando se as informações estão
 * completas para navegar para a tela de ensaios"*.
 *
 * Medido no navegador, contra a stack local: com o desenho legível ("3 saltos
 * que esperam") e nenhum tempo declarado, a porta abria e a bancada mostrava
 * "hoje ≥ 0 ms" — a tabela de zeros que o §248 mandou evitar.
 */
describe("LeituraDoDesenhoPanel — a porta valida antes de navegar (§305)", () => {
  const falta = {
    motivo: "Nenhum componente tem o tempo preenchido, então o ensaio partiria de zero — e zero não é uma medição.",
    ondePreencher: [{ tipo: "no" as const, id: "bureau", rotulo: "bureau-credito" }],
  };

  it("com o que falta, NÃO há porta — há a frase e o endereço", () => {
    const onSimular = vi.fn();
    render(
      <LeituraDoDesenhoPanel leitura={leitura({ tempoDoPiorTrecho: { percursoId: "p1", rotulo: "api → bureau", ms: 3000, completo: true, semValor: [], contribuintes: 2, dominantes: [] } })} onSimular={onSimular} faltaParaEnsaiar={falta} />
    );
    fireEvent.click(screen.getByTestId("leitura-resumo"));

    expect(screen.queryByTestId("abrir-simulacao")).toBeNull();
    expect(screen.getByTestId("ensaiar-falta")).toHaveTextContent("zero não é uma medição");
    // §57 — "falta preencher" sem dizer ONDE transfere a busca para quem já não
    // sabia o que procurar.
    expect(screen.getByTestId("ensaiar-falta-bureau")).toHaveTextContent("bureau-credito");
  });

  it("o endereço LEVA ao campo — clicar seleciona o componente a preencher", () => {
    const onSelecionarNo = vi.fn();
    render(
      <LeituraDoDesenhoPanel
        leitura={leitura({ tempoDoPiorTrecho: { percursoId: "p1", rotulo: "api → bureau", ms: 3000, completo: true, semValor: [], contribuintes: 2, dominantes: [] } })}
        onSimular={vi.fn()}
        onSelecionarNo={onSelecionarNo}
        faltaParaEnsaiar={falta}
      />
    );
    fireEvent.click(screen.getByTestId("leitura-resumo"));
    fireEvent.click(screen.getByTestId("ensaiar-falta-bureau"));

    expect(onSelecionarNo).toHaveBeenCalledWith("bureau");
  });

  it("sem nada faltando, a porta existe — e o nome não fala mais em lentidão", () => {
    const onSimular = vi.fn();
    render(<LeituraDoDesenhoPanel leitura={leitura({ tempoDoPiorTrecho: { percursoId: "p1", rotulo: "api → bureau", ms: 3000, completo: true, semValor: [], contribuintes: 2, dominantes: [] } })} onSimular={onSimular} />);
    fireEvent.click(screen.getByTestId("leitura-resumo"));

    const porta = screen.getByTestId("abrir-simulacao");
    expect(porta).toHaveTextContent("ensaiar este desenho");
    expect(porta).not.toHaveTextContent(/lento/i);

    fireEvent.click(porta);
    expect(onSimular).toHaveBeenCalled();
  });
});
