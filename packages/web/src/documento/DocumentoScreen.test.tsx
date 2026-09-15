import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import type { Decisao, DiagramaConfig, DocumentoDeDesenho, ItemDoDocumento } from "@gerador/engine";
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
    specAnexada: false,
    // SPEC-115 — o item nasce fora de qualquer envio; quem quiser um item em
    // trânsito declara `specEnviadaEm` no `Partial`.
    specEnviadaEm: null,
    specErro: null,
    criadoEm: new Date("2026-08-12T10:00:00Z").toISOString(),
    ...p,
  };
}

function montar(props: Partial<React.ComponentProps<typeof DocumentoScreen>> = {}) {
  propsDoReactFlow.length = 0;
  const onMudarEscrito = vi.fn();
  const onMudarStatus = vi.fn();
  const onBaixarMarkdown = vi.fn();
  const tela = (p: typeof props) => (
    <DocumentoScreen
      documento={doc()}
      config={config}
      escrito={{}}
      status={null}
      onMudarEscrito={onMudarEscrito}
      onMudarStatus={onMudarStatus}
      onBaixarMarkdown={onBaixarMarkdown}
      onVoltar={vi.fn()}
      {...p}
    />
  );
  const { rerender } = render(tela(props));
  return {
    onMudarEscrito,
    onMudarStatus,
    onBaixarMarkdown,
    /**
     * Remontar com props novas, pela MESMA montagem. Usado onde o teste precisa
     * de uma TRANSIÇÃO (SPEC-120 fatia F: "o fim é um evento") — renderizar do
     * zero seria o caso de quem abre a tela com tudo pronto, que é justamente
     * o outro caso, e ele tem comportamento diferente.
     */
    rerender: (p: typeof props) => rerender(tela(p)),
  };
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
 * SPEC-115 fatias A e C — **a seção de trade-offs deixou de nascer em branco.**
 *
 * A SPEC-114 adiou isto presumindo dependência de um fluxo que ninguém
 * construiu. Medindo, `Decisao` já era o material: a alternativa descartada com
 * a consequência dela é "o que se perdeu"; a escolhida com o porquê é "o que se
 * ganhou". Nada novo no modelo — a mesma decisão, lida do outro ângulo.
 */
describe("DocumentoScreen — trade-offs derivados das decisões (SPEC-115 fatias A e C)", () => {
  const decisao = (p: Partial<Decisao> = {}): Decisao => ({
    id: "d1",
    titulo: "Fila em vez de síncrono",
    alternativas: [{ titulo: "Fila" }, { titulo: "Síncrono", consequencia: "acopla ao parceiro" }],
    escolhida: "Fila",
    porque: "desacopla o pico do parceiro",
    status: "aceita",
    origem: "manual",
    autor: "ana",
    em: "2026-08-15T10:00:00.000Z",
    ...p,
  });

  it("duas decisões e nenhum texto livre mostram DUAS linhas, não a caixa vazia", () => {
    // É a prova pedida pela fatia A, literal: "uma quebra com 2 decisões e
    // nenhum texto livre mostra 2 linhas, não a caixa vazia".
    montar({
      documento: doc({
        decisoes: [decisao(), decisao({ id: "d2", titulo: "Postgres em vez de Mongo", escolhida: "Postgres" })],
      }),
      escrito: {},
    });

    const secao = screen.getByTestId("secao-tradeoffs");
    expect(within(secao).getByTestId("tradeoff-derivado-d1")).toBeInTheDocument();
    expect(within(secao).getByTestId("tradeoff-derivado-d2")).toBeInTheDocument();
  });

  it("cada linha diz o que GANHOU e o que CUSTOU — os dois lados da mesma decisão", () => {
    montar({ documento: doc({ decisoes: [decisao()] }) });

    const linha = screen.getByTestId("tradeoff-derivado-d1");
    expect(linha).toHaveTextContent("ganhou Fila — desacopla o pico do parceiro");
    expect(linha).toHaveTextContent("perdeu Síncrono — acopla ao parceiro");
  });

  it("decisão sem alternativa descartada declara que não houve preço, em vez de inventar um", () => {
    montar({
      documento: doc({ decisoes: [decisao({ alternativas: [{ titulo: "Fila" }] })] }),
    });

    expect(screen.getByTestId("tradeoff-derivado-d1")).toHaveTextContent("não teve preço registrado");
  });

  it("o rótulo conta a verdade nova: derivado de N decisões, não “escrito por uma pessoa”", () => {
    montar({ documento: doc({ decisoes: [decisao()] }) });

    expect(screen.getByTestId("secao-tradeoffs-origem")).toHaveTextContent(
      "derivado de 1 decisão — edite ou complemente"
    );
  });

  it("SEM decisão nenhuma, a seção é exatamente a de antes — o fallback é o caso de quem não usa isto", () => {
    montar();

    const secao = screen.getByTestId("secao-tradeoffs");
    expect(within(secao).queryByTestId("tradeoffs-derivados")).toBeNull();
    expect(screen.getByTestId("secao-tradeoffs-origem")).toHaveTextContent("escrito por uma pessoa");
  });

  it("o texto livre sobrevive AO LADO do derivado, e continua editável", () => {
    // A regra 3 da SPEC-58 não mudou: a derivação não come o julgamento de
    // ninguém. Ela só deixa de exigir que alguém escreva do zero o que o
    // produto já sabe.
    const { onMudarEscrito } = montar({
      documento: doc({ decisoes: [decisao()] }),
      escrito: { tradeOffs: "Aceitamos a fila mesmo sabendo do custo de operação." },
    });

    const secao = screen.getByTestId("secao-tradeoffs");
    expect(within(secao).getByTestId("tradeoff-derivado-d1")).toBeInTheDocument();
    expect(within(secao).getByText(/custo de operação/)).toBeInTheDocument();

    fireEvent.click(within(secao).getByText(/custo de operação/));
    fireEvent.change(screen.getByLabelText("Trade-offs e o que ficou de fora"), { target: { value: "outro" } });
    expect(onMudarEscrito).toHaveBeenCalledWith(expect.objectContaining({ tradeOffs: "outro" }));
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

/**
 * SPEC-115 fatia H — **o botão desabilitado parou de ser mudo.**
 *
 * Queixa do usuário: *"o botão de exportar fica desabilitado, mas isso não faz
 * sentido já que eu posso chegar nessa tela, então acredito que a validação
 * deveria ficar na tela anterior."*
 *
 * A opção escolhida (§1.3) foi a B: **nada é bloqueado**. O §269 fez o
 * documento alcançável cedo de propósito, e fechar a porta desfaria isso. O que
 * muda é que o motivo, que só existia no `title` (hover — invisível no celular,
 * no teclado e para quem tem pressa), passou a estar na tela.
 */
describe("DocumentoScreen — o motivo do “Exportar” desabilitado (SPEC-115 fatia H)", () => {
  it("com zero itens prontos, a tela DIZ por quê e para onde ir resolver", () => {
    montar({
      documento: doc({ itens: [derivado("n1::criacao")] }),
      itensEscritos: [escrito("n1::criacao", { pendencias: 2 })],
      onExportar: vi.fn(),
    });

    const motivo = screen.getByTestId("motivo-exportar-desabilitado");
    expect(motivo).toHaveTextContent("Nenhum item está pronto");
    expect(motivo).toHaveTextContent("Resolva na revisão da demanda");
    expect(screen.getByTestId("exportar-prontos")).toBeDisabled();
  });

  it("sem demanda salva, o motivo é OUTRO — e a tela não confunde os dois", () => {
    // Somar "não salvou" com "nada pronto" seria o defeito do §276 aplicado a
    // uma mensagem de erro: dois problemas com soluções diferentes, um texto só.
    montar({
      documento: doc({ itens: [derivado("n1::criacao")] }),
      itensEscritos: [escrito("n1::criacao")],
      onExportar: undefined,
    });

    expect(screen.getByTestId("motivo-exportar-desabilitado")).toHaveTextContent("Salve a demanda antes de exportar");
  });

  it("com item pronto, não há motivo nenhum a exibir — a tela não explica o que não aconteceu", () => {
    montar({
      documento: doc({ itens: [derivado("n1::criacao")] }),
      itensEscritos: [escrito("n1::criacao")],
      onExportar: vi.fn(),
    });

    expect(screen.queryByTestId("motivo-exportar-desabilitado")).toBeNull();
    expect(screen.getByTestId("exportar-prontos")).not.toBeDisabled();
  });
});

/**
 * SPEC-115 fatia F (§410) — **a caixa é a superfície da conversa com o agente,
 * e a spec deriva do que se decidiu ali.**
 *
 * A primeira escrita desta tela pôs três textareas em branco aqui, e isso
 * contradizia a tese da própria SPEC-115 §1.1. Correção do usuário: *"a caixa
 * tem o objetivo dessa interação com o agente, onde se coloca input e interage
 * com o agente para passar contexto de projeto e tomar decisões que depois vão
 * derivar para as respectivas specs"*.
 */
describe("DocumentoScreen — a conversa que produz a spec (SPEC-115 fatia F)", () => {
  /**
   * O componente da conversa sai do DESENHO, não de uma prop própria: a lista
   * que a pessoa escolhe é a mesma que ela vê na figura acima. Duas listas
   * divergiriam, e a divergência seria um componente selecionável que não está
   * no desenho.
   */
  const desenho = {
    nodes: [{ id: "srv", type: "service", label: "srv-catalogo", status: "novo", spec: {}, specNA: {} }],
    edges: [],
  } as unknown as DocumentoDeDesenho["diagrama"];

  function comItemPendente(props: Partial<React.ComponentProps<typeof DocumentoScreen>> = {}) {
    return montar({
      documento: doc({ itens: [derivado("a")], diagrama: desenho }),
      itensEscritos: [escrito("a", { estado: "exportado", linkExterno: "https://tracker/a" })],
      onAnexarSpec: vi.fn(),
      onMudarSpecEscrita: vi.fn(),
      ...props,
    });
  }

  it("manda o contexto do projeto COLADO e o componente da conversa", () => {
    // *"parte pode ser nova e parte existente"* — o contexto é o que existe, e
    // o foco é o recorte do §1.1.1.
    const onConversarSobreASpec = vi.fn().mockResolvedValue(2);
    comItemPendente({ onConversarSobreASpec });

    fireEvent.change(screen.getByLabelText("Contexto do projeto"), {
      target: { value: "TABLE pedidos (id uuid)" },
    });
    fireEvent.change(screen.getByLabelText("Sobre qual componente"), { target: { value: "srv" } });
    fireEvent.click(screen.getByTestId("conversar-sobre-a-spec"));

    expect(onConversarSobreASpec).toHaveBeenCalledWith({ contextoDoProjeto: "TABLE pedidos (id uuid)", foco: "srv" });
  });

  it("componente novo conversa SEM contexto — metade de um desenho ainda não existe", () => {
    const onConversarSobreASpec = vi.fn().mockResolvedValue(1);
    comItemPendente({ onConversarSobreASpec });

    fireEvent.click(screen.getByTestId("conversar-sobre-a-spec"));

    expect(onConversarSobreASpec).toHaveBeenCalledWith({ contextoDoProjeto: "", foco: undefined });
  });

  it("o que volta é PROPOSTA, e a tela diz isso — aceitar é o próximo gesto, de gente", async () => {
    /**
     * É o que mantém a trava da SPEC-80 fatia D de pé com a conversa ligada: o
     * modelo não escreveu seção nenhuma, ele propôs decisões. Se a tela dissesse
     * "pronto", a pessoa acreditaria que a spec já afirma aquilo.
     */
    const onConversarSobreASpec = vi.fn().mockResolvedValue(2);
    comItemPendente({ onConversarSobreASpec });

    fireEvent.click(screen.getByTestId("conversar-sobre-a-spec"));

    const resposta = await screen.findByTestId("resposta-da-conversa");
    expect(resposta).toHaveTextContent("2 decisões propostas");
    expect(resposta).toHaveTextContent("valem depois que você aceitar");
  });

  it("zero propostas é resposta legítima, e a tela não finge que deu errado", async () => {
    // Desenho sem escolha real em aberto não deve produzir decisão inventada
    // para preencher cota — está no prompt, e a tela precisa concordar.
    const onConversarSobreASpec = vi.fn().mockResolvedValue(0);
    comItemPendente({ onConversarSobreASpec });

    fireEvent.click(screen.getByTestId("conversar-sobre-a-spec"));

    expect(await screen.findByTestId("resposta-da-conversa")).toHaveTextContent("lista vazia é resposta legítima");
  });

  it("sem com quem conversar, a caixa não aparece — e as seções seguem editáveis", () => {
    // A disciplina da SPEC-49: botão que falharia não se oferece.
    comItemPendente({ onConversarSobreASpec: undefined });

    expect(screen.queryByTestId("conversa-da-spec")).toBeNull();
    expect(screen.getByTestId("spec-origem")).toBeInTheDocument();
  });

  it("seção COM material derivado mostra o bloco e nomeia a fonte", () => {
    comItemPendente({
      julgamentoDerivado: { recusas: "- **Síncrono** — fora porque escolhemos Fila" },
    });

    expect(screen.getByTestId("spec-recusas-derivado")).toHaveTextContent("Síncrono");
    expect(screen.getByTestId("spec-recusas-origem")).toHaveTextContent("derivado das decisões aceitas");
  });

  it("o aviso conta as seções sem NADA de onde sair, e nomeia quais", () => {
    // O motivo do que vai acontecer, antes de acontecer: sem isto a pessoa
    // clica, espera, e recebe "ficaram de fora por ter lacuna" sem saber qual.
    // SPEC-119 fatia A — são QUATRO seções desde que `decisoes` entrou: o lado
    // escolhido da decisão passou a ter onde morar, e ele é a informação de
    // que quem implementa precisa (§2.1).
    comItemPendente({ julgamentoDerivado: { recusas: "- alguma coisa" } });

    const aviso = screen.getByTestId("spec-sem-julgamento");
    expect(aviso).toHaveTextContent("Faltam 3 seções");
    expect(aviso).toHaveTextContent("Quem pediu");
    expect(aviso).toHaveTextContent("O que já foi decidido");
    expect(aviso).not.toHaveTextContent("O que NÃO entra, e por quê");
  });

  it("com as quatro tendo de onde sair, a tela declara que a spec pode subir", () => {
    comItemPendente({
      julgamentoDerivado: {
        origem: "o time pediu",
        decisoes: "use Fila, porque desacopla",
        recusas: "síncrono ficou fora",
        fatias: "1. o item",
      },
    });

    expect(screen.getByTestId("spec-com-julgamento")).toBeInTheDocument();
    expect(screen.queryByTestId("spec-sem-julgamento")).toBeNull();
  });

  it("SPEC-119 fatia A — a seção das DECISÕES existe, e diz que deriva do lado escolhido", () => {
    /**
     * A assimetria que o §410 deixou: a alternativa descartada virava
     * `recusas`, e a ESCOLHIDA não ia a lugar nenhum. Um humano infere fila a
     * partir de "síncrono ficou fora"; um agente de código precisa do padrão
     * a usar, e inferi-lo é onde ele acerta plausivelmente e erra de fato.
     *
     * As duas seções derivam da MESMA decisão, e o rótulo de origem de cada
     * uma diz por qual lado — dizer só "derivado das decisões aceitas" nas
     * duas esconderia que elas não são a mesma informação.
     */
    comItemPendente({ julgamentoDerivado: { decisoes: "- **Transporte**: use **Fila** — porque desacopla." } });

    const secao = screen.getByTestId("spec-decisoes-derivado");
    expect(within(secao).getByText(/use \*\*Fila\*\*/)).toBeInTheDocument();
    expect(screen.getByText(/derivado das decisões aceitas, pelo lado escolhido/)).toBeInTheDocument();
  });

  it("texto de GENTE vence o derivado — e o bloco do motor sai da frente", () => {
    // SPEC-58 regra 3, na tela: o julgamento de alguém não divide espaço com a
    // derivação que ele substituiu, senão a seção diz duas coisas.
    comItemPendente({
      specEscrita: { recusas: "Migração do legado fica de fora: não há janela." },
      julgamentoDerivado: { recusas: "- **Síncrono** — fora porque escolhemos Fila" },
    });

    const secao = screen.getByTestId("spec-recusas");
    expect(within(secao).getByText(/Migração do legado/)).toBeInTheDocument();
    expect(screen.queryByTestId("spec-recusas-derivado")).toBeNull();
    expect(screen.getByTestId("spec-recusas-origem")).toHaveTextContent("escrito por uma pessoa");
  });
});

/**
 * SPEC-115 fatias E e G — **o pipeline por item, sobre estado persistido.**
 *
 * O que estes testes provam é que a tela LÊ o envio em vez de guardá-lo: em
 * nenhum deles alguém clica em "Anexar spec". Os itens simplesmente chegam com
 * o envio marcado — como chegariam depois de um F5 no meio de um envio de
 * minutos — e a tela mostra onde parou.
 */
describe("DocumentoScreen — o pipeline da spec (SPEC-115 fatias E e G)", () => {
  const noTracker = (chave: string, p: Partial<ItemGerado> = {}) =>
    escrito(chave, { estado: "exportado", linkExterno: `https://tracker/${chave}`, ...p });

  it("mostra onde parou SEM ninguém ter clicado — é a prova do F5", () => {
    montar({
      documento: doc({ itens: [derivado("a"), derivado("b", { numero: 2 }), derivado("c", { numero: 3 })] }),
      itensEscritos: [
        noTracker("a", { specAnexada: true }),
        noTracker("b", { specEnviadaEm: "2026-09-10T10:05:00.000Z" }),
        noTracker("c"),
      ],
    });

    expect(screen.getByTestId("pipeline-contagem")).toHaveTextContent("1 com a spec anexada");
    expect(screen.getByTestId("pipeline-contagem")).toHaveTextContent("1 anexando");
    expect(screen.getByTestId("pipeline-contagem")).toHaveTextContent("1 esperando");
    expect(screen.getByTestId("pipeline-contagem")).toHaveTextContent("de 3 itens no tracker");
  });

  it("diz em QUAL item está, com nome — não um spinner genérico", () => {
    // O §5 da SPEC-98 pede exatamente isto: com o pipeline do §3.2, dois itens
    // estão em pontos diferentes ao mesmo tempo, e a tela precisa mostrar isso.
    montar({
      documento: doc({ itens: [derivado("a")] }),
      itensEscritos: [noTracker("a", { titulo: "Criar o catálogo", specEnviadaEm: "2026-09-10T10:05:00.000Z" })],
    });

    expect(screen.getByTestId("spec-em-transito-a")).toHaveTextContent("Criar o catálogo");
  });

  it("a falha diz QUAL item e por quê, e o motivo veio do servidor — sobrevive ao recarregar", () => {
    montar({
      documento: doc({ itens: [derivado("a")] }),
      itensEscritos: [noTracker("a", { specErro: "o agente respondeu HTTP 500" })],
    });

    expect(screen.getByTestId("spec-falhou-a")).toHaveTextContent("o agente respondeu HTTP 500");
    expect(screen.getByTestId("pipeline-contagem")).toHaveTextContent("1 sem a spec");
  });

  it("NÃO existe barra de progresso no pipeline — a contagem real é a honestidade", () => {
    /**
     * A SPEC-98 §6 recusa "barra de progresso que estima sem dizer que estima".
     * Aqui não haveria como estimar: o tempo de cada item é do agente do outro
     * lado. Este teste é a trava — uma barra que aparecesse depois faria falhar.
     */
    montar({
      documento: doc({ itens: [derivado("a")] }),
      itensEscritos: [noTracker("a", { specEnviadaEm: "2026-09-10T10:05:00.000Z" })],
    });

    const pipeline = screen.getByTestId("pipeline-da-spec");
    expect(pipeline.querySelector("progress")).toBeNull();
    expect(pipeline.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("o botão de anexar some enquanto um envio está em curso — pedir de novo duplicaria", async () => {
    montar({
      documento: doc({ itens: [derivado("a")] }),
      itensEscritos: [noTracker("a", { specEnviadaEm: "2026-09-10T10:05:00.000Z" })],
      onAnexarSpec: vi.fn(),
    });

    expect(screen.getByTestId("anexar-spec")).toBeDisabled();
  });

  /**
   * SPEC-120 fatia F — **a animação calibrada para lote.**
   *
   * *"precisamos de animação em tela e que passe feedbacks sobre o upload de
   * forma não muito enjoativa"*. A régua da SPEC-85 §2 já era "movimento que
   * não carrega informação não entra"; o "não enjoativa" acrescenta a segunda:
   * **movimento que carrega informação também cansa, se repetir demais**.
   */
  describe("a animação com lote (SPEC-120 fatia F)", () => {
    function comNSpecsIndo(n: number) {
      const chaves = Array.from({ length: n }, (_, i) => `i${i}`);
      montar({
        documento: doc({ itens: chaves.map((c, i) => derivado(c, { numero: i + 1 })) }),
        itensEscritos: chaves.map((c, i) =>
          noTracker(c, { titulo: `Item ${i}`, specEnviadaEm: "2026-09-10T10:05:00.000Z" })
        ),
      });
      return chaves;
    }

    it("poucos itens continuam NOMEADOS — esconder um nome seria trocar informação por um clique", () => {
      comNSpecsIndo(3);

      expect(screen.getByTestId("spec-em-transito-i0")).toHaveTextContent("Item 0");
      expect(screen.queryByTestId("spec-em-transito-lote")).toBeNull();
    });

    it("um lote inteiro AGREGA — trinta linhas simultâneas são ruído com a mesma informação dentro", () => {
      comNSpecsIndo(5);

      expect(screen.getByTestId("spec-em-transito-lote")).toHaveTextContent("5 specs indo agora");
      // Os nomes não somem: ficam a um clique.
      expect(screen.queryByTestId("spec-em-transito-i0")).toBeNull();
    });

    it("e o detalhe está a um clique — agregar não é esconder", () => {
      comNSpecsIndo(5);

      fireEvent.click(screen.getByTestId("detalhar-em-transito"));

      expect(screen.getByTestId("spec-em-transito-i0")).toHaveTextContent("Item 0");
    });

    it("agregado, quem pulsa é a CONTAGEM — a lista inteira em movimento não aponta para nada", () => {
      /**
       * Ajuste 1 do §3.2: *"o pulso marca onde está acontecendo; a lista
       * inteira em movimento não marca nada"*.
       */
      comNSpecsIndo(5);

      expect(screen.getByTestId("spec-em-transito-lote").querySelector(".spec-em-transito")).not.toBeNull();
      fireEvent.click(screen.getByTestId("detalhar-em-transito"));
      expect(screen.getByTestId("spec-em-transito-i0")).not.toHaveClass("spec-em-transito");
    });

    it("o FIM é um evento — quem desviou o olhar precisa saber se acabou ou travou", () => {
      /**
       * Ajuste 3 do §3.2. Hoje a animação simplesmente parava, e parar é
       * exatamente o que travar também faz.
       */
      const { rerender } = montar({
        documento: doc({ itens: [derivado("a")] }),
        itensEscritos: [noTracker("a", { specEnviadaEm: "2026-09-10T10:05:00.000Z" })],
      });

      expect(screen.queryByTestId("envio-terminou")).toBeNull();

      rerender({
        documento: doc({ itens: [derivado("a")] }),
        itensEscritos: [noTracker("a", { specAnexada: true })],
      });

      expect(screen.getByTestId("envio-terminou")).toHaveTextContent("O envio terminou");
      expect(screen.getByTestId("envio-terminou")).toHaveTextContent("1 spec anexada");
    });

    it("quem ABRE a tela com tudo pronto não recebe aviso de fim — não acompanhou envio nenhum", () => {
      // "Terminou" é sobre algo que a pessoa viu começar. Anunciar o fim de um
      // envio de ontem seria informação sem dono.
      montar({
        documento: doc({ itens: [derivado("a")] }),
        itensEscritos: [noTracker("a", { specAnexada: true })],
      });

      expect(screen.queryByTestId("envio-terminou")).toBeNull();
    });
  });

  it("nenhum item no tracker ainda: nada de pipeline — “0 de 0” é ruído que ensina a ignorar", () => {
    montar({
      documento: doc({ itens: [derivado("a")] }),
      itensEscritos: [escrito("a")],
    });

    expect(screen.queryByTestId("pipeline-da-spec")).toBeNull();
  });

  it("o começo do envio diz quando é DEMONSTRAÇÃO — nada sai daqui, e a tela fala isso", async () => {
    // A recusa central da SPEC-115 §2: o mock não pode se passar pelo real.
    const onAnexarSpec = vi.fn().mockResolvedValue({
      emAndamento: ["a"],
      comLacuna: [],
      semLinkExterno: [],
      destino: "Agente de demonstração",
      demonstracao: true,
    });
    montar({
      documento: doc({ itens: [derivado("a")] }),
      itensEscritos: [noTracker("a")],
      onAnexarSpec,
    });

    fireEvent.click(screen.getByTestId("anexar-spec"));
    await waitFor(() => expect(onAnexarSpec).toHaveBeenCalled());

    const inicio = await screen.findByTestId("inicio-do-envio");
    expect(inicio).toHaveTextContent("1 spec(s) a caminho de Agente de demonstração");
    expect(inicio).toHaveTextContent("modo de demonstração — nada sai daqui");
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

/**
 * SPEC-69 §4.4 — o risco MEDIDO ao lado do risco escrito.
 *
 * Quem aprova o desenho lê esta seção. Até aqui ela só tinha o que alguém
 * digitou; agora tem também o que foi medido e assumido de propósito — que é
 * literalmente a definição da seção ("o que você está aceitando correr").
 */
describe("DocumentoScreen — riscos medidos (SPEC-69 fatia D)", () => {
  const ensaio = {
    id: "en1",
    nome: "Bureau degradado em pico",
    conclusao: "A resposta vai a 24 s — 4,8× acima do prazo de 5,0 s que o negócio pede.",
    motivo: "O parceiro não oferece SLA melhor.",
    autor: "ana@empresa.com",
    em: "2026-08-27T10:00:00.000Z",
    porque: "Fins de semana concentram 40% das solicitações.",
  };

  it("o bloco derivado aparece com a conclusão, quem assumiu e por quê", () => {
    montar({ ensaios: [ensaio] });

    const bloco = screen.getByTestId("risco-medido-en1");
    expect(bloco).toHaveTextContent("Bureau degradado em pico");
    expect(bloco).toHaveTextContent("4,8× acima do prazo");
    expect(bloco).toHaveTextContent("Assumido por ana@empresa.com");
    expect(bloco).toHaveTextContent("O parceiro não oferece SLA melhor.");
  });

  it("o texto de quem ESCREVEU continua editável e intacto ao lado do bloco", () => {
    // §4.4 — a garantia que impede o motor de comer a seção: os dois blocos
    // convivem, e o campo de texto segue sendo do humano.
    const { onMudarEscrito } = montar({
      ensaios: [ensaio],
      escrito: { riscos: "O time do bureau está sendo reestruturado." },
    });

    const secao = screen.getByTestId("secao-riscos");
    expect(within(secao).getByText(/reestruturado/)).toBeInTheDocument();
    /**
     * SPEC-115 fatia C — o selo mudou de TEXTO, não de função.
     *
     * Com um ensaio assumido, "escrito por uma pessoa" deixou de ser verdade
     * sobre a seção inteira — parte dela é derivada. O que a régua da SPEC-58
     * §7.2 exige continua valendo e é o que este teste guarda: **a barra
     * indigo continua marcando o que é de gente**, e ela agora diz de onde vem
     * o resto.
     */
    expect(within(secao).getByTestId("secao-riscos-origem")).toHaveTextContent(
      "derivado de 1 ensaio assumido — edite ou complemente"
    );

    fireEvent.click(within(secao).getByText(/reestruturado/));
    fireEvent.change(screen.getByLabelText("Riscos e o que pode dar errado"), { target: { value: "outro texto" } });
    expect(onMudarEscrito).toHaveBeenCalledWith(expect.objectContaining({ riscos: "outro texto" }));
  });

  it("diz qual decisão o ensaio sustenta, quando alguém anexou", () => {
    montar({ ensaios: [ensaio], decisaoDoEnsaio: () => "Chamar o bureau de forma síncrona" });

    expect(screen.getByTestId("risco-medido-en1")).toHaveTextContent(
      "Sustenta a decisão: Chamar o bureau de forma síncrona"
    );
  });

  it("sem ensaio assumido, a seção é a de antes — nenhuma caixa nova", () => {
    montar();

    expect(screen.queryByTestId("riscos-medidos")).toBeNull();
  });
});

/**
 * SPEC-73 fatia D — a aprovação diz quantas lacunas vão junto.
 *
 * A régua da SPEC é `aprovar com lacuna CONTADA é decisão; aprovar com lacuna
 * invisível é acidente`. E o cuidado que ela pede em voz alta é o §230: **não
 * bloquear**. Um documento com três lacunas declaradas pode ser aprovado de
 * propósito — o produto inteiro é construído sobre essa distinção.
 */
describe("DocumentoScreen — as lacunas na aprovação (SPEC-73 fatia D)", () => {
  it("mostra o número ao lado do selo quando há lacunas", () => {
    montar({ lacunas: 3 });

    expect(screen.getByTestId("lacunas-do-documento")).toHaveTextContent("3 lacunas no documento");
  });

  it("uma lacuna fala no singular — plural em cima de 1 é ruído que se aprende a ignorar", () => {
    montar({ lacunas: 1 });

    expect(screen.getByTestId("lacunas-do-documento")).toHaveTextContent("1 lacuna no documento");
  });

  it("sem lacuna, não diz nada — aviso que aparece sempre deixa de ser lido", () => {
    montar({ lacunas: 0 });

    expect(screen.queryByTestId("lacunas-do-documento")).toBeNull();
  });

  it("e NÃO bloqueia: aprovar continua a um clique, com lacuna ou sem (§230)", () => {
    const onMudarStatus = vi.fn();
    montar({ lacunas: 5, onMudarStatus });

    fireEvent.click(screen.getByTestId("status-documento"));
    fireEvent.click(screen.getByTestId("status-aprovado"));

    expect(onMudarStatus).toHaveBeenCalledWith("aprovado");
  });
});
