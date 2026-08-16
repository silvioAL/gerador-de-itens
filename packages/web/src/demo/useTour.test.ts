import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Quebra } from "@gerador/engine";
import { useTour, passosDeConfiguracao, passosDoProduto, SEGUNDOS_PADRAO } from "./useTour";
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
  abrirDocumento: vi.fn(),
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

  it("§252 — o tour de CONFIGURAÇÃO percorre TODAS as telas de administração", () => {
    // O §236 dividiu os tours para o de produto não virar 25 passos com
    // metade de administração; a deriva desfez isso em sete passos, e o §252
    // devolveu. A lista aqui é a régua: tela de administração que não estiver
    // neste tour não está em nenhum.
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts, passosDeConfiguracao));

    act(() => result.current.iniciar());
    for (const [titulo, aba] of [
      ["Contexto do produto", "produtos"],
      ["Stacks conhecidas", "perfis"],
      ["Padrões por componente", "campos"],
      ["Campos por tipo de conexão", "camposAresta"],
      ["Regras de refinamento", "regras"],
      ["Modelos: documento e item", "especificacao"],
      ["Modelo de IA", "modeloIa"],
      ["Esteira de agentes", "pipeline"],
      ["Níveis e acessos", "membros"],
      ["Do item à issue", "exportacao"],
      ["Melhoria contínua (PDCA)", "pdca"],
    ] as const) {
      andarAte(result, titulo);
      expect(opts.abrirConfigNaAba).toHaveBeenCalledWith(aba);
    }
  });

  it("§252 — e o tour do PRODUTO não abre tela de configuração nenhuma", () => {
    // O outro lado da mesma régua: se um passo de administração vazar de volta
    // para cá, a divisão derrete de novo, um passo por vez.
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    for (let i = 0; i < 40 && result.current.ativo; i++) act(() => result.current.proximo());

    expect(opts.abrirConfigNaAba).not.toHaveBeenCalled();
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

  it("§257 — o documento tem UM passo, não dois", () => {
    // Havia "Especificação de solução" e "O documento de desenho" seguidos, e
    // o primeiro terminava anunciando o segundo. Dois passos sobre o mesmo
    // artefato num tour de vinte é desperdício — e lê como repetição.
    const titulos = passosDoProduto(montarOpts()).map((p) => p.titulo);

    expect(titulos).not.toContain("Especificação de solução");
    expect(titulos.filter((t) => t === "O documento de desenho")).toHaveLength(1);
    // E o que o passo removido tinha de próprio não se perdeu.
    const doc = passosDoProduto(montarOpts()).find((p) => p.titulo === "O documento de desenho");
    expect(doc?.texto).toMatch(/o agente oferece este documento sozinho/i);
  });

  it("§251 — o tour passa pela TELA do documento, e ela é aberta pelo passo", () => {
    // A lacuna que a avaliação do tour encontrou: a tela nova existia e o tour
    // não a mencionava. Capacidade que o tour não mostra não existe para quem
    // está avaliando a ferramenta (§244).
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "O documento de desenho");

    expect(result.current.passoAtual?.selector).toBe("[data-testid=documento-screen]");
    expect(opts.abrirDocumento).toHaveBeenCalled();
  });

  it("§251 — o passo do documento vem ANTES dos itens, e não derruba a derivação", () => {
    // `abrirDocumento` limpando `resultado` faria a tela de itens seguinte
    // abrir vazia — o §234 de novo. A ordem é parte do contrato.
    const titulos = passosDoProduto(montarOpts()).map((p) => p.titulo);

    expect(titulos.indexOf("O documento de desenho")).toBeGreaterThan(-1);
    expect(titulos.indexOf("O documento de desenho")).toBeLessThan(titulos.indexOf("Itens escritos"));
  });

  it("§251 — o passo que PEDE a decisão ao agente aponta o botão, com um nó selecionado", () => {
    // A proposta aparecia como dado (o ⏳); o ato de pedi-la, não. O botão vive
    // no painel do nó, então o passo precisa selecionar um.
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    andarAte(result, "Peça ao agente");

    expect(result.current.passoAtual?.selector).toBe("[data-testid=pedir-decisao-ao-agente]");
    expect(opts.selecionarNo).toHaveBeenCalledWith("n1");
  });

  it("§255 — o tour diz QUEM FAZ O QUÊ antes de mostrar qualquer tela", () => {
    // O tour mostrava o que a ferramenta faz sem nunca dizer quem faz. A
    // divisão motor × IA é a tese do produto, e vinha só implícita.
    const titulos = passosDoProduto(montarOpts()).map((p) => p.titulo);

    expect(titulos.indexOf("Quem faz o quê")).toBe(1);
    expect(titulos.indexOf("Quem faz o quê")).toBeLessThan(titulos.indexOf("O diagrama"));
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

    // §252 — os outros dois elos de espinha (contexto do produto e a saída
    // para o tracker) migraram para o tour de configuração, e são cobrados lá.
    andarAte(result, "O documento de desenho");
    expect(opts.abrirDocumento).toHaveBeenCalled();
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
    const { result } = renderHook(() => useTour(opts, passosDeConfiguracao));

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
  });

  it("passa por Padrões por componente e pelos Modelos (documento e item), abrindo a aba certa em cada um", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts, passosDeConfiguracao));

    act(() => result.current.iniciar());
    andarAte(result, "Padrões por componente");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("campos");

    // §252 — a ordem virou por ASSUNTO: o que os componentes declaram, as
    // réguas e os modelos, depois a IA, e só então pessoas e saída.
    andarAte(result, "Modelos: documento e item");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("especificacao");

    andarAte(result, "Níveis e acessos");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("membros");
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

/**
 * §252 — o tour ANDA SOZINHO.
 *
 * A demonstração automática existiu e foi removida no §243, porque ela e o
 * tour faziam a mesma coisa por dois caminhos. Isto não a traz de volta: traz
 * o comportamento dela para dentro do único mecanismo que sobrou.
 */
describe("useTour — o relógio (§252)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("avança sozinho depois do tempo do passo, sem ninguém clicar", () => {
    const { result } = renderHook(() => useTour(montarOpts()));
    act(() => result.current.iniciar());
    const primeiro = result.current.passoAtual?.titulo;

    act(() => void vi.advanceTimersByTime(result.current.duracao));

    expect(result.current.passoAtual?.titulo).not.toBe(primeiro);
  });

  it("cada passo dura o que ele pede — não um tempo único para todos", () => {
    // Passo de transição e a tela do documento montado não merecem o mesmo
    // tempo. Se todos durassem igual, o tour ou corre demais no que importa ou
    // se arrasta no que não importa.
    const passos = passosDoProduto(montarOpts());
    const duracoes = new Set(passos.map((p) => p.segundos ?? SEGUNDOS_PADRAO));

    expect(duracoes.size).toBeGreaterThan(1);
    expect(passos.find((p) => p.titulo === "O documento de desenho")?.segundos).toBeGreaterThan(SEGUNDOS_PADRAO);
  });

  it("pausado, o relógio não anda — por mais que se espere", () => {
    const { result } = renderHook(() => useTour(montarOpts()));
    act(() => result.current.iniciar());
    act(() => result.current.alternarPausa());
    const parado = result.current.passoAtual?.titulo;

    act(() => void vi.advanceTimersByTime(60_000));

    expect(result.current.passoAtual?.titulo).toBe(parado);
  });

  it("despausar RECOMEÇA o tempo do passo, em vez de o passo sumir na cara", () => {
    // Se o relógio continuasse de onde parou, quem pausa para ler perderia o
    // passo um segundo depois de voltar — que é pior do que não pausar.
    const { result } = renderHook(() => useTour(montarOpts()));
    act(() => result.current.iniciar());
    const duracao = result.current.duracao;

    act(() => void vi.advanceTimersByTime(duracao - 200));
    act(() => result.current.alternarPausa());
    const titulo = result.current.passoAtual?.titulo;
    act(() => result.current.alternarPausa());

    act(() => void vi.advanceTimersByTime(duracao - 200));
    expect(result.current.passoAtual?.titulo).toBe(titulo);

    act(() => void vi.advanceTimersByTime(400));
    expect(result.current.passoAtual?.titulo).not.toBe(titulo);
  });

  it("SEGURAR (ponteiro sobre a carta) para o relógio sem mexer na pausa", () => {
    // São dois estados de propósito: com um só, mover o mouse até o botão de
    // pausa já pausava e o clique DESPAUSAVA — o botão não funcionava, pelo
    // motivo mais difícil de enxergar.
    const { result } = renderHook(() => useTour(montarOpts()));
    act(() => result.current.iniciar());
    const titulo = result.current.passoAtual?.titulo;

    act(() => result.current.segurar(true));
    act(() => void vi.advanceTimersByTime(60_000));

    expect(result.current.passoAtual?.titulo).toBe(titulo);
    expect(result.current.pausado).toBe(false);

    act(() => result.current.segurar(false));
    act(() => void vi.advanceTimersByTime(result.current.duracao));
    expect(result.current.passoAtual?.titulo).not.toBe(titulo);
  });

  it("o tour termina sozinho ao fim do último passo", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts, () => passosDeConfiguracao(opts).slice(-1)));
    act(() => result.current.iniciar());

    act(() => void vi.advanceTimersByTime(60_000));

    expect(result.current.ativo).toBe(false);
  });
});

/**
 * §253 — ACHADO REAL, relatado com print: um chip "1 a decidir" que não sumia
 * por mais que a pessoa aceitasse a decisão.
 *
 * A causa não estava no aceite. Estava na SAÍDA do tour: `pular` não desligava
 * a demonstração, então `DECISOES_DO_TOUR` — que tem uma proposta — continuava
 * misturada aos dados reais de uma sessão real. E aceitar aquela proposta não
 * fazia nada, porque o aceite grava em `quebra.decisoes` e ela não vive lá.
 */
describe("useTour — a demonstração NUNCA sobrevive ao tour (§253)", () => {
  it("pular desliga a demonstração", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));
    act(() => result.current.iniciar());

    act(() => result.current.pular());

    expect(opts.ligarDemonstracao).toHaveBeenCalledWith(false);
  });

  it("chegar ao fim clicando também desliga", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));
    act(() => result.current.iniciar());
    for (let i = 0; i < 40 && result.current.ativo; i++) act(() => result.current.proximo());

    expect(result.current.ativo).toBe(false);
    expect(opts.ligarDemonstracao).toHaveBeenCalledWith(false);
  });

  it("pular NO MEIO — que é quando o defeito aparecia — também desliga", () => {
    // O último passo desligava no `onEnter`, e quem saía antes levava o dado
    // de demonstração junto. Passo pode não ser alcançado; saída sempre é.
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));
    act(() => result.current.iniciar());
    act(() => result.current.proximo());
    act(() => result.current.proximo());
    expect(opts.ligarDemonstracao).not.toHaveBeenCalledWith(false);

    act(() => result.current.pular());

    expect(opts.ligarDemonstracao).toHaveBeenCalledWith(false);
  });
});
