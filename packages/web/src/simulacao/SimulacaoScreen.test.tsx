import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CenarioDeLentidao, Diagrama, DiagramaConfig } from "@gerador/engine";
import { SimulacaoScreen } from "./SimulacaoScreen";

const config: DiagramaConfig = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
    external: {
      label: "API Externa",
      derives: "external",
      techs: ["Backend"],
      contextos: [],
      spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }],
    },
  },
  edgeTypes: {
    http: { label: "HTTP", espera: true, spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }] },
  },
  edgeRules: {},
};

function diagrama(): Diagrama {
  return {
    nodes: [
      { id: "api", type: "service", label: "api", x: 0, y: 0, status: "novo", spec: {}, specNA: {} },
      {
        id: "bureau",
        type: "external",
        label: "bureau",
        x: 0,
        y: 0,
        status: "novo",
        spec: { timeoutMs: { valor: 2000, origem: "manual" } },
        specNA: {},
      },
    ],
    edges: [
      {
        id: "e1",
        source: "api",
        target: "bureau",
        type: "http",
        spec: { timeoutMs: { valor: 1000, origem: "manual" } },
      },
    ],
  } as unknown as Diagrama;
}

function montar(cenarios: CenarioDeLentidao[] = [], props: Partial<React.ComponentProps<typeof SimulacaoScreen>> = {}) {
  const onMudar = vi.fn();
  render(
    <SimulacaoScreen
      diagrama={diagrama()}
      config={config}
      cenarios={cenarios}
      onMudar={onMudar}
      onVoltar={vi.fn()}
      {...props}
    />
  );
  return { onMudar };
}

/**
 * SPEC-66 fatias B, C e D — a bancada de ensaio.
 */
describe("SimulacaoScreen — a âncora e o Δ", () => {
  it("a linha de HOJE fica na tabela — sem a referência, todo número é solto", () => {
    montar();

    // 1000 (conexão) + 2000 (bureau) = 3000.
    expect(screen.getByTestId("linha-hoje")).toHaveTextContent("3,0 s");
  });

  it("o cenário mostra a resposta, o Δ contra hoje, e QUEM domina", () => {
    montar([
      { id: "c1", nome: "bureau 3×", origem: "manual", ajustes: [{ tipo: "no", id: "bureau", fator: 3 }] },
    ]);

    const linha = screen.getByTestId("linha-c1");
    // 1000 + 6000 = 7000, e o Δ é +4000.
    expect(linha).toHaveTextContent("7,0 s");
    expect(linha).toHaveTextContent("+4,0 s");
    // O total diz que dói; esta coluna diz onde.
    expect(linha).toHaveTextContent("bureau");
  });

  it("cenário que melhora aparece em VERDE e com sinal de menos", () => {
    montar([{ id: "c1", nome: "sla curto", origem: "manual", ajustes: [{ tipo: "no", id: "bureau", ms: 500 }] }]);

    // Hoje: 1000 (conexão) + 2000 (bureau) = 3000. Com o bureau em 500:
    // 1000 + 500 = 1500, então o Δ é −1,5 s.
    expect(screen.getByTestId("linha-c1")).toHaveTextContent("−1,5 s");
  });
});

describe("SimulacaoScreen — mexer sem IA nenhuma", () => {
  it("criar um cenário é escrever o nome e apertar — é o caminho principal", () => {
    // A sugestão é atalho; capacidade que só existe com IA ligada é capacidade
    // que metade dos times não tem.
    const { onMudar } = montar();

    fireEvent.change(screen.getByLabelText("Nome do cenário"), { target: { value: "Bureau degradado" } });
    fireEvent.click(screen.getByTestId("criar-cenario"));

    expect(onMudar).toHaveBeenCalledWith([
      expect.objectContaining({ id: "cen-bureau-degradado", nome: "Bureau degradado", origem: "manual" }),
    ]);
  });

  it("o slider muda o fator, e é o que faz o número acompanhar o gesto", () => {
    const { onMudar } = montar([
      { id: "c1", nome: "x", origem: "manual", ajustes: [{ tipo: "no", id: "bureau", fator: 2 }] },
    ]);

    fireEvent.click(screen.getByTestId("ajustar-c1"));
    fireEvent.change(screen.getByTestId("fator-bureau"), { target: { value: "5" } });

    expect(onMudar).toHaveBeenCalledWith([
      expect.objectContaining({ ajustes: [{ tipo: "no", id: "bureau", fator: 5, ms: undefined }] }),
    ]);
  });

  it("sem tempo nenhum no desenho, DIZ isso — melhor que uma tabela de zeros", () => {
    // §248: uma tabela de zeros pareceria medição, e não é.
    render(
      <SimulacaoScreen
        diagrama={{ nodes: [], edges: [] } as unknown as Diagrama}
        config={config}
        cenarios={[]}
        onMudar={vi.fn()}
        onVoltar={vi.fn()}
      />
    );

    expect(screen.getByTestId("simulacao-sem-tempo")).toBeInTheDocument();
  });
});

describe("SimulacaoScreen — a proposta do modelo", () => {
  const sugerido: CenarioDeLentidao = {
    id: "c-ia",
    nome: "bureau em pico",
    porque: "fim de mês concentra consulta",
    origem: "sugerido",
    aceito: false,
    ajustes: [{ tipo: "no", id: "bureau", fator: 4 }],
  };

  it("chega MARCADO como sugerido e desmarcado — proposta não vira fato", () => {
    // Regra 2 da SPEC-57: inferir é grátis e erra, e modelo não é exceção.
    montar([sugerido]);

    const linha = screen.getByTestId("linha-c-ia");
    expect(linha).toHaveTextContent("sugerido");
    expect(within(linha).getByTestId("aceitar-c-ia")).toBeInTheDocument();
  });

  it("o porquê vem junto — nome bonito sem circunstância ninguém sabe avaliar", () => {
    montar([sugerido]);

    expect(screen.getByTestId("linha-c-ia")).toHaveTextContent("fim de mês concentra consulta");
  });

  it("aceitar tira o convite, e o cenário passa a ser do time", () => {
    const { onMudar } = montar([sugerido]);

    fireEvent.click(screen.getByTestId("aceitar-c-ia"));

    expect(onMudar).toHaveBeenCalledWith([expect.objectContaining({ id: "c-ia", aceito: true })]);
  });

  it("sem quem sugira, o botão não aparece — e a tela segue inteira", () => {
    montar();

    expect(screen.queryByTestId("sugerir-cenarios")).toBeNull();
    expect(screen.getByTestId("criar-cenario")).toBeInTheDocument();
  });

  it("falha ao sugerir vira MOTIVO na tela, não botão inerte", () => {
    montar([], { onSugerir: () => Promise.reject(new Error("nenhum modelo configurado")) });

    fireEvent.click(screen.getByTestId("sugerir-cenarios"));

    return screen.findByTestId("erro-sugestao").then((el) => {
      expect(el).toHaveTextContent("nenhum modelo configurado");
    });
  });
});

describe("SimulacaoScreen — o desenho mudou debaixo do cenário", () => {
  it("ajuste sem alvo é DECLARADO, não engolido", () => {
    // §57 — um ensaio que ignorou parte do que lhe pediram tem que dizer,
    // senão o número mente por omissão.
    montar([{ id: "c1", nome: "velho", origem: "manual", ajustes: [{ tipo: "no", id: "sumiu", fator: 3 }] }]);

    expect(screen.getByTestId("sem-alvo-c1")).toHaveTextContent("não existem mais no desenho");
  });
});
