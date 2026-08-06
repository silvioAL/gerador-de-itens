import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Aresta, DiagramaConfig, FieldSpec, No, PerfilTime } from "@gerador/engine";
import { useQuebra } from "../state/useQuebra";
import { PropertiesPanel } from "./PropertiesPanel";
import { readFixture } from "../test-support/fixtures";

interface CasoFixture {
  nome: string;
  contexto: { no: No; arestas: Aresta[] };
  esperado: { camposVisiveis?: string[] };
}
interface FixtureRabbit {
  specDoTipo: FieldSpec[];
  casos: CasoFixture[];
}

const fixture = readFixture<FixtureRabbit>("rabbit.json");

const config: DiagramaConfig = {
  nodeTypes: {
    rabbit: {
      label: "Fila Rabbit",
      derives: "queue",
      techs: ["Backend"],
      contextos: ["Backend-mensagens rabbitmq"],
      spec: fixture.specDoTipo,
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

const labelPorChave = Object.fromEntries(fixture.specDoTipo.map((c) => [c.key, c.label]));

/** Renderiza o painel com estado real (useQuebra), igual ao App.tsx faz — não mocka a reatividade. */
function Harness({ caso }: { caso: CasoFixture }) {
  const quebraState = useQuebra(
    { diagrama: { nodes: [caso.contexto.no], edges: caso.contexto.arestas } },
    config
  );
  const no = quebraState.quebra.diagrama.nodes[0];
  return (
    <PropertiesPanel
      no={no}
      arestas={quebraState.quebra.diagrama.edges}
      config={config}
      quebraState={quebraState}
    />
  );
}

describe("PropertiesPanel — dirigido pela mesma fixture do engine (fixtures/rabbit.json)", () => {
  it("mostra exatamente os campos de 'aresta de consumo faz aparecer dlq e ordenacao'", () => {
    const caso = fixture.casos.find((c) => c.nome === "aresta de consumo faz aparecer dlq e ordenacao")!;
    render(<Harness caso={caso} />);

    for (const chave of caso.esperado.camposVisiveis!) {
      expect(screen.getByText(labelPorChave[chave])).toBeInTheDocument();
    }
    expect(screen.queryByText(labelPorChave.dlxName)).not.toBeInTheDocument();
  });

  it("marcar 'Possui DLQ?' revela dlxName e retryStrategy sem round-trip", async () => {
    const caso = fixture.casos.find((c) => c.nome === "aresta de consumo faz aparecer dlq e ordenacao")!;
    const user = userEvent.setup();
    render(<Harness caso={caso} />);

    expect(screen.queryByText(labelPorChave.dlxName)).not.toBeInTheDocument();

    const dlqCheckbox = screen.getByRole("checkbox", { name: labelPorChave.dlq });
    await user.click(dlqCheckbox);

    expect(screen.getByText(labelPorChave.dlxName)).toBeInTheDocument();
    expect(screen.getByText(labelPorChave.retryStrategy)).toBeInTheDocument();
  });

  it("N/A sem motivo mantém o erro visível", async () => {
    const caso = fixture.casos.find((c) => c.nome === "N/A sem motivo é inválido e não resolve o campo")!;
    render(<Harness caso={caso} />);

    expect(screen.getByText(/N\/A precisa de um motivo/)).toBeInTheDocument();
  });

  it("campo com permiteNA=false não mostra o botão de marcar N/A", () => {
    const caso = fixture.casos.find((c) => c.nome === "fila sem consumo — só campos base ficam visíveis")!;
    render(<Harness caso={caso} />);

    // "ack" é o único campo visível com permiteNA:false neste caso.
    const linhaAck = screen.getByText(labelPorChave.ack).closest("div")!.parentElement!;
    expect(linhaAck).not.toHaveTextContent("marcar N/A");
  });
});

describe("PropertiesPanel — perfil de stack do time", () => {
  const configService: DiagramaConfig = {
    nodeTypes: {
      service: {
        label: "Serviço",
        derives: "service",
        techs: ["Backend"],
        contextos: [],
        spec: [{ key: "linguagem", label: "Linguagem/Stack", type: "text", required: false }],
      },
    },
    edgeTypes: {},
    edgeRules: {},
  };
  const perfil: PerfilTime = { service: { linguagem: "Java" } };

  function HarnessServico({
    perfilDoTime,
    time,
    onSalvarPerfilDoTime,
  }: {
    perfilDoTime?: PerfilTime;
    time?: string;
    onSalvarPerfilDoTime?: (tipoNo: string, valores: Record<string, unknown>) => void;
  }) {
    const quebraState = useQuebra(
      {
        diagrama: {
          nodes: [{ id: "n1", type: "service", x: 0, y: 0, label: "srv", status: "novo", spec: {}, specNA: {} }],
          edges: [],
        },
      },
      configService
    );
    const no = quebraState.quebra.diagrama.nodes[0];
    return (
      <PropertiesPanel
        no={no}
        arestas={[]}
        config={configService}
        quebraState={quebraState}
        perfilDoTime={perfilDoTime}
        time={time}
        onSalvarPerfilDoTime={onSalvarPerfilDoTime}
      />
    );
  }

  it("sem perfil, não há sugestão para um campo sem default", () => {
    render(<HarnessServico />);
    expect(screen.queryByText(/usar sugestão/)).not.toBeInTheDocument();
  });

  it("com perfil do time, sugere o valor conhecido e aceitar grava como manual", async () => {
    const user = userEvent.setup();
    render(<HarnessServico perfilDoTime={perfil} />);

    const botaoSugestao = screen.getByText("usar sugestão: Java");
    expect(botaoSugestao).toBeInTheDocument();

    await user.click(botaoSugestao);

    expect(screen.queryByText(/usar sugestão/)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Java")).toBeInTheDocument();
    expect(screen.getByText("manual", { exact: true })).toBeInTheDocument();
  });

  it("sem time definido, mostra a dica de onde configurar em vez do botão de capturar perfil", () => {
    render(<HarnessServico />);
    expect(screen.getByText(/Sem time definido nesta quebra/)).toBeInTheDocument();
    expect(screen.queryByText(/salvar estes valores como padrão do time/)).not.toBeInTheDocument();
  });

  it("com time definido e um campo preenchido manualmente, captura o perfil do time ao clicar", async () => {
    const user = userEvent.setup();
    const onSalvarPerfilDoTime = vi.fn();
    render(<HarnessServico time="time-x" onSalvarPerfilDoTime={onSalvarPerfilDoTime} />);

    expect(screen.queryByText(/salvar estes valores como padrão do time/)).not.toBeInTheDocument();

    const campo = screen.getByRole("textbox", { name: "Linguagem/Stack" });
    await user.type(campo, "Kotlin");

    const botao = screen.getByText("💾 salvar estes valores como padrão do time «time-x»");
    await user.click(botao);

    expect(onSalvarPerfilDoTime).toHaveBeenCalledWith("service", { linguagem: "Kotlin" });
  });
});

describe("PropertiesPanel — campo textarea (contrato/payload) com expandir", () => {
  const configTextarea: DiagramaConfig = {
    nodeTypes: {
      mongo: {
        label: "Coleção Mongo",
        derives: "datastore",
        techs: ["Backend"],
        contextos: [],
        spec: [
          {
            key: "schemaDocumento",
            label: "Schema do documento (campos e tipos)",
            type: "textarea",
            required: false,
            permiteNA: true,
          },
        ],
      },
    },
    edgeTypes: {},
    edgeRules: {},
  };

  function HarnessTextarea() {
    const quebraState = useQuebra(
      {
        diagrama: {
          nodes: [{ id: "n1", type: "mongo", x: 0, y: 0, label: "produtos", status: "novo", spec: {}, specNA: {} }],
          edges: [],
        },
      },
      configTextarea
    );
    const no = quebraState.quebra.diagrama.nodes[0];
    return <PropertiesPanel no={no} arestas={[]} config={configTextarea} quebraState={quebraState} />;
  }

  it("renderiza como textarea (multi-linha), não como input de uma linha", () => {
    render(<HarnessTextarea />);
    const campo = screen.getByRole("textbox", { name: "Schema do documento (campos e tipos)" });
    expect(campo.tagName).toBe("TEXTAREA");
  });

  it("digitar no textarea pequeno grava o valor com origem manual", async () => {
    const user = userEvent.setup();
    render(<HarnessTextarea />);

    const campo = screen.getByRole("textbox", { name: "Schema do documento (campos e tipos)" });
    await user.type(campo, "sku: string, nome: string");

    expect(screen.getByDisplayValue("sku: string, nome: string")).toBeInTheDocument();
    expect(screen.getByText("manual", { exact: true })).toBeInTheDocument();
  });

  it("botão de expandir abre um modal (role dialog) com o mesmo valor, editável, e fecha sem perder o texto", async () => {
    const user = userEvent.setup();
    render(<HarnessTextarea />);

    const campo = screen.getByRole("textbox", { name: "Schema do documento (campos e tipos)" });
    await user.type(campo, "valor inicial");

    await user.click(screen.getByRole("button", { name: "Expandir Schema do documento (campos e tipos)" }));

    const dialogo = screen.getByRole("dialog", { name: "Schema do documento (campos e tipos)" });
    const campoExpandido = within(dialogo).getByRole("textbox", { name: /expandido/ });
    expect(campoExpandido).toHaveValue("valor inicial");

    await user.type(campoExpandido, " e mais texto");
    expect(campoExpandido).toHaveValue("valor inicial e mais texto");

    await user.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(campo).toHaveValue("valor inicial e mais texto");
  });
});
