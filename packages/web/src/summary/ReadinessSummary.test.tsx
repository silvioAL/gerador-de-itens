import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Diagrama, DiagramaConfig, RegrasConfig } from "@gerador/engine";
import { ReadinessSummary } from "./ReadinessSummary";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: [],
      contextos: [],
      spec: [{ key: "nome", label: "Nome do serviço", type: "text", required: true }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

function diagramaComDoisVermelhosEUmVerde(): Diagrama {
  return {
    nodes: [
      { id: "n1", type: "service", status: "novo", label: "srv-a", x: 0, y: 0, spec: {}, specNA: {} },
      { id: "n2", type: "service", status: "novo", label: "srv-b", x: 0, y: 0, spec: {}, specNA: {} },
      {
        id: "n3",
        type: "service",
        status: "novo",
        label: "srv-c",
        x: 0,
        y: 0,
        spec: { nome: { valor: "srv-c", origem: "manual" } },
        specNA: {},
      },
    ],
    edges: [],
  };
}

describe("ReadinessSummary", () => {
  it("popover da contagem começa fechado e abre ao clicar no badge, mostrando o campo que falta", async () => {
    const user = userEvent.setup();
    render(
      <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={vi.fn()} />
    );

    expect(screen.queryByText("srv-a")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /vermelho/i }));

    expect(screen.getByText("srv-a")).toBeInTheDocument();
    expect(screen.getByText("srv-b")).toBeInTheDocument();
    // Os dois nós vermelhos compartilham o mesmo campo obrigatório em aberto.
    expect(screen.getAllByText("Nome do serviço")).toHaveLength(2);
  });

  it("clicar num item da lista seleciona o nó e fecha o popover", async () => {
    const user = userEvent.setup();
    const onSelecionar = vi.fn();
    render(
      <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={onSelecionar} />
    );

    await user.click(screen.getByRole("button", { name: /vermelho/i }));
    await user.click(screen.getByText("srv-a"));

    expect(onSelecionar).toHaveBeenCalledWith("n1");
    expect(screen.queryByText("srv-b")).not.toBeInTheDocument();
  });

  it("clicar fora do popover fecha ele", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={vi.fn()} />
        <button>fora</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: /vermelho/i }));
    expect(screen.getByText("srv-a")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "fora" }));
    expect(screen.queryByText("srv-a")).not.toBeInTheDocument();
  });

  it('"Próximo pendente" cicla pelos nós vermelho/amarelo, um a cada clique, voltando ao início ao esgotar', async () => {
    const user = userEvent.setup();
    const onSelecionar = vi.fn();
    render(
      <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={onSelecionar} />
    );

    const botaoProximo = screen.getByRole("button", { name: /Próximo pendente \(2\)/ });
    await user.click(botaoProximo);
    await user.click(botaoProximo);
    await user.click(botaoProximo);

    expect(onSelecionar.mock.calls.map((c) => c[0])).toEqual(["n1", "n2", "n1"]);
  });

  it("sem nenhum nó pendente, não mostra o botão Próximo pendente", () => {
    const diagrama: Diagrama = {
      nodes: [
        {
          id: "n1",
          type: "service",
          status: "novo",
          label: "srv-a",
          x: 0,
          y: 0,
          spec: { nome: { valor: "srv-a", origem: "manual" } },
          specNA: {},
        },
      ],
      edges: [],
    };
    render(<ReadinessSummary diagrama={diagrama} config={config} onSelecionar={vi.fn()} />);

    expect(screen.queryByText(/Próximo pendente/)).not.toBeInTheDocument();
  });
});

/**
 * SPEC-57 fatia A — a dimensão PROPÓSITO na mesma barra.
 * A medida aparece onde a decisão é tomada (SPEC-56 §0.8), não numa aba de
 * relatório: é por isso que ela mora aqui e não numa tela nova.
 */
describe("ReadinessSummary — a dimensão propósito", () => {
  it("sem necessidade declarada, o indicador NÃO aparece", () => {
    // Dimensão nova não pode acusar quem nunca a usou.
    render(
      <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={() => {}} />
    );
    expect(screen.queryByTestId("proposito-resumo")).not.toBeInTheDocument();
  });

  it("necessidade sem componente aparece contada, e o clique leva onde se resolve", async () => {
    const user = userEvent.setup();
    const onAbrirProposito = vi.fn();
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={config}
        onSelecionar={() => {}}
        necessidades={[
          { id: "r1", texto: "sem ninguém", origem: "manual", atendidaPor: [] },
          { id: "r2", texto: "coberta", origem: "manual", atendidaPor: ["n1"] },
        ]}
        onAbrirProposito={onAbrirProposito}
      />
    );

    const chip = screen.getByTestId("proposito-resumo");
    expect(chip).toHaveTextContent("1 sem componente");

    await user.click(chip);
    expect(onAbrirProposito).toHaveBeenCalled();
  });

  it("com tudo coberto, o indicador diz isso em vez de sumir", () => {
    // Sumir faria parecer que a dimensão não existe; dizer "coberto" é o que
    // dá crédito ao trabalho de ligar.
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={config}
        onSelecionar={() => {}}
        necessidades={[{ id: "r1", texto: "coberta", origem: "manual", atendidaPor: ["n1"] }]}
      />
    );
    expect(screen.getByTestId("proposito-resumo")).toHaveTextContent("propósito coberto");
  });

  it("necessidade sugerida e não confirmada não conta como lacuna", () => {
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={config}
        onSelecionar={() => {}}
        necessidades={[{ id: "r1", texto: "sugerida", origem: "sugerido", atendidaPor: [] }]}
      />
    );
    expect(screen.getByTestId("proposito-resumo")).toHaveTextContent("propósito coberto");
  });
});

/**
 * §239 — a dimensão CONFORMIDADE: quais padrões este desenho viola.
 * Terceira dimensão na mesma barra (completude, propósito, conformidade) — a
 * medida aparece onde a decisão é tomada, não numa aba de relatório.
 */
describe("ReadinessSummary — a dimensão conformidade", () => {
  // O `config` do topo tem `techs: []`, então nenhuma regra por tech casaria —
  // conformidade precisa de tech no tipo de nó, é assim que a régua liga.
  const configComTech: DiagramaConfig = {
    ...config,
    nodeTypes: { ...config.nodeTypes, service: { ...config.nodeTypes.service, techs: ["Backend"] } },
  };

  const regrasComPadrao: RegrasConfig = {
    tipos: ["História"],
    tamanhos: ["P"],
    porTech: {
      Backend: {
        checklistTecnico: [
          {
            texto: "Timeout de chamada externa",
            contextos: [],
            checagem: { campo: "nome", operador: "eq", valor: "esperado" },
          },
        ],
        testes: [],
      },
    },
  };

  it("sem regras, o indicador NÃO aparece — quem não declarou padrão não é acusado", () => {
    render(
      <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={() => {}} />
    );
    expect(screen.queryByTestId("conformidade-resumo")).not.toBeInTheDocument();
  });

  it("com padrão violado, o chip abre a LISTA — e dali se chega ao nó", async () => {
    // §242 — o chip deixou de navegar direto: número sozinho não ensina nada,
    // e é na lista que mora o porquê do padrão e a válvula para contrariá-lo.
    const user = userEvent.setup();
    const onSelecionarViolacao = vi.fn();
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={configComTech}
        onSelecionar={() => {}}
        regras={regrasComPadrao}
        onSelecionarViolacao={onSelecionarViolacao}
      />
    );

    await user.click(screen.getByTestId("conformidade-resumo"));
    const lista = screen.getByTestId("conformidade-lista");
    // O primeiro botão da entrada é o que leva ao nó (o rótulo com o valor).
    await user.click(within(lista).getAllByRole("button")[0]);
    expect(onSelecionarViolacao).toHaveBeenCalled();
  });

  it("§242 — a lista mostra o PORQUÊ do padrão", async () => {
    const user = userEvent.setup();
    const comPorque: RegrasConfig = {
      ...regrasComPadrao,
      porTech: {
        Backend: {
          checklistTecnico: [
            {
              ...regrasComPadrao.porTech.Backend.checklistTecnico[0],
              porque: "Veio do incidente de cobrança dupla.",
            },
          ],
          testes: [],
        },
      },
    };
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={configComTech}
        onSelecionar={() => {}}
        regras={comPorque}
      />
    );

    await user.click(screen.getByTestId("conformidade-resumo"));
    expect(screen.getByText(/incidente de cobrança dupla/)).toBeInTheDocument();
  });

  it("§242 — aceitar de propósito exige motivo, e devolve a violação com ele", async () => {
    const user = userEvent.setup();
    const onAceitarViolacao = vi.fn();
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={configComTech}
        onSelecionar={() => {}}
        regras={regrasComPadrao}
        onAceitarViolacao={onAceitarViolacao}
      />
    );

    await user.click(screen.getByTestId("conformidade-resumo"));
    await user.click(screen.getAllByRole("button", { name: /Aceitar de propósito/ })[0]);

    // Sem motivo não registra: exceção sem justificativa é só o vermelho
    // desligado, que é o que a regra 3 existe para impedir.
    const confirmar = screen.getAllByRole("button", { name: /Confirmar exceção/ })[0];
    expect(confirmar).toBeDisabled();

    await user.type(screen.getAllByLabelText(/Motivo para aceitar/)[0], "o parceiro não suporta menos");
    await user.click(confirmar);

    expect(onAceitarViolacao).toHaveBeenCalledWith(
      expect.objectContaining({ campo: "nome" }),
      "o parceiro não suporta menos"
    );
  });

  it("§242 — violação com exceção sai do placar", () => {
    const { rerender } = render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={configComTech}
        onSelecionar={() => {}}
        regras={regrasComPadrao}
      />
    );
    expect(screen.getByTestId("conformidade-resumo")).toBeInTheDocument();

    rerender(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={configComTech}
        onSelecionar={() => {}}
        regras={regrasComPadrao}
        excecoes={[{ noId: "n3", campo: "nome", motivo: "m", autor: "a", em: "2026-01-01T00:00:00.000Z" }]}
      />
    );
    expect(screen.queryByTestId("conformidade-resumo")).not.toBeInTheDocument();
  });

  it("SPEC-57 fatia C — sem decisão nenhuma o indicador 🧭 não existe", () => {
    // Mesma disciplina do propósito e da conformidade: dimensão nova não acusa
    // quem nunca a usou.
    render(<ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={() => {}} />);

    expect(screen.queryByTestId("decisoes-resumo")).not.toBeInTheDocument();
  });

  it("o chip cobra o que falta, não o volume: proposta pendente e decisão sem porquê", async () => {
    // Contar decisões premiaria quem escreve muitas — que é exatamente como
    // repositório de ADR vira cemitério.
    const user = userEvent.setup();
    const base = {
      noId: "n1",
      alternativas: [{ titulo: "A" }, { titulo: "B", consequencia: "acopla ao legado" }],
      escolhida: "A",
      origem: "manual" as const,
      autor: "a",
      em: "2026-01-01T00:00:00.000Z",
    };
    const { rerender } = render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={config}
        onSelecionar={() => {}}
        decisoes={[{ ...base, id: "d1", titulo: "Fila em vez de síncrono", porque: "desacopla", status: "aceita" }]}
      />
    );
    expect(screen.getByTestId("decisoes-resumo")).toHaveTextContent("1 decisões");

    rerender(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={config}
        onSelecionar={() => {}}
        decisoes={[
          { ...base, id: "d1", titulo: "Fila em vez de síncrono", porque: "", status: "aceita" },
          { ...base, id: "d2", titulo: "Cache antes do bureau", porque: "corta latência", status: "proposta" },
        ]}
      />
    );
    // Proposta primeiro: ela espera uma PESSOA, e é a que trava a regra 2.
    expect(screen.getByTestId("decisoes-resumo")).toHaveTextContent("1 a decidir");

    await user.click(screen.getByTestId("decisoes-resumo"));
    const lista = screen.getByTestId("decisoes-lista");
    expect(within(lista).getByText(/refazer a análise/)).toBeInTheDocument();
    // O descartado também aqui: esta lista é onde se lê "por que este desenho
    // é assim" de uma vez só, e resposta sem o rejeitado é meia resposta.
    // As duas decisões deste caso compartilham as mesmas alternativas — uma
    // por decisão listada é o esperado.
    expect(within(lista).getAllByText(/acopla ao legado/)).toHaveLength(2);
  });

  it("apagar o nó decidido faz a decisão aparecer como órfã, não sumir", async () => {
    const user = userEvent.setup();
    const decisoes = [
      {
        id: "d1",
        noId: "nao-existe-mais",
        titulo: "Fila em vez de síncrono",
        alternativas: [{ titulo: "A" }, { titulo: "B" }],
        escolhida: "A",
        porque: "desacopla",
        status: "aceita" as const,
        origem: "manual" as const,
        autor: "a",
        em: "2026-01-01T00:00:00.000Z",
      },
    ];
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={config}
        onSelecionar={() => {}}
        decisoes={decisoes}
      />
    );

    await user.click(screen.getByTestId("decisoes-resumo"));
    expect(within(screen.getByTestId("decisoes-lista")).getByText(/não existe mais no desenho/)).toBeInTheDocument();
  });
});

/**
 * SPEC-69 §4.1 — o ensaio COBRA no placar, marcado com o nome.
 *
 * A inversão que dá nome à SPEC, e que veio do usuário: *"na realidade todo
 * ensaio cobra"*. Antes disto, um ensaio que ninguém olhou não aparecia em
 * lugar nenhum fora da bancada — o débito inconsciente seguia inconsciente.
 */
describe("ReadinessSummary — o ensaio que ainda cobra", () => {
  const configComTempo: DiagramaConfig = {
    nodeTypes: {
      externo: {
        label: "API Externa",
        derives: "external",
        techs: [],
        contextos: [],
        spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }],
      },
      service: { label: "Serviço", derives: "service", techs: [], contextos: [], spec: [] },
    },
    edgeTypes: { http: { label: "HTTP", espera: true, spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }] } },
    edgeRules: {},
  };

  const desenho = (): Diagrama =>
    ({
      nodes: [
        { id: "api", type: "service", status: "novo", label: "api", x: 0, y: 0, spec: {}, specNA: {} },
        {
          id: "bureau",
          type: "externo",
          status: "novo",
          label: "bureau",
          x: 0,
          y: 0,
          spec: { timeoutMs: { valor: 2000, origem: "manual" } },
          specNA: {},
        },
      ],
      edges: [
        { id: "e1", source: "api", target: "bureau", type: "http", spec: { timeoutMs: { valor: 300, origem: "manual" } } },
      ],
    }) as unknown as Diagrama;

  const pico = (estado?: "por-avaliar" | "em-revisao" | "aceito") => [
    {
      id: "cen-pico",
      nome: "Black Friday",
      origem: "manual" as const,
      estado,
      ajustes: [{ tipo: "no" as const, id: "bureau", ms: 24000 }],
    },
  ];

  // `atendidaPor` é obrigatório em `Necessidade` — a lacuna se mede por ele.
  const prazo = [{ id: "nec1", texto: "aprovar na hora", limiteMs: 5000, atendidaPor: [], origem: "manual" as const }];

  it("o ensaio por avaliar entra no chip, e a frase diz que é CONDICIONAL", async () => {
    render(
      <ReadinessSummary
        diagrama={desenho()}
        config={configComTempo}
        onSelecionar={vi.fn()}
        necessidades={prazo}
        cenarios={pico()}
      />
    );

    const chip = screen.getByTestId("conformidade-resumo");
    expect(chip).toHaveTextContent("1 fora do padrão");

    await userEvent.click(chip);
    const lista = screen.getByTestId("conformidade-lista");
    // A marca com o nome do ensaio é o que impede o placar de confundir *o que
    // é* com *o que seria*.
    expect(lista).toHaveTextContent("Sob “Black Friday”");
    expect(lista).toHaveTextContent("acima do prazo de 5,0 s");
    expect(lista).toHaveTextContent(/Condicional/);
  });

  it("assumido, sai do chip — e o chip some quando não sobra mais nada", () => {
    render(
      <ReadinessSummary
        diagrama={desenho()}
        config={configComTempo}
        onSelecionar={vi.fn()}
        necessidades={prazo}
        cenarios={pico("aceito")}
      />
    );

    expect(screen.queryByTestId("conformidade-resumo")).not.toBeInTheDocument();
  });

  it("clicar na linha leva à BANCADA — o gesto de assumir mora junto da evidência", async () => {
    // §4.0 — assumir exige motivo e vira registro com autor e data. Oferecer
    // isso aqui, longe do número, seria convidar a silenciar sem ler.
    const onSimular = vi.fn();
    render(
      <ReadinessSummary
        diagrama={desenho()}
        config={configComTempo}
        onSelecionar={vi.fn()}
        necessidades={prazo}
        cenarios={pico()}
        onSimular={onSimular}
      />
    );

    await userEvent.click(screen.getByTestId("conformidade-resumo"));
    await userEvent.click(screen.getByText(/Sob “Black Friday”/));

    expect(onSimular).toHaveBeenCalled();
  });

  it("sem prazo declarado, o ensaio não cobra nada — ninguém prometeu nada", () => {
    render(<ReadinessSummary diagrama={desenho()} config={configComTempo} onSelecionar={vi.fn()} cenarios={pico()} />);

    expect(screen.queryByTestId("conformidade-resumo")).not.toBeInTheDocument();
  });
});

/**
 * §307 — a contradição de resiliência chega ao PLACAR da mesa.
 *
 * A SPEC-68 §4.1 dizia que saturação e insistência vão ao chip ⚖ *"com o porquê
 * e a válvula da exceção, como toda violação desde o §239"*. Medido no §306:
 * `avaliarResiliencia` só era chamada na bancada de ensaios — quem estava
 * DESENHANDO não via a contradição que o desenho de hoje já tem, e a bancada é
 * onde se pergunta "e se", não "como está".
 */
describe("ReadinessSummary — a contradição de resiliência no placar", () => {
  const configComTempo: DiagramaConfig = {
    nodeTypes: {
      service: {
        label: "Serviço",
        derives: "service",
        techs: [],
        contextos: [],
        spec: [{ key: "chamadasSimultaneas", label: "Chamadas simultâneas", type: "number" }],
      },
      externo: { label: "API Externa", derives: "external", techs: [], contextos: [], spec: [] },
    },
    edgeTypes: {
      http: { label: "HTTP", espera: true, spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }] },
    },
    edgeRules: {},
  };

  /** srv (pool 10) →http(1000ms)→ bureau. 100 req/s × 1 s = 100 simultâneas. */
  const desenho = (): Diagrama =>
    ({
      nodes: [
        {
          id: "srv",
          type: "service",
          status: "novo",
          label: "srv-credito",
          x: 0,
          y: 0,
          spec: { chamadasSimultaneas: { valor: 10, origem: "manual" } },
          specNA: {},
        },
        { id: "bureau", type: "externo", status: "novo", label: "bureau", x: 0, y: 0, spec: {}, specNA: {} },
      ],
      edges: [
        { id: "e1", source: "srv", target: "bureau", type: "http", spec: { timeoutMs: { valor: 1000, origem: "manual" } } },
      ],
    }) as unknown as Diagrama;

  const volume = { quantidade: 100, por: "segundo" as const };

  it("a saturação entra no chip da MESA, com a conta e o porquê", async () => {
    render(
      <ReadinessSummary
        diagrama={desenho()}
        config={configComTempo}
        onSelecionar={vi.fn()}
        volumetria={volume}
      />
    );

    const chip = screen.getByTestId("conformidade-resumo");
    expect(chip).toHaveTextContent("1 fora do padrão");

    await userEvent.click(chip);
    const lista = screen.getByTestId("conformidade-lista");
    expect(lista).toHaveTextContent("100 necessárias");
    expect(lista).toHaveTextContent("10 chamadas simultâneas");
    // O porquê é a CONTA, não uma opinião — é o que separa ensinar de cobrar.
    expect(lista).toHaveTextContent(/Lei de Little/);
  });

  it("aceitar de propósito EXIGE motivo, como toda violação desde o §239", async () => {
    const onAceitarContradicao = vi.fn();
    render(
      <ReadinessSummary
        diagrama={desenho()}
        config={configComTempo}
        onSelecionar={vi.fn()}
        volumetria={volume}
        onAceitarContradicao={onAceitarContradicao}
      />
    );

    await userEvent.click(screen.getByTestId("conformidade-resumo"));
    await userEvent.click(screen.getByRole("button", { name: /Aceitar de propósito/ }));
    // Sem motivo isto seria um botão de silenciar, e a próxima pessoa a abrir o
    // documento não saberia se foi decisão ou cansaço.
    expect(screen.getByRole("button", { name: /Confirmar exceção/ })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Motivo para aceitar/), "o pico dura 2h/mês");
    await userEvent.click(screen.getByRole("button", { name: /Confirmar exceção/ }));

    expect(onAceitarContradicao).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "saturacao", noId: "srv" }),
      "o pico dura 2h/mês"
    );
  });

  it("aceita, sai do vermelho — e o chip some quando não sobra mais nada", () => {
    render(
      <ReadinessSummary
        diagrama={desenho()}
        config={configComTempo}
        onSelecionar={vi.fn()}
        volumetria={volume}
        excecoes={[
          { noId: "srv", campo: "", contradicao: "saturacao", motivo: "assumido", autor: "ana", em: "2026-01-01" },
        ]}
      />
    );

    expect(screen.queryByTestId("conformidade-resumo")).not.toBeInTheDocument();
  });

  it("sem volume nem taxa declarada, não acusa — a conta não se faz (§248)", () => {
    render(<ReadinessSummary diagrama={desenho()} config={configComTempo} onSelecionar={vi.fn()} />);

    expect(screen.queryByTestId("conformidade-resumo")).not.toBeInTheDocument();
  });
});
