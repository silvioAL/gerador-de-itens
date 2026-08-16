import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { DiagramaConfig, DocumentoDeDesenho } from "@gerador/engine";
import { DocumentoScreen } from "./DocumentoScreen";

const config: DiagramaConfig = { nodeTypes: {}, edgeTypes: {}, edgeRules: {} };

function doc(p: Partial<DocumentoDeDesenho> = {}): DocumentoDeDesenho {
  return {
    titulo: "Catálogo",
    contexto: "",
    saude: [],
    necessidades: [],
    decisoes: [],
    conferencias: { violacoes: [], aceitas: [], percursos: [], violacoesDePercurso: [], naoMedidos: [] },
    itens: [],
    ...p,
  };
}

function montar(props: Partial<React.ComponentProps<typeof DocumentoScreen>> = {}) {
  const onMudarEscrito = vi.fn();
  const onMudarStatus = vi.fn();
  const onBaixarHtml = vi.fn();
  const onBaixarMarkdown = vi.fn();
  render(
    <DocumentoScreen
      documento={doc()}
      config={config}
      escrito={{}}
      status={null}
      onMudarEscrito={onMudarEscrito}
      onMudarStatus={onMudarStatus}
      onBaixarMarkdown={onBaixarMarkdown}
      onBaixarHtml={onBaixarHtml}
      onVoltar={vi.fn()}
      {...props}
    />
  );
  return { onMudarEscrito, onMudarStatus, onBaixarHtml, onBaixarMarkdown };
}

describe("DocumentoScreen — o documento tem leitor (SPEC-58 fatia 1)", () => {
  it("a faixa de saúde mostra os mesmos chips do placar", () => {
    // Quem abre entende a situação em dois segundos, antes de ler uma linha.
    montar({
      documento: doc({
        saude: [
          { icone: "🎯", rotulo: "1 necessidade(s) sem componente", nivel: "amarelo" },
          { icone: "⚖", rotulo: "dentro do padrão", nivel: "verde" },
        ],
      }),
    });

    const faixa = screen.getByTestId("faixa-de-saude");
    expect(within(faixa).getByText(/sem componente/)).toBeInTheDocument();
    expect(within(faixa).getByText(/dentro do padrão/)).toBeInTheDocument();
  });

  it("demanda sem decisão NÃO parece documento incompleto", () => {
    // É a SPEC-58 inteira: a mudança que não move arquitetura deixou de ser
    // órfã, e a tela precisa dizer isso em vez de mostrar um buraco.
    montar();

    expect(screen.getByText(/nem toda mudança move arquitetura/)).toBeInTheDocument();
  });

  it("a decisão aparece com a descartada riscada", () => {
    montar({
      documento: doc({
        decisoes: [
          {
            id: "d1",
            titulo: "Fila em vez de síncrono",
            alternativas: [{ titulo: "Fila" }, { titulo: "Síncrono", consequencia: "acopla ao parceiro" }],
            escolhida: "Fila",
            porque: "desacopla",
            status: "aceita",
            origem: "manual",
            autor: "ana",
            em: "2026-08-15T10:00:00.000Z",
          },
        ],
      }),
    });

    const cartao = screen.getByTestId("documento-decisao");
    expect(within(cartao).getByText("Síncrono").tagName).toBe("S");
    expect(within(cartao).getByText(/acopla ao parceiro/)).toBeInTheDocument();
  });

  it("o diagrama animado que já existe entra dentro do documento", () => {
    // Maior ganho visual possível, e sem gerador novo: é o `gerarDiagramaHtml`
    // da SPEC-21 num `iframe srcDoc`, o que também impede o CSS do app de
    // vazar para dentro dele.
    montar({ diagramaHtml: "<html><body>desenho</body></html>" });

    expect(screen.getByTestId("documento-diagrama")).toBeInTheDocument();
  });

  it("sem diagrama, diz que não há — em vez de um quadro vazio", () => {
    montar();
    expect(screen.queryByTestId("documento-diagrama")).toBeNull();
    expect(screen.getByText(/Sem diagrama nesta demanda ainda/)).toBeInTheDocument();
  });
});

describe("as seções escritas (SPEC-58 fatia 2)", () => {
  it("vazia convida a escrever; escrita aparece com o selo de proveniência", () => {
    const { onMudarEscrito } = montar();

    fireEvent.click(within(screen.getByTestId("secao-riscos")).getByText(/O que você está aceitando correr/));
    fireEvent.change(screen.getByLabelText("Riscos e o que pode dar errado"), {
      target: { value: "O parceiro pode mudar o contrato." },
    });

    expect(onMudarEscrito).toHaveBeenCalledWith({ riscos: "O parceiro pode mudar o contrato." });
  });

  it("o que a pessoa escreveu é visualmente marcado como dela", () => {
    // Proveniência aplicada ao documento inteiro: quem lê precisa saber o que
    // foi afirmado por gente e o que foi apurado pela máquina.
    montar({ escrito: { tradeOffs: "Aceitamos latência maior na escrita." } });

    const secao = screen.getByTestId("secao-tradeoffs");
    expect(within(secao).getByText("escrito por uma pessoa")).toBeInTheDocument();
    expect(within(secao).getByText(/latência maior na escrita/)).toBeInTheDocument();
  });

  it("editar uma seção NÃO mexe na outra", () => {
    // A regra 3 da SPEC-58 na prática: o que a pessoa escreveu não se perde
    // por causa de outra edição.
    const { onMudarEscrito } = montar({ escrito: { tradeOffs: "já escrito" } });

    fireEvent.click(within(screen.getByTestId("secao-riscos")).getByText(/aceitando correr/));
    fireEvent.change(screen.getByLabelText("Riscos e o que pode dar errado"), { target: { value: "novo risco" } });

    expect(onMudarEscrito).toHaveBeenCalledWith({ tradeOffs: "já escrito", riscos: "novo risco" });
  });
});

describe("o ciclo (SPEC-58 fatia 3)", () => {
  it("documento nunca gerado começa como rascunho", () => {
    montar({ status: null });
    expect(screen.getByTestId("status-documento")).toHaveTextContent("rascunho");
  });

  it("aprovado com o desenho mudado depois DIZ isso — é o que impede o carimbo", () => {
    // A regra central da fatia 3. Sem ela, o selo afirmaria "aprovado" sobre um
    // desenho que ninguém aprovou.
    montar({ status: "aprovado", desatualizado: true });

    expect(screen.getByTestId("documento-desatualizado")).toHaveTextContent("mudou depois da aprovação");
  });

  it("aprovado e igual ao aprovado não avisa nada", () => {
    montar({ status: "aprovado", desatualizado: false });

    expect(screen.queryByTestId("documento-desatualizado")).toBeNull();
  });

  it("trocar o estado é um clique, e os quatro estão à mão", () => {
    const { onMudarStatus } = montar({ status: "em-revisao" });

    fireEvent.click(screen.getByTestId("status-documento"));
    const opcoes = screen.getByTestId("status-opcoes");
    for (const s of ["rascunho", "em revisão", "aprovado", "implementado"]) {
      expect(within(opcoes).getByText(s)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId("status-aprovado"));
    expect(onMudarStatus).toHaveBeenCalledWith("aprovado");
  });
});

describe("as saídas (SPEC-58 fatia 5)", () => {
  it("HTML e markdown são dois botões — o markdown deixou de ser o único acesso", () => {
    const { onBaixarHtml, onBaixarMarkdown } = montar();

    fireEvent.click(screen.getByTestId("baixar-html"));
    fireEvent.click(screen.getByTestId("baixar-markdown"));

    expect(onBaixarHtml).toHaveBeenCalled();
    expect(onBaixarMarkdown).toHaveBeenCalled();
  });
});

/**
 * SPEC-60 fatia C (§264) — o aviso que diz O QUE mudou.
 */
describe("DocumentoScreen — a comparação com a foto aprovada", () => {
  it("lista as seções que mudaram, entraram e saíram", () => {
    montar({
      status: "aprovado",
      desatualizado: true,
      mudancasDesdeAprovacao: [
        { titulo: "Itens", tipo: "mudou" },
        { titulo: "Riscos", tipo: "entrou" },
      ],
    });

    const texto = screen.getByTestId("mudancas-desde-aprovacao").textContent ?? "";
    expect(texto).toContain("mudou");
    expect(texto).toContain("Itens");
    expect(texto).toContain("entrou");
    expect(texto).toContain("Riscos");
  });

  it("desatualizado sem nenhuma seção diferente diz que é só espaço em branco", () => {
    // O booleano acusa qualquer byte e a comparação por seção não. Calar aqui
    // deixaria um amarelo sem nada que o explique — pior que o aviso de antes.
    montar({ status: "aprovado", desatualizado: true, mudancasDesdeAprovacao: [] });

    expect(screen.getByTestId("mudancas-desde-aprovacao").textContent).toContain("só espaço em branco");
  });

  it("documento em dia não mostra comparação nenhuma", () => {
    montar({ status: "aprovado", desatualizado: false, mudancasDesdeAprovacao: [{ titulo: "x", tipo: "mudou" }] });

    expect(screen.queryByTestId("mudancas-desde-aprovacao")).toBeNull();
  });
});
