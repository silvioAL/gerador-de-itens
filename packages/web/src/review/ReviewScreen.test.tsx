import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

// Mockado pra não depender do modelo real (mesma disciplina do resto do
// projeto) — testa só o contrato: o que a aba Refinamento manda pra
// apiIa.sugerir (botão manual, por placeholder) / apiIa.sugerirItem
// (orquestração ao vivo, por item — Fase 1d-ii) e o que faz com a resposta.
// `status` default "não pronto" — sem isso a orquestração ao vivo (Fase 1d)
// dispararia sozinha em todo teste que não testa exatamente esse
// comportamento.
const apiIaSugerirMock = vi.hoisted(() => vi.fn());
const apiIaSugerirItemMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const apiIaStatusMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ chatInstalado: false, embeddingInstalado: false, pronto: false, caminhoModelos: "" })
);
vi.mock("../api/client", () => ({
  apiIa: { sugerir: apiIaSugerirMock, sugerirItem: apiIaSugerirItemMock, status: apiIaStatusMock },
}));

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
  it("lista todos os rótulos na lista de itens, e não mostra aviso de ciclo/conflito", () => {
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

  it("nenhum item selecionado inicialmente — ficha mostra estado vazio", () => {
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

    expect(screen.getByText(/Selecione um item na lista/)).toBeInTheDocument();
  });

  it("clicar num item da lista seleciona e mostra a ficha (aba Especificação por padrão)", async () => {
    const resultado = resultadoFixture01();
    const user = userEvent.setup();
    const atividade = resultado.atividades[0];

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

    await user.click(screen.getByTestId(`item-${atividade.chave}`));

    expect(screen.getByRole("button", { name: "Especificação" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contrato" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refinamento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Testes" })).toBeInTheDocument();
    expect(screen.getByText(atividade.descricao)).toBeInTheDocument();
  });

  it("clicar no título da ficha (item selecionado) leva pro nó de origem e fecha a revisão", async () => {
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
    await user.click(screen.getByTestId(`item-${atividadeDoN1.chave}`));
    await user.click(screen.getByRole("button", { name: atividadeDoN1.rotulo }));

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

  it("não existe botão de copiar — a única saída é o download do documento completo", () => {
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

    expect(screen.queryByText("copiar")).not.toBeInTheDocument();
  });
});

describe("ReviewScreen — abas da ficha (Fase 1d-i, SPEC-23 — dado estruturado, montarFichaItem)", () => {
  const regras: RegrasConfig = {
    tipos: ["História", "Task", "Débito Técnico"],
    tamanhos: ["PP", "P", "M", "G"],
    porTech: {
      Backend: {
        checklistTecnico: [{ texto: "DLQ configurada e monitorada", contextos: ["Backend-mensagens"] }],
        testes: [],
      },
    },
  };

  function atividadeComPlaceholder(resultado: ReturnType<typeof resultadoFixture01>) {
    return resultado.atividades.find(
      (a) => a.techs.includes("Backend") && a.contextos.some((c) => c.includes("Backend-mensagens"))
    )!;
  }

  async function selecionarEIrPraAba(user: ReturnType<typeof userEvent.setup>, chave: string, aba: string) {
    await user.click(screen.getByTestId(`item-${chave}`));
    await user.click(screen.getByRole("button", { name: aba }));
  }

  it("aba Contrato: tipo de nó sem campos configurados mostra mensagem clara, não quebra", async () => {
    const resultado = resultadoFixture01();
    const user = userEvent.setup();
    const atividade = resultado.atividades.find((a) => a.origem.nodeId === "n1")!;

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

    await selecionarEIrPraAba(user, atividade.chave, "Contrato");

    expect(screen.getByText("Nenhum campo aplicável.")).toBeInTheDocument();
  });

  it("aba Refinamento: requisito sem resposta mostra campo + botão Sugerir; história/critérios contextuais sempre aparecem primeiro (Fase 1d-ii, SPEC-23)", async () => {
    const resultado = resultadoFixture01();
    const atividade = atividadeComPlaceholder(resultado);
    const user = userEvent.setup();

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

    await selecionarEIrPraAba(user, atividade.chave, "Refinamento");

    expect(screen.getByText("DLQ configurada e monitorada")).toBeInTheDocument();
    expect(screen.getByText("História de usuário")).toBeInTheDocument();
    expect(screen.getByText("Critérios de aceite (cenários contextuais)")).toBeInTheDocument();
    const linhaDlq = screen.getByTestId(`placeholder-Backend::DLQ configurada e monitorada`);
    expect(within(linhaDlq).getByRole("button", { name: "✨ Sugerir" })).toBeInTheDocument();
  });

  it("clicar Sugerir chama apiIa.sugerir, preenche o campo e avisa via onResponderItem (sugerido, não confirmado)", async () => {
    apiIaSugerirMock.mockResolvedValueOnce({ valor: "sim, via política X no tópico Y" });
    const resultado = resultadoFixture01();
    const atividade = atividadeComPlaceholder(resultado);
    const onResponderItem = vi.fn();
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regras}
        especificacaoTemplate={templateFixture}
        onResponderItem={onResponderItem}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await selecionarEIrPraAba(user, atividade.chave, "Refinamento");
    const linhaDlq = screen.getByTestId(`placeholder-Backend::DLQ configurada e monitorada`);
    await user.click(within(linhaDlq).getByRole("button", { name: "✨ Sugerir" }));

    expect(apiIaSugerirMock).toHaveBeenCalledWith(
      expect.objectContaining({ tech: "Backend", rotulo: "DLQ configurada e monitorada" }),
      expect.anything()
    );
    expect(await within(linhaDlq).findByDisplayValue("sim, via política X no tópico Y")).toBeInTheDocument();
    expect(onResponderItem).toHaveBeenCalledWith(
      atividade.chave,
      "Backend::DLQ configurada e monitorada",
      { valor: "sim, via política X no tópico Y", origem: "sugerido", confirmado: false }
    );
  });

  it("Sugerir manda demandInfo + anexosContexto como contextoEpico (Fase 1b, SPEC-23)", async () => {
    apiIaSugerirMock.mockResolvedValueOnce({ valor: "sim, via política X" });
    const resultado = resultadoFixture01();
    const atividade = atividadeComPlaceholder(resultado);
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regras}
        especificacaoTemplate={templateFixture}
        demandInfo="Épico: reduzir tempo de aprovação de crédito."
        anexosContexto={[{ nome: "retro.md", conteudo: "Retro: SLA estourava por falta de dado do bureau." }]}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await selecionarEIrPraAba(user, atividade.chave, "Refinamento");
    const linhaDlq = screen.getByTestId(`placeholder-Backend::DLQ configurada e monitorada`);
    await user.click(within(linhaDlq).getByRole("button", { name: "✨ Sugerir" }));

    expect(apiIaSugerirMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contextoEpico: expect.stringContaining("Épico: reduzir tempo de aprovação de crédito."),
      }),
      expect.anything()
    );
    const [pedido] = apiIaSugerirMock.mock.calls.at(-1)!;
    expect(pedido.contextoEpico).toContain("Retro: SLA estourava por falta de dado do bureau.");
  });

  it("Sugerir mostra o texto sendo escrito em pedaços, não só o resultado final de uma vez (Fase 1c, SPEC-23)", async () => {
    // Promise controlada manualmente — sem timer de teste arbitrário: chama
    // onPedaco com o primeiro pedaço, deixa pendente até o teste confirmar o
    // intermediário no DOM, só então resolve com o texto final.
    let resolverPromise!: (v: { valor: string }) => void;
    const promisePendente = new Promise<{ valor: string }>((resolve) => {
      resolverPromise = resolve;
    });
    apiIaSugerirMock.mockImplementationOnce((_pedido: unknown, onPedaco?: (p: string) => void) => {
      onPedaco?.("sim, via");
      return promisePendente;
    });
    const resultado = resultadoFixture01();
    const atividade = atividadeComPlaceholder(resultado);
    const user = userEvent.setup();

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

    await selecionarEIrPraAba(user, atividade.chave, "Refinamento");
    const linhaDlq = screen.getByTestId(`placeholder-Backend::DLQ configurada e monitorada`);
    await user.click(within(linhaDlq).getByRole("button", { name: "✨ Sugerir" }));

    // O pedaço intermediário aparece no campo antes do texto final completo.
    expect(await within(linhaDlq).findByDisplayValue("sim, via")).toBeInTheDocument();
    resolverPromise({ valor: "sim, via política X" });
    expect(await within(linhaDlq).findByDisplayValue("sim, via política X")).toBeInTheDocument();
  });

  it("clicar Confirmar chama onResponderItem com origem manual", async () => {
    const resultado = resultadoFixture01();
    const atividade = atividadeComPlaceholder(resultado);
    const onResponderItem = vi.fn();
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regras}
        especificacaoTemplate={templateFixture}
        onResponderItem={onResponderItem}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await selecionarEIrPraAba(user, atividade.chave, "Refinamento");
    const linhaDlq = screen.getByTestId(`placeholder-Backend::DLQ configurada e monitorada`);
    await user.type(within(linhaDlq).getByPlaceholderText("Resposta manual, ou clique em Sugerir"), "sim, via TTL de 7 dias");
    await user.click(within(linhaDlq).getByRole("button", { name: "Confirmar" }));

    expect(onResponderItem).toHaveBeenCalledWith(
      atividade.chave,
      "Backend::DLQ configurada e monitorada",
      { valor: "sim, via TTL de 7 dias", origem: "manual" }
    );
  });

  it("achado real: resposta já confirmada aparece como texto fixo, sem campo de edição nem botão Sugerir", async () => {
    const resultado = resultadoFixture01();
    const atividade = atividadeComPlaceholder(resultado);
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regras}
        especificacaoTemplate={templateFixture}
        respostasItens={{
          [atividade.chave]: {
            "Backend::DLQ configurada e monitorada": { valor: "sim, via TTL de 7 dias", origem: "manual" },
          },
        }}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await selecionarEIrPraAba(user, atividade.chave, "Refinamento");

    const linhaDlq = screen.getByTestId(`placeholder-Backend::DLQ configurada e monitorada`);
    expect(within(linhaDlq).getByText("sim, via TTL de 7 dias")).toBeInTheDocument();
    expect(within(linhaDlq).queryByRole("button", { name: "✨ Sugerir" })).not.toBeInTheDocument();
  });

  it("aba Testes mostra mensagem clara quando não há regra de teste pra combinação", async () => {
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
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await selecionarEIrPraAba(user, atividade.chave, "Testes");

    expect(screen.getByText("Sem regra de teste pra esta combinação.")).toBeInTheDocument();
  });
});

describe("ReviewScreen — geração ao vivo (Fase 1d-ii, SPEC-23 — orquestração real por item via /ia/sugerir-item)", () => {
  beforeEach(() => {
    apiIaStatusMock.mockReset();
    apiIaStatusMock.mockResolvedValue({ chatInstalado: false, embeddingInstalado: false, pronto: false, caminhoModelos: "" });
    apiIaSugerirItemMock.mockReset();
    apiIaSugerirItemMock.mockResolvedValue({});
  });

  // Fixture 01 tem 3 atividades cujo tech/contexto batem com essa regra
  // (n2::criacao, e1::publish, e2::consume — todas Backend + Backend-mensagens),
  // o suficiente pra fila ter mais de um item mesmo com uma regra só (Fase
  // 1d-ii: a fila agora é por ATIVIDADE, não por placeholder — cada item já
  // bundla história de usuário + critérios de aceite + esse checklist junto).
  const regrasUmPlaceholder: RegrasConfig = {
    tipos: [],
    tamanhos: [],
    porTech: {
      Backend: {
        checklistTecnico: [{ texto: "DLQ configurada e monitorada", contextos: ["Backend-mensagens"] }],
        testes: [],
      },
    },
  };

  function atividadeComPlaceholder(resultado: ReturnType<typeof resultadoFixture01>) {
    return resultado.atividades.find(
      (a) => a.techs.includes("Backend") && a.contextos.some((c) => c.includes("Backend-mensagens"))
    )!;
  }

  it("modelo pronto: dispara sozinho, mostra a barra de fase, segue o item automaticamente e mostra 'gerando a ficha inteira'", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    let liberar!: () => void;
    apiIaSugerirItemMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          liberar = () => resolve({});
        })
    );
    const resultado = resultadoFixture01();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regrasUmPlaceholder}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    expect(await screen.findByText(/Escrevendo item 1 de \d+/)).toBeInTheDocument();
    // Segue o item automaticamente pra aba Refinamento, sem clique nenhum do usuário
    // (o auto-follow reage num efeito separado, após o commit que liga a
    // orquestração — por isso `findByText`, não `getByText`, dá tempo pro
    // segundo render acontecer mesmo numa máquina de CI mais lenta).
    expect(await screen.findByText("● Seguindo a geração")).toBeInTheDocument();
    // Sem streaming campo a campo (Fase 1d-ii: a resposta chega tudo de uma
    // vez via GBNF) — enquanto pendente, mostra um indicador estático, não
    // texto crescendo caractere a caractere.
    expect(await screen.findAllByText("✨ gerando a ficha inteira…")).not.toHaveLength(0);

    liberar();
    await waitFor(() => expect(screen.queryByText(/Escrevendo item/)).not.toBeInTheDocument());
  });

  it("modelo não pronto: não dispara sozinho, tela fica no comportamento manual de sempre", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: false, embeddingInstalado: false, pronto: false, caminhoModelos: "" });
    const resultado = resultadoFixture01();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regrasUmPlaceholder}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await waitFor(() => expect(apiIaStatusMock).toHaveBeenCalled());
    expect(screen.queryByText(/Escrevendo item/)).not.toBeInTheDocument();
    expect(apiIaSugerirItemMock).not.toHaveBeenCalled();
  });

  it("Pausar interrompe antes da próxima chamada; Continuar retoma", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    let liberarPrimeira!: () => void;
    apiIaSugerirItemMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            liberarPrimeira = () => resolve({});
          })
      )
      // A partir do 2º item, nunca resolve — evita que a fila inteira corra
      // sozinha depois do Continuar; só interessa provar que a 2ª chamada foi
      // disparada.
      .mockImplementation(() => new Promise(() => {}));
    const resultado = resultadoFixture01();
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regrasUmPlaceholder}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await waitFor(() => expect(apiIaSugerirItemMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "⏸ Pausar" }));
    expect(await screen.findByText(/Pausado/)).toBeInTheDocument();

    liberarPrimeira();
    await new Promise((r) => setTimeout(r, 250));
    expect(apiIaSugerirItemMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "▶ Continuar" }));
    await waitFor(() => expect(apiIaSugerirItemMock).toHaveBeenCalledTimes(2));
  });

  it("clicar manualmente num item quebra o auto-follow — badge 'Seguindo a geração' some", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    apiIaSugerirItemMock.mockImplementationOnce(() => new Promise(() => {})); // nunca resolve nesse teste
    const resultado = resultadoFixture01();
    const outraAtividade = resultado.atividades.find((a) => a.chave !== atividadeComPlaceholder(resultado).chave)!;
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regrasUmPlaceholder}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await screen.findByText("● Seguindo a geração");
    await user.click(screen.getByTestId(`item-${outraAtividade.chave}`));
    expect(screen.queryByText("● Seguindo a geração")).not.toBeInTheDocument();
  });

  it("'Gerar de novo' aparece quando não está rodando, e reinicia a orquestração", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: false, embeddingInstalado: false, pronto: false, caminhoModelos: "" });
    apiIaSugerirItemMock.mockResolvedValue({});
    const resultado = resultadoFixture01();
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regrasUmPlaceholder}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    const botaoGerar = await screen.findByRole("button", { name: "🔄 Gerar de novo" });
    await user.click(botaoGerar);

    await waitFor(() => expect(apiIaSugerirItemMock).toHaveBeenCalled());
  });
});

describe("ReviewScreen — contadores de status (rascunho/revisar/refinado)", () => {
  const regras: RegrasConfig = {
    tipos: [],
    tamanhos: [],
    porTech: {
      Backend: {
        checklistTecnico: [{ texto: "DLQ configurada e monitorada", contextos: ["Backend-mensagens"] }],
        testes: [],
      },
    },
  };

  it("sem regras, não mostra contadores (nada pra contar)", () => {
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

    expect(screen.queryByText(/refinado/)).not.toBeInTheDocument();
  });

  it("com regras, mostra contadores de status — história/critérios contextuais sempre pendentes até a IA rodar, então nenhum item é trivialmente 'refinado' (Fase 1d-ii, SPEC-23)", () => {
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

    const status = screen.getByRole("status");
    expect(within(status).getByText(`${resultado.atividades.length} rascunho`)).toBeInTheDocument();
    expect(within(status).getByText("0 refinado")).toBeInTheDocument();
  });
});

describe("ReviewScreen — coluna Times (default pro time da quebra, editável no nó)", () => {
  it("toda atividade mostra o time da quebra por padrão; a que cruza outro time mostra o time diferente", () => {
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
    expect(screen.getByText(/time-pagamentos/)).toBeInTheDocument();
  });

  it("clicar no item que cruza outro time e depois no título leva pro nó de origem certo", async () => {
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

    const cardComOutroTime = screen.getByText(/time-pagamentos/).closest('[data-testid^="item-"]') as HTMLElement;
    await user.click(cardComOutroTime);
    const atividadeComOutroTime = resultado.atividades.find((a) => a.timesEnvolvidos?.includes("time-pagamentos"))!;
    await user.click(screen.getByRole("button", { name: atividadeComOutroTime.rotulo }));

    expect(onSelecionarNo).toHaveBeenCalledWith("n3");
  });
});

describe("ReviewScreen — diagrama animado (SPEC-21)", () => {
  it("botão 'Ver diagrama animado' troca a lista por um iframe com o HTML gerado, e some a lista", async () => {
    const resultado = resultadoFixture01();
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("button", { name: "🔍 Ver diagrama completo" }));

    const iframe = screen.getByTitle("Diagrama animado da solução") as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.srcdoc).toContain("<!DOCTYPE html>");
    expect(screen.queryByText(resultado.atividades[0].rotulo)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar à lista" })).toBeInTheDocument();
  });

  it("no modo diagrama, o botão de export vira 'Baixar diagrama (.html)' e baixa o mesmo HTML do iframe", async () => {
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

    await user.click(screen.getByRole("button", { name: "🔍 Ver diagrama completo" }));
    expect(screen.queryByRole("button", { name: "Gerar especificação de solução" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Baixar diagrama (.html)" }));

    expect(baixarArquivoTextoMock).toHaveBeenCalledOnce();
    const [conteudo, nomeArquivo, mime] = baixarArquivoTextoMock.mock.calls[0];
    expect(nomeArquivo).toBe("diagrama-da-solucao.html");
    expect(mime).toBe("text/html");
    expect(conteudo).toContain("<!DOCTYPE html>");
  });

  it("'Voltar à lista' restaura a visão de itens", async () => {
    const resultado = resultadoFixture01();
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("button", { name: "🔍 Ver diagrama completo" }));
    await user.click(screen.getByRole("button", { name: "Voltar à lista" }));

    expect(screen.getByText(resultado.atividades[0].rotulo)).toBeInTheDocument();
    expect(screen.queryByTitle("Diagrama animado da solução")).not.toBeInTheDocument();
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
