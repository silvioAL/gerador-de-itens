import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { Percurso } from "@gerador/engine";
import { PercursosPanel } from "./PercursosPanel";

function percurso(p: Partial<Percurso> & { id: string }): Percurso {
  return { rotulo: "web → api", nos: ["n1", "n2"], origem: "inferido", ...p };
}

function montar(props: Partial<React.ComponentProps<typeof PercursosPanel>> = {}) {
  const onConfirmar = vi.fn();
  const onDescartar = vi.fn();
  const onReabrir = vi.fn();
  const onSelecionarNo = vi.fn();
  render(
    <PercursosPanel
      percursos={[]}
      violacoes={[]}
      naoMedidos={[]}
      onConfirmar={onConfirmar}
      onDescartar={onDescartar}
      onReabrir={onReabrir}
      onSelecionarNo={onSelecionarNo}
      {...props}
    />
  );
  return { onConfirmar, onDescartar, onReabrir, onSelecionarNo };
}

describe("PercursosPanel — a dimensão do CAMINHO (SPEC-57 fatia E)", () => {
  it("caminho inferido chega para CONFIRMAR, não medido", () => {
    // Inferir é grátis e erra (§5 pergunta 4). Nada é medido antes do aceite.
    montar({ percursos: [percurso({ id: "pc::n1>n2" })] });

    expect(screen.getByTestId("percursos-resumo")).toHaveTextContent("1 caminho(s) a confirmar");
  });

  it("confirmar devolve o id; 'não é caminho' também — e são ações diferentes", () => {
    // Sem o descarte com efeito, o inferidor devolveria o mesmo caminho no
    // render seguinte para sempre, e a pessoa aprenderia a ignorar o chip.
    const { onConfirmar, onDescartar } = montar({ percursos: [percurso({ id: "pc::n1>n2" })] });
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    fireEvent.click(screen.getByTestId("confirmar-pc::n1>n2"));
    expect(onConfirmar).toHaveBeenCalledWith("pc::n1>n2");

    fireEvent.click(screen.getByText("não é caminho"));
    expect(onDescartar).toHaveBeenCalledWith("pc::n1>n2");
  });

  it("caminho RECUSADO some da fila de confirmação — mas NÃO some da tela", () => {
    // A primeira metade é de propósito: se o recusado voltasse para a fila, o
    // descarte viraria uma briga com o inferidor a cada render.
    //
    // §283 — a segunda metade é o defeito que este teste deixava passar. Ele
    // afirmava só "sumiu da fila", e o caminho sumia da INTERFACE INTEIRA com o
    // registro vivo no banco: relato do usuário, "o usuário errar não consegue
    // ajustar".
    montar({ percursos: [percurso({ id: "pc::n1>n2", confirmado: false })] });

    expect(screen.getByTestId("percursos-resumo")).toHaveTextContent("0 caminho(s)");
    fireEvent.click(screen.getByTestId("percursos-resumo"));
    expect(screen.queryByTestId("percurso-a-confirmar")).toBeNull();
    expect(screen.getByTestId("percurso-recusado")).toBeInTheDocument();
  });

  it("violação de caminho ganha o chip, com a conta e o porquê", () => {
    montar({
      percursos: [percurso({ id: "pc::a>b", confirmado: true })],
      violacoes: [
        {
          percursoId: "pc::a>b",
          rotulo: "web → api → worker",
          texto: "O caminho cabe no orçamento",
          campo: "timeoutMs",
          esperado: "≤ 2000ms",
          atual: "soma de timeoutMs = 2250ms em 5 nós",
          porque: "É o que o cliente sente.",
        },
      ],
    });

    expect(screen.getByTestId("percursos-resumo")).toHaveTextContent("1 caminho(s) fora do padrão");
    fireEvent.click(screen.getByTestId("percursos-resumo"));
    const lista = screen.getByTestId("percursos-lista");
    expect(within(lista).getByText(/2250ms/)).toBeInTheDocument();
    expect(within(lista).getByText(/o cliente sente/)).toBeInTheDocument();
  });

  it("'sem medir' aparece com os nós que faltam, clicáveis — não é um erro mudo", () => {
    // O estado que mais importa não esconder: somar só o que existe daria um
    // verde falso, e verde falso encerra a pergunta.
    const { onSelecionarNo } = montar({
      percursos: [percurso({ id: "pc::a>b", confirmado: true })],
      naoMedidos: [
        { percursoId: "pc::a>b", rotulo: "web → api", texto: "O caminho cabe no orçamento", campo: "timeoutMs", nosSemValor: ["n2"] },
      ],
    });

    expect(screen.getByTestId("percursos-resumo")).toHaveTextContent("1 sem medir");
    fireEvent.click(screen.getByTestId("percursos-resumo"));
    const lista = screen.getByTestId("percursos-lista");
    expect(within(lista).getByText(/falta/)).toBeInTheDocument();

    fireEvent.click(within(lista).getByRole("button", { name: "n2" }));
    expect(onSelecionarNo).toHaveBeenCalledWith("n2");
  });

  it("violação vem antes de 'sem medir' no rótulo — o que exige ação primeiro", () => {
    montar({
      percursos: [percurso({ id: "pc::a>b", confirmado: true })],
      violacoes: [{ percursoId: "pc::a>b", rotulo: "a → b", texto: "t", esperado: "≤ 1", atual: "2" }],
      naoMedidos: [{ percursoId: "pc::c>d", rotulo: "c → d", texto: "t", campo: "x", nosSemValor: ["n9"] }],
    });

    expect(screen.getByTestId("percursos-resumo")).toHaveTextContent("fora do padrão");
  });

  it("lista truncada AVISA, em vez de fingir que são todos", () => {
    montar({ percursos: [percurso({ id: "pc::n1>n2" })], truncado: true });
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    expect(screen.getByTestId("percursos-truncado")).toBeInTheDocument();
  });
});

/**
 * §283 — errar aqui não podia ser definitivo.
 *
 * RELATO REAL do usuário, sobre o print do painel com dois `✓`: *"aqui nessa
 * parte de o usuário errar não consegue ajustar"*.
 *
 * Quarta aparição da mesma família: §278 recusar ajuste, §278 descartar
 * feedback, §281 a resposta antiga, e agora o caminho. A régua já estava
 * escrita (CONTEXTO §4.4) — faltava aplicá-la aqui.
 */
describe("PercursosPanel — nenhuma decisão sobre caminho é de mão única", () => {
  it("confirmado ganha 'desfazer' — e confirmar não é clique inócuo", () => {
    // Confirmar liga as réguas de tempo e de saltos sobre o caminho e põe item
    // no backlog (§249), e o botão fica a um pixel do "não é caminho".
    const { onReabrir } = montar({ percursos: [percurso({ id: "pc::a>b", confirmado: true })] });
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    fireEvent.click(screen.getByTestId("desfazer-pc::a>b"));
    expect(onReabrir).toHaveBeenCalledWith("pc::a>b");
  });

  it("recusado fica atrás de um clique, com o caminho de volta", () => {
    const { onReabrir } = montar({ percursos: [percurso({ id: "pc::a>b", confirmado: false })] });
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    expect(screen.getByTestId("percursos-recusados").textContent).toContain("1 recusado(s)");
    fireEvent.click(screen.getByTestId("reabrir-pc::a>b"));
    expect(onReabrir).toHaveBeenCalledWith("pc::a>b");
  });

  it("obsoleto NÃO se passa por caminho vivo — e dá para removê-lo", () => {
    // O `conciliarPercursos` promete "vira obsoleto em vez de desaparecer"; a
    // tela concatenava os dois e desenhava o mesmo ✓, afirmando que um trajeto
    // existe no desenho quando ele já não existe.
    const { onReabrir } = montar({
      percursos: [],
      obsoletos: [percurso({ id: "pc::sumiu", rotulo: "web → antigo", confirmado: true })],
    });

    expect(screen.getByTestId("percursos-resumo")).toHaveTextContent("1 caminho(s) que sumiram do desenho");
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    const obsoleto = screen.getByTestId("percurso-obsoleto");
    expect(obsoleto.textContent).toContain("web → antigo");
    expect(screen.queryByTestId("percurso-confirmado")).toBeNull();

    fireEvent.click(screen.getByTestId("remover-pc::sumiu"));
    expect(onReabrir).toHaveBeenCalledWith("pc::sumiu");
  });

  it("sem quem trate a reabertura, os botões não aparecem — nada de botão morto", () => {
    render(
      <PercursosPanel
        percursos={[percurso({ id: "pc::a>b", confirmado: true })]}
        violacoes={[]}
        naoMedidos={[]}
        onConfirmar={vi.fn()}
        onDescartar={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    expect(screen.getByTestId("percurso-confirmado")).toBeInTheDocument();
    expect(screen.queryByTestId("desfazer-pc::a>b")).toBeNull();
  });
});

/**
 * SPEC-60 fatia A (§263) — o preço de confirmar, antes de confirmar.
 */
describe("PercursosPanel — o delta da confirmação", () => {
  const A_CONFIRMAR = { id: "pc::a>b", rotulo: "a → b", nos: ["a", "b"], origem: "inferido" as const };

  it("mostra o item que confirmar vai criar", () => {
    montar({
      percursos: [A_CONFIRMAR],
      remedirConfirmacao: () => ({
        linhas: [{ rotulo: "itens no backlog", antes: 3, depois: 4 }],
        alerta: "Confirmar faz a régua valer sobre este caminho — e ele já está fora dela.",
      }),
    });

    fireEvent.click(screen.getByTestId("percursos-resumo"));

    const delta = screen.getByTestId("delta-percurso-pc::a>b");
    expect(delta.textContent).toContain("itens no backlog 3 → 4");
    expect(screen.getByTestId("delta-alerta").textContent).toContain("já está fora dela");
  });

  it("sem quem meça, confirmar continua sendo um clique — a medição é acréscimo", () => {
    const { onConfirmar } = montar({ percursos: [A_CONFIRMAR] });
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    fireEvent.click(screen.getByTestId("confirmar-pc::a>b"));
    expect(onConfirmar).toHaveBeenCalledWith("pc::a>b");
    expect(screen.queryByTestId("delta-percurso-pc::a>b")).toBeNull();
  });
});

/**
 * §275 — o texto que supunha vocabulário que ninguém deu.
 */
describe("PercursosPanel — o que é 'caminho'", () => {
  it("define o termo antes de usá-lo", () => {
    // Relato do usuário: "que motor? o que significa caminho? fluxo
    // informacional? ciclomático?". Nomear a coisa custa uma linha e economiza
    // a pergunta — e quem lê no meio do trabalho não vai atrás do glossário.
    montar({ percursos: [percurso({ id: "pc::n1>n2" })] });
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    const lista = screen.getByTestId("percursos-lista").textContent ?? "";
    expect(lista).toContain("sequência de componentes por onde uma requisição passa");
    // E diz de onde vieram, sem a palavra "motor" solta: quem não leu a
    // jornada não sabe o que ela nomeia.
    expect(lista).toContain("lidos do seu desenho");
    expect(lista).toContain("sem IA");
  });
});
