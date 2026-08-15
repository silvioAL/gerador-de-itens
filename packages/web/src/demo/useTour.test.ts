import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Quebra } from "@gerador/engine";
import { useTour, passosDeConfiguracao, passosDoProduto } from "./useTour";
import type { Cenario } from "./scenarios";

const cenarioMongo: Cenario = {
  id: "mongo",
  titulo: "Dados não-relacionais",
  descricao: "Coleção Mongo nova.",
  tipos: ["service", "mongo"],
  categoria: "demo",
  designPatterns: [],
  quebra: { diagrama: { nodes: [], edges: [] } } as Quebra,
};

function montarOpts() {
  return {
    cenarios: [cenarioMongo],
    carregarCenario: vi.fn(),
    selecionarNo: vi.fn(),
    derivarQuebra: vi.fn(),
    fecharRevisao: vi.fn(),
    abrirConfigNaAba: vi.fn(),
    fecharJornada: vi.fn(),
    fecharConfig: vi.fn(),
    abrirItens: vi.fn(),
    fecharItens: vi.fn(),
    abrirProposito: vi.fn(),
    fecharAssistente: vi.fn(),
    abrirConversa: vi.fn(),
    ligarDemonstracao: vi.fn(),
  };
}

describe("useTour", () => {
  it("começa inativo", () => {
    const { result } = renderHook(() => useTour(montarOpts()));
    expect(result.current.ativo).toBe(false);
    expect(result.current.passoAtual).toBeNull();
  });

  it("iniciar() ativa o tour, carrega o cenário do tour (recebido por parâmetro, não importado) e limpa seleção/revisão", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());

    expect(result.current.ativo).toBe(true);
    expect(result.current.indice).toBe(0);
    expect(opts.carregarCenario).toHaveBeenCalledWith(cenarioMongo.quebra);
    expect(opts.selecionarNo).toHaveBeenCalledWith(null);
    expect(opts.fecharRevisao).toHaveBeenCalled();
  });

  it("sem o cenário 'mongo' na lista recebida, iniciar() não quebra (só não carrega nada)", () => {
    const opts = { ...montarOpts(), cenarios: [] };
    const { result } = renderHook(() => useTour(opts));

    expect(() => act(() => result.current.iniciar())).not.toThrow();
    expect(opts.carregarCenario).not.toHaveBeenCalled();
  });

  /** Andar até o passo pelo TÍTULO, não por contagem: passo novo no meio do
   * tour (e eles entram a cada rodada) invalidava um índice fixo, e o teste
   * quebrava sem que nada de errado tivesse acontecido. */
  function andarAte(result: { current: ReturnType<typeof useTour> }, titulo: string) {
    for (let i = 0; i < 30 && result.current.passoAtual?.titulo !== titulo; i++) {
      act(() => result.current.proximo());
    }
    expect(result.current.passoAtual?.titulo).toBe(titulo);
  }

  it("avança até o passo que seleciona o nó do painel de propriedades", () => {
    // Por TÍTULO, não por contagem: estes dois testes ainda andavam por índice
    // e quebraram quando o passo do propósito (SPEC-57) entrou no meio — que é
    // exatamente o que o comentário do helper acima previa.
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "Proveniência");

    expect(opts.selecionarNo).toHaveBeenCalledWith("n2");
    expect(result.current.passoAtual?.selector).toBe("[data-tour=properties-panel]");
  });

  it("avança até o passo de revisão e chama derivarQuebra", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "Revisão");

    expect(opts.derivarQuebra).toHaveBeenCalled();
    expect(result.current.passoAtual?.selector).toBe("[data-tour=review-table]");
  });

  it("§236 — o tour de CONFIGURAÇÃO percorre as quatro telas que faltavam", () => {
    // As quatro que a medição do §234 apontou e que não cabiam no tour do
    // produto sem diluí-lo.
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts, passosDeConfiguracao));

    act(() => result.current.iniciar());
    for (const [titulo, aba] of [
      ["Modelo de IA", "modeloIa"],
      ["Esteira de agentes", "pipeline"],
      ["Regras de refinamento", "regras"],
      ["Campos por tipo de conexão", "camposAresta"],
    ] as const) {
      andarAte(result, titulo);
      expect(opts.abrirConfigNaAba).toHaveBeenCalledWith(aba);
    }
  });

  it("§236 — os dois tours são LISTAS diferentes, não o mesmo com filtro", () => {
    // Se um passo do produto vazasse para o tour de configuração, quem só quer
    // configurar levaria a derivação inteira junto.
    const opts = montarOpts();
    const produto = passosDoProduto(opts).map((p) => p.titulo);
    const config = passosDeConfiguracao(opts).map((p) => p.titulo);

    expect(produto).toContain("Derivar");
    expect(config).not.toContain("Derivar");
    expect(config).toContain("Modelo de IA");
    expect(produto).not.toContain("Modelo de IA");
  });

  it("§245 — o passo da CONFORMIDADE existe e fecha o assistente antes", () => {
    // Ele aponta para o chip no topo; a janela flutuante aberta do passo
    // anterior o cobriria (terceira aparição da armadilha, §221/§232/§233).
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "O padrão do time, conferido");

    expect(result.current.passoAtual?.selector).toBe("[data-testid=conformidade-resumo]");
    expect(opts.fecharAssistente).toHaveBeenCalled();
  });

  it("§248 — o passo do PERCURSO existe, aponta o 🛣 e fecha o assistente antes", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "O caminho, não só os componentes");

    expect(result.current.passoAtual?.selector).toBe("[data-testid=percursos-resumo]");
    // Sexta aparição da armadilha (§221/§232/§233/§245/§246). Já não é azar:
    // a janela do assistente cobre a faixa do placar, ponto.
    expect(opts.fecharAssistente).toHaveBeenCalled();
  });

  it("§246 — o passo da DECISÃO existe, aponta o 🧭 e fecha o assistente antes", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "Por que este desenho é assim");

    expect(result.current.passoAtual?.selector).toBe("[data-testid=decisoes-resumo]");
    // Quinta aparição da armadilha (§221/§232/§233/§245): o passo aponta um
    // chip no topo, e a janela flutuante do passo anterior o cobriria.
    expect(opts.fecharAssistente).toHaveBeenCalled();
  });

  it("§235 — os três passos de espinha estão no tour, na ordem de uso", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    // A conversa vem ANTES do diagrama: é a porta de entrada real, e o tour
    // antes começava com o desenho já pronto, pulando como ele nasce.
    andarAte(result, "Começar conversando");
    expect(opts.abrirConversa).toHaveBeenCalled();

    andarAte(result, "Contexto do produto");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("produtos");

    andarAte(result, "Do item à issue");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("exportacao");
  });

  it("§235 — a demonstração LIGA no primeiro dado falso e DESLIGA no fim", () => {
    // A regra que impede o pior efeito colateral: dado de demonstração que
    // sobrevive ao tour vira configuração fantasma na tela de quem for usar
    // de verdade.
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "Começar conversando");
    expect(opts.ligarDemonstracao).toHaveBeenCalledWith(true);

    andarAte(result, "Fim do tour");
    expect(opts.ligarDemonstracao).toHaveBeenLastCalledWith(false);
  });

  it("SPEC-57 — o tour mostra o PROPÓSITO, e o painel fecha antes do passo seguinte", () => {
    // O passo abre a janela flutuante; o seguinte usa o painel de
    // propriedades, que ela cobriria. Fechar não é detalhe de estilo.
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "Para que serve cada componente");

    expect(opts.abrirProposito).toHaveBeenCalled();
    expect(result.current.passoAtual?.selector).toBe("[data-testid=proposito-resumo]");

    andarAte(result, "Proveniência");
    expect(opts.fecharAssistente).toHaveBeenCalled();
  });

  it("passa pela aba Stacks conhecidas, abrindo a tela de config na aba certa", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "Stacks conhecidas");

    expect(result.current.passoAtual?.selector).toBe("[data-tour=config-screen-content]");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("perfis");
  });

  it("SPEC-48 — o tour mostra a revisão em lote, os ITENS ESCRITOS e o PDCA (o que nasceu depois dele)", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "Confirmar o que a IA escreveu");
    expect(result.current.passoAtual?.selector).toBe("[data-testid=barra-pendencias]");

    andarAte(result, "Itens escritos");
    expect(opts.abrirItens).toHaveBeenCalled();

    andarAte(result, "Melhoria contínua (PDCA)");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("pdca");
  });

  it("passa por Padrões por componente e pelos Modelos (documento e item), abrindo a aba certa em cada um", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "Padrões por componente");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("campos");

    // SPEC-38 — o passo de autorizações entra ANTES dos modelos.
    andarAte(result, "Níveis e acessos");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("membros");

    andarAte(result, "Modelos: documento e item");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("especificacao");
  });

  it("chegar ao último passo marca ultimo=true, fecha a tela de config, e avançar dele encerra o tour e fecha a revisão", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    const total = result.current.total;
    for (let i = 0; i < total - 1; i++) act(() => result.current.proximo());

    expect(result.current.ultimo).toBe(true);
    expect(opts.fecharConfig).toHaveBeenCalled();
    opts.fecharRevisao.mockClear();

    act(() => result.current.proximo());

    expect(result.current.ativo).toBe(false);
    expect(opts.fecharRevisao).toHaveBeenCalled();
  });

  it("pular() encerra o tour em qualquer passo e fecha a modal da jornada, se estiver aberta", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    act(() => result.current.proximo());
    act(() => result.current.pular());

    expect(result.current.ativo).toBe(false);
    expect(result.current.passoAtual).toBeNull();
    expect(opts.fecharJornada).toHaveBeenCalled();
  });
});
