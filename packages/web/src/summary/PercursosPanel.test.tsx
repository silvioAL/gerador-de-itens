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
        { percursoId: "pc::a>b", rotulo: "web → api", texto: "O caminho cabe no orçamento", campo: "timeoutMs", elementosSemValor: [{ tipo: "no", id: "n2", rotulo: "n2" }] },
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
      naoMedidos: [{ percursoId: "pc::c>d", rotulo: "c → d", texto: "t", campo: "x", elementosSemValor: [{ tipo: "no", id: "n9", rotulo: "n9" }] }],
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
 * SPEC-64 fatia A — o que falta pode estar na CONEXÃO.
 */
describe("PercursosPanel — o endereço do que falta", () => {
  it("conexão sem valor é clicável, e leva à ARESTA — não a um nó que não existe", () => {
    const onSelecionarAresta = vi.fn();
    render(
      <PercursosPanel
        percursos={[percurso({ id: "pc::a>b", confirmado: true })]}
        violacoes={[]}
        naoMedidos={[
          {
            percursoId: "pc::a>b",
            rotulo: "web → api",
            texto: "O caminho cabe no orçamento",
            campo: "timeoutMs",
            elementosSemValor: [{ tipo: "aresta", id: "e1", rotulo: "web → api" }],
          },
        ]}
        onConfirmar={vi.fn()}
        onDescartar={vi.fn()}
        onSelecionarAresta={onSelecionarAresta}
      />
    );
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    const alvo = screen.getByTestId("elemento-sem-valor-e1");
    expect(alvo.textContent).toContain("conexão web → api");
    fireEvent.click(alvo);
    expect(onSelecionarAresta).toHaveBeenCalledWith("e1");
  });

  it("desenho ambíguo diz o MOTIVO, em vez de listar elemento nenhum", () => {
    // Par ligado por duas conexões que declaram o campo: não há valor faltando,
    // há desenho que não diz por onde a requisição passa.
    montar({
      percursos: [percurso({ id: "pc::a>b", confirmado: true })],
      naoMedidos: [
        {
          percursoId: "pc::a>b",
          rotulo: "web → api",
          texto: "O caminho cabe no orçamento",
          campo: "timeoutMs",
          elementosSemValor: [],
          motivo: 'há mais de uma conexão de "web" para "api" que declara timeoutMs',
        },
      ],
    });
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    expect(screen.getByTestId("percurso-motivo").textContent).toContain("mais de uma conexão");
    expect(screen.getByTestId("percurso-nao-medido").textContent).not.toContain("falta timeoutMs em");
  });
});

/**
 * SPEC-64 fatias B e C — declarar e corrigir.
 *
 * Até aqui só existiam dois verbos, `confirmar` e `não é caminho`. Um trajeto
 * quase certo só podia ser recusado, e recusar não dizia o que era certo.
 */
describe("PercursosPanel — declarar e ajustar", () => {
  it("a porta de declarar à mão existe, e diz para que serve", () => {
    const onDeclarar = vi.fn();
    montar({ percursos: [percurso({ id: "pc::a>b", confirmado: true })], onDeclarar });
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    const botao = screen.getByTestId("declarar-caminho");
    fireEvent.click(botao);
    expect(onDeclarar).toHaveBeenCalled();
    expect(screen.getByTestId("percursos-lista").textContent).toContain("clique os componentes na ordem");
  });

  it("o caminho a confirmar ganha o verbo do MEIO — ajustar", () => {
    const onAjustar = vi.fn();
    montar({ percursos: [percurso({ id: "pc::a>b" })], onAjustar });
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    // Recebe o PERCURSO inteiro: o inferido não está guardado na quebra, e um
    // id sozinho fazia o App procurar onde não havia (achado do E2E).
    fireEvent.click(screen.getByTestId("ajustar-pc::a>b"));
    expect(onAjustar).toHaveBeenCalledWith(expect.objectContaining({ id: "pc::a>b", nos: ["n1", "n2"] }));
  });

  it("§286 — o declarado à mão APARECE, conta, e diz que foi declarado", () => {
    // Achado do E2E: o manual conta (`percursoConta`) mas nasce com
    // `confirmado: undefined`, e o painel filtrava por `=== true`. Ele não caía
    // nem em "confirmados" nem em "a confirmar" — nascia invisível, com o
    // registro vivo na quebra. O §283 de volta, pela porta da fatia B.
    montar({ percursos: [percurso({ id: "pc::a>c", rotulo: "web → worker", origem: "manual" })] });

    expect(screen.getByTestId("percursos-resumo")).toHaveTextContent("1 caminho(s)");
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    const linha = screen.getByTestId("percurso-confirmado");
    expect(linha.textContent).toContain("web → worker");
    expect(linha.textContent).toContain("declarado à mão");
    // E o verbo de desfazer diz a verdade: apagar, porque ele não volta.
    expect(screen.getByTestId("desfazer-pc::a>c").textContent).toBe("apagar");
  });

  it("sem quem trate, nem 'declarar' nem 'ajustar' aparecem — nada de botão morto", () => {
    render(
      <PercursosPanel
        percursos={[percurso({ id: "pc::a>b" })]}
        violacoes={[]}
        naoMedidos={[]}
        onConfirmar={vi.fn()}
        onDescartar={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("percursos-resumo"));

    expect(screen.queryByTestId("declarar-caminho")).toBeNull();
    expect(screen.queryByTestId("ajustar-pc::a>b")).toBeNull();
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
