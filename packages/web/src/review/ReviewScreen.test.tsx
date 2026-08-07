import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  derivar,
  resolverDependencias,
  TEMPLATE_ESPECIFICACAO_PADRAO,
  type Diagrama,
  type DiagramaConfig,
  type RegrasConfig,
} from "@gerador/engine";
import { ReviewScreen } from "./ReviewScreen";
import { readFixture } from "../test-support/fixtures";
import type { EspecificacaoTemplate } from "../api/client";

const baixarArquivoTextoMock = vi.hoisted(() => vi.fn());
vi.mock("../persistence/baixarArquivo", () => ({ baixarArquivoTexto: baixarArquivoTextoMock }));

interface Fixture01 {
  quebra: { diagrama: Diagrama };
}

const config: DiagramaConfig = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
    rabbit: {
      label: "Fila Rabbit",
      derives: "queue",
      techs: ["Backend"],
      contextos: ["Backend-mensagens rabbitmq"],
      spec: [],
    },
  },
  edgeTypes: { publishes: { label: "publica" }, consumes: { label: "consome" } },
  edgeRules: {
    rabbit: { valid: ["publishes", "consumes"], default: "publishes" },
    service: { valid: ["publishes", "consumes"], default: "publishes" },
  },
};

const templateFixture: EspecificacaoTemplate = {
  id: "t1",
  timeId: "__global__",
  conteudo: TEMPLATE_ESPECIFICACAO_PADRAO,
  atualizadoEm: new Date().toISOString(),
};

const fixture = readFixture<Fixture01>("01-servico-novo-fila-consumo.json");

function resultadoFixture01() {
  const atividades = derivar(fixture.quebra.diagrama, config, {});
  return resolverDependencias(atividades);
}

describe("ReviewScreen — fixture 01 (sem ciclos/conflitos)", () => {
  it("lista todos os rótulos e não mostra aviso de ciclo/conflito", () => {
    const resultado = resultadoFixture01();
    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    for (const a of resultado.atividades) {
      expect(screen.getByText(a.rotulo)).toBeInTheDocument();
    }
    expect(screen.queryByText(/Ciclo:/)).not.toBeInTheDocument();
  });

  it("clicar no rótulo de uma atividade com nó de origem seleciona o nó e fecha a revisão", async () => {
    const resultado = resultadoFixture01();
    const onSelecionarNo = vi.fn();
    const onFechar = vi.fn();
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={onFechar}
        onSelecionarNo={onSelecionarNo}
      />
    );

    const atividadeDoN1 = resultado.atividades.find((a) => a.origem.nodeId === "n1")!;
    await user.click(screen.getByText(atividadeDoN1.rotulo));

    expect(onSelecionarNo).toHaveBeenCalledWith("n1");
    expect(onFechar).toHaveBeenCalled();
  });

  it("botão 'Gerar especificação de solução' baixa um único markdown com tudo", async () => {
    const resultado = resultadoFixture01();
    const user = userEvent.setup();
    baixarArquivoTextoMock.mockClear();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Gerar especificação de solução" }));

    expect(baixarArquivoTextoMock).toHaveBeenCalledOnce();
    const [conteudo, nomeArquivo, mime] = baixarArquivoTextoMock.mock.calls[0];
    expect(nomeArquivo).toBe("especificacao-de-solucao.md");
    expect(mime).toBe("text/markdown");
    expect(conteudo).toContain("## Itens");
    for (const a of resultado.atividades) {
      expect(conteudo).toContain(a.rotulo);
    }
  });
});

describe("ReviewScreen — revisão e especificação unificadas (expandir por item, sem copiar)", () => {
  const regras: RegrasConfig = {
    tipos: ["História", "Task", "Débito Técnico"],
    tamanhos: ["PP", "P", "M", "G"],
    porTech: {
      Backend: {
        requisitos: [
          { texto: "DLQ configurada e monitorada", tipo: "checklist", contextos: ["Backend-mensagens"] },
        ],
        testes: [],
      },
    },
  };

  it("item começa recolhido — especificação técnica só aparece depois de expandir", async () => {
    const resultado = resultadoFixture01();
    const user = userEvent.setup();
    const atividade = resultado.atividades[0];

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regras}
        especificacaoTemplate={templateFixture}
        demandInfo="Nova esteira de portabilidade."
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    const card = screen.getByTestId(`item-${atividade.chave}`);
    expect(within(card).queryByText(/Especificação técnica/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `expandir ${atividade.rotulo}` }));

    expect(within(card).getByText(/Especificação técnica/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `recolher ${atividade.rotulo}` })).toBeInTheDocument();
  });

  it("não existe botão de copiar — a única saída é o download do documento completo", () => {
    const resultado = resultadoFixture01();
    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regras}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    expect(screen.queryByText("copiar")).not.toBeInTheDocument();
  });
});

describe("ReviewScreen — coluna Times (default pro time da quebra, editável no nó)", () => {
  it("toda atividade mostra o time da quebra por padrão, sem destaque; só a que cruza outro time some com o destaque amarelo", () => {
    const atividades = derivar(fixture.quebra.diagrama, config, { time: "time-portabilidade" });
    const resultado = resolverDependencias(atividades);

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        time="time-portabilidade"
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    // n3 (srv-notificacao) é existente com time-pagamentos — a atividade e2::consume
    // cruza outro time de verdade; as demais só carregam o time da própria quebra.
    const atividadeSetup = resultado.atividades.find((a) => a.chave === "n1::setup")!;
    const cardSetup = screen.getByTestId(`item-${atividadeSetup.chave}`);
    expect(cardSetup.style.background).not.toBe("rgb(255, 251, 235)");

    const botaoTimePagamentos = screen.getByRole("button", { name: /time-pagamentos/ });
    expect(botaoTimePagamentos).toBeInTheDocument();
    const cardComOutroTime = botaoTimePagamentos.closest('[data-testid^="item-"]') as HTMLElement;
    expect(cardComOutroTime.style.background).toBe("rgb(255, 251, 235)");
  });

  it("clicar no time de um item leva pro nó de origem, igual clicar no rótulo", async () => {
    const atividades = derivar(fixture.quebra.diagrama, config, { time: "time-portabilidade" });
    const resultado = resolverDependencias(atividades);
    const onSelecionarNo = vi.fn();
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        time="time-portabilidade"
        onFechar={vi.fn()}
        onSelecionarNo={onSelecionarNo}
      />
    );

    await user.click(screen.getByRole("button", { name: /time-pagamentos/ }));
    expect(onSelecionarNo).toHaveBeenCalledWith("n3");
  });
});

describe("ReviewScreen — ciclo detectado", () => {
  it("mostra o caminho do ciclo e não permite derivar", () => {
    const atividadesCiclicas = [
      {
        chave: "a",
        rotulo: "01",
        tipo: "Task" as const,
        tamanho: "PP" as const,
        descricao: "a",
        techs: [],
        contextos: [],
        dependencias: [{ type: "dependent" as const, alvoChave: "b" }],
        origem: {},
      },
      {
        chave: "b",
        rotulo: "02",
        tipo: "Task" as const,
        tamanho: "PP" as const,
        descricao: "b",
        techs: [],
        contextos: [],
        dependencias: [{ type: "dependent" as const, alvoChave: "a" }],
        origem: {},
      },
    ];
    const resultado = resolverDependencias(atividadesCiclicas);

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={{ nodes: [], edges: [] }}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    expect(screen.getByText("Não é possível derivar ainda")).toBeInTheDocument();
    expect(screen.getByText(/Ciclo:/)).toBeInTheDocument();
  });
});
