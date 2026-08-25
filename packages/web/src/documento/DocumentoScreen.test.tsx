import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import type { DiagramaConfig, DocumentoDeDesenho, ItemDoDocumento } from "@gerador/engine";
import type { ItemGerado } from "../api/client";
import { DocumentoScreen } from "./DocumentoScreen";

/**
 * O React Flow de verdade precisa de `ResizeObserver` e de layout, que o jsdom
 * não tem — mesmo motivo do `Canvas.piscar.test`. O que interessa aqui é O QUE
 * a figura do documento manda para ele: os nós do desenho e o modo de leitura.
 */
const propsDoReactFlow: Record<string, unknown>[] = [];
vi.mock("@xyflow/react", async (importActual) => {
  const real = await importActual<typeof import("@xyflow/react")>();
  return {
    ...real,
    ReactFlow: (props: Record<string, unknown>) => {
      propsDoReactFlow.push(props);
      return <div data-testid="reactflow-falso" />;
    },
    Background: () => null,
    Controls: () => <div data-testid="controles-do-canvas" />,
    MiniMap: () => <div data-testid="minimapa-do-canvas" />,
  };
});

const config: DiagramaConfig = { nodeTypes: {}, edgeTypes: {}, edgeRules: {} };

function doc(p: Partial<DocumentoDeDesenho> = {}): DocumentoDeDesenho {
  return {
    titulo: "Catálogo",
    contexto: "",
    diagrama: { nodes: [], edges: [] },
    saude: [],
    necessidades: [],
    decisoes: [],
    conferencias: { violacoes: [], aceitas: [], percursos: [], violacoesDePercurso: [], naoMedidos: [], violacoesDeForma: [], formaAceitas: [] },
    itens: [],
    ...p,
  };
}

function derivado(chave: string, p: Partial<ItemDoDocumento> = {}): ItemDoDocumento {
  return {
    numero: 1,
    chave,
    rotulo: "01",
    descricao: `Fazer ${chave}`,
    tipo: "História",
    tamanho: "P",
    techs: [],
    contextos: [],
    necessidades: [],
    decisoes: [],
    percursos: [],
    ...p,
  };
}

function escrito(chave: string, p: Partial<ItemGerado> = {}): ItemGerado {
  return {
    id: chave,
    quebraId: "q1",
    chave,
    titulo: `Item ${chave}`,
    tipo: "atomica",
    tamanho: "P",
    dependencias: [],
    corpoMarkdown: `### ${chave}\n\ncorpo de ${chave}`,
    pendencias: 0,
    sugestoes: 0,
    estado: "gerado",
    linkExterno: null,
    criadoEm: new Date("2026-08-12T10:00:00Z").toISOString(),
    ...p,
  };
}

function montar(props: Partial<React.ComponentProps<typeof DocumentoScreen>> = {}) {
  propsDoReactFlow.length = 0;
  const onMudarEscrito = vi.fn();
  const onMudarStatus = vi.fn();
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
      onVoltar={vi.fn()}
      {...props}
    />
  );
  return { onMudarEscrito, onMudarStatus, onBaixarMarkdown };
}

describe("DocumentoScreen — o documento tem leitor (SPEC-58 fatia 1)", () => {
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
});

/**
 * SPEC-61 §3 — o desenho é FIGURA: o mesmo React Flow da mesa, parado.
 *
 * Era um `iframe` com o HTML animado (SPEC-21), que trazia junto um painel
 * lateral mudando de tamanho conforme a seleção — dentro de um documento, um
 * corpo estranho que se mexe sozinho (relato do usuário).
 */
describe("o desenho, como figura", () => {
  const diagrama = {
    nodes: [{ id: "n1", type: "service", x: 0, y: 0, label: "srv", status: "novo" as const, spec: {}, specNA: {} }],
    edges: [],
  };

  it("é o MESMO canvas da mesa, e não uma segunda renderização parecida", () => {
    montar({ documento: doc({ diagrama }) });

    expect(screen.getByTestId("documento-diagrama")).toBeInTheDocument();
    expect(propsDoReactFlow.at(-1)?.nodes).toHaveLength(1);
  });

  it("figura não pede clique: sem arrastar, sem conectar, sem Delete, sem seleção", () => {
    // Não basta o `aplicar` vazio do `useDiagrama`: ele impede a escrita, mas a
    // interface continuaria CONVIDANDO a ações que não acontecem — que é pior
    // do que não convidar.
    montar({ documento: doc({ diagrama }) });

    const props = propsDoReactFlow.at(-1)!;
    expect(props.nodesDraggable).toBe(false);
    expect(props.nodesConnectable).toBe(false);
    expect(props.elementsSelectable).toBe(false);
    expect(props.deleteKeyCode).toBeNull();
    // A folha rola por trás dela: um quadro que engole a roda do mouse trava a
    // página sob o cursor.
    expect(props.zoomOnScroll).toBe(false);
    expect(props.preventScrolling).toBe(false);
  });

  it("sem controles e sem minimapa — são instrumentos de quem navega", () => {
    montar({ documento: doc({ diagrama }) });

    expect(screen.queryByTestId("controles-do-canvas")).toBeNull();
    expect(screen.queryByTestId("minimapa-do-canvas")).toBeNull();
  });

  it("sem diagrama, diz que não há — em vez de um quadro vazio", () => {
    montar();
    expect(screen.queryByTestId("documento-diagrama")).toBeNull();
    expect(screen.getByText(/Sem diagrama nesta demanda ainda/)).toBeInTheDocument();
  });
});

/**
 * SPEC-61 §4 — a faixa separa PROBLEMA de INVENTÁRIO.
 */
describe("a faixa de saúde, em duas partes", () => {
  it("o que cobra ação e o que já está feito ficam em lados com título", () => {
    // Antes os chips tinham o mesmo peso visual e só a cor os separava. Nada de
    // cor nova: o que muda é onde a coisa está.
    montar({
      documento: doc({
        saude: [
          { icone: "🎯", rotulo: "1 necessidade(s) sem componente", nivel: "amarelo", lado: "atencao" },
          { icone: "⚖", rotulo: "dentro do padrão", nivel: "verde", lado: "jaTem" },
        ],
      }),
    });

    const atencao = screen.getByTestId("saude-pede-atencao");
    expect(atencao.textContent).toContain("o que ainda pede atenção");
    expect(within(atencao).getByText(/sem componente/)).toBeInTheDocument();

    const jaTem = screen.getByTestId("saude-ja-tem");
    expect(jaTem.textContent).toContain("o que este desenho já tem");
    expect(within(jaTem).getByText(/dentro do padrão/)).toBeInTheDocument();
  });

  it("lado sem nada não aparece — título vazio se lê como problema", () => {
    montar({
      documento: doc({ saude: [{ icone: "🧭", rotulo: "2 decisão(ões) vigente(s)", nivel: "verde", lado: "jaTem" }] }),
    });

    expect(screen.queryByTestId("saude-pede-atencao")).toBeNull();
    expect(screen.getByTestId("saude-ja-tem")).toBeInTheDocument();
  });
});

/**
 * SPEC-61 §2 e §6.1 — a seção que absorveu a tela `#/itens`.
 */
describe("a seção dos itens", () => {
  it("a DERIVAÇÃO manda: o item derivado sem escrita aparece dizendo que não foi escrito", () => {
    // Juntar as duas listas sem dizer qual manda daria uma seção que às vezes
    // tem quatro itens e às vezes sete, sem ninguém entender por quê.
    montar({ documento: doc({ itens: [derivado("n1::criacao"), derivado("n2::criacao", { numero: 2 })] }) });

    expect(screen.getByTestId("item-gerado-0")).toHaveTextContent("Fazer n1::criacao");
    expect(screen.getByTestId("item-sem-escrita-1").textContent).toContain("ainda não escrito");
  });

  it("onde há escrita, o card abre com o texto final — e recolher é que é sob demanda", () => {
    montar({
      documento: doc({ itens: [derivado("n1::criacao")] }),
      itensEscritos: [escrito("n1::criacao")],
    });

    expect(screen.getByTestId("item-corpo-0").textContent).toContain("corpo de n1::criacao");
    fireEvent.click(screen.getByTestId("item-expandir-0"));
    expect(screen.queryByTestId("item-corpo-0")).toBeNull();
  });

  it("item escrito cuja chave sumiu da derivação vai pro fim, marcado como órfão", () => {
    // §57 — sumir em silêncio esconde justamente o evento que interessa.
    montar({
      documento: doc({ itens: [derivado("n1::criacao")] }),
      itensEscritos: [escrito("n1::criacao"), escrito("apagado::criacao")],
    });

    expect(screen.queryByTestId("item-orfao-0")).toBeNull();
    expect(screen.getByTestId("item-orfao-1").textContent).toContain("órfão");
  });

  it("a completude de cada card diz O QUE falta, e leva de volta à revisão daquele item", () => {
    const onRevisarItem = vi.fn();
    montar({
      documento: doc({ itens: [derivado("n1::criacao")] }),
      itensEscritos: [escrito("n1::criacao", { pendencias: 3 })],
      onRevisarItem,
    });

    const chip = screen.getByTestId("item-completude-0");
    expect(chip.textContent).toContain("3 campos a especificar");
    fireEvent.click(chip);
    expect(onRevisarItem).toHaveBeenCalledWith("n1::criacao");
  });

  it("SPEC-49 — exportar os PRONTOS veio junto com os cards, em vez de morrer com a tela", async () => {
    const onExportar = vi.fn().mockResolvedValue({
      exportados: [escrito("n1::criacao")],
      erros: [{ chave: "n2::criacao", erro: "projeto AB não aceita issue do tipo Task" }],
      ignorados: ["n3::criacao"],
      destino: "Jira do time",
    });
    montar({
      documento: doc({ itens: [derivado("n1::criacao"), derivado("n2::criacao", { numero: 2 })] }),
      itensEscritos: [escrito("n1::criacao"), escrito("n2::criacao", { pendencias: 2 })],
      onExportar,
      destinoDaExportacao: "Jira do time",
    });

    expect(screen.getByTestId("itens-resumo").textContent).toContain("1 de 2 itens prontos");
    fireEvent.click(screen.getByTestId("exportar-prontos"));
    await waitFor(() => expect(onExportar).toHaveBeenCalled());

    const resultado = await screen.findByTestId("resultado-exportacao");
    expect(resultado.textContent).toContain("1 item(ns) no Jira do time");
    expect(resultado.textContent).toContain("projeto AB não aceita");
    expect(resultado.textContent).toContain("1 ficaram de fora");
  });

  it("sem item nenhum, o vazio conduz de volta à demanda — em vez de um buraco", () => {
    montar();

    const secao = screen.getByTestId("secao-dos-itens");
    expect(secao.textContent).toContain("derive a demanda na mesa de projeto");
    // O documento NÃO gera: gerar é ato da revisão (§6.2).
    expect(within(secao).queryByRole("button", { name: /gerar/i })).toBeNull();
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

describe("as saídas (SPEC-58 fatia 5, revista no §269)", () => {
  it("markdown, e só ele — o HTML era a própria tela num arquivo", () => {
    // §269 — o download de HTML saiu. Ele nasceu antes desta tela existir; com
    // ela de pé virou uma segunda renderização do MESMO documento, mantida à
    // parte e livre para divergir. O markdown fica porque tem destino próprio
    // (Confluence, Jira, repositório) que a tela não alcança.
    const { onBaixarMarkdown } = montar();

    expect(screen.queryByTestId("baixar-html")).toBeNull();
    fireEvent.click(screen.getByTestId("baixar-markdown"));
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
