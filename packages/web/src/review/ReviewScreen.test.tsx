import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
// apiIa.sugerir (botão manual, por placeholder) / apiIa.sugerirPipeline
// (esteira de agentes, por papel — SPEC-24) e o que faz com a resposta.
// `status` default "não pronto" — sem isso a esteira dispararia sozinha em
// todo teste que não testa exatamente esse comportamento.
const apiIaSugerirMock = vi.hoisted(() => vi.fn());
const apiIaSugerirPipelineMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const apiIaStatusMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ chatInstalado: false, embeddingInstalado: false, pronto: false, caminhoModelos: "" })
);
// SPEC-24 Fase E — default true (mesma segurança do valor inicial real):
// nenhum teste desta suíte testa o modo "aplica direto", então mantém o
// comportamento pausado de sempre em todos os outros.
const apiPipelineAgentesObterMock = vi.hoisted(() => vi.fn().mockResolvedValue({ confirmacaoObrigatoria: true }));
vi.mock("../api/client", () => ({
  apiIa: { sugerir: apiIaSugerirMock, sugerirPipeline: apiIaSugerirPipelineMock, status: apiIaStatusMock },
  apiPipelineAgentes: { obter: apiPipelineAgentesObterMock },
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

    // Pelo card (testid), não por texto: os rótulos são sequenciais ("01",
    // "02"…) e a faixa de agentes também numera os papéis com "01".."04" —
    // `getByText("01")` casaria os dois.
    for (const a of resultado.atividades) {
      expect(screen.getByTestId(`item-${a.chave}`)).toHaveTextContent(a.rotulo);
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

describe("ReviewScreen — filtro por nó no diagrama compacto (Fase D, SPEC-24)", () => {
  it("clicar num nó filtra a lista pros itens daquele nó só; segundo clique limpa o filtro", async () => {
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

    // n2 (a fila) só tem uma atividade própria: n2::criacao.
    await user.click(screen.getByTestId("diagrama-compacto-no-n2"));

    expect(screen.getByTestId("item-n2::criacao")).toBeInTheDocument();
    expect(screen.queryByTestId("item-n1::setup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("item-e1::publish")).not.toBeInTheDocument();
    expect(screen.getByTestId("contagem-itens").textContent).toContain("1 de 6 itens");

    await user.click(screen.getByTestId("diagrama-compacto-no-n2"));

    expect(screen.getByTestId("item-n1::setup")).toBeInTheDocument();
    expect(screen.getByTestId("contagem-itens").textContent).toBe(`${resultado.atividades.length} itens`);
  });

  it("botão '× limpar filtro' também limpa, sem precisar clicar de novo no nó", async () => {
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

    await user.click(screen.getByTestId("diagrama-compacto-no-n2"));
    await user.click(screen.getByRole("button", { name: /limpar filtro/ }));

    expect(screen.getByTestId("item-n1::setup")).toBeInTheDocument();
    expect(screen.getByTestId("contagem-itens").textContent).toBe(`${resultado.atividades.length} itens`);
  });

  it("selecionar um item destaca o nó correspondente no diagrama compacto", async () => {
    const resultado = resultadoFixture01();
    const user = userEvent.setup();
    const atividadeDoN3 = resultado.atividades.find((a) => a.origem.nodeId === "n3")!;

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

    await user.click(screen.getByTestId(`item-${atividadeDoN3.chave}`));

    // O destaque usa a cor do PRÓPRIO tipo do nó (fiel ao protótipo); este
    // config de teste não define cores, então cai no fallback cinza — o que
    // importa é ter saído do traço de repouso (#263344).
    const noAtivo = screen.getByTestId("diagrama-compacto-no-n3").querySelector("rect");
    expect(noAtivo?.getAttribute("stroke")).toBe("#64748b");
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

  it("achado real: Confirmar funciona SEM digitar nada, confirmando a resposta sugerida pela esteira", async () => {
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
        respostasItens={{
          [atividade.chave]: {
            // Resposta que a esteira gravou: sugerida, ainda NÃO confirmada —
            // o textarea mostra ela como fallback, e o Confirmar precisa
            // enxergar o MESMO fallback (o bug era ler só o rascunho digitado
            // e virar um no-op silencioso).
            "Backend::DLQ configurada e monitorada": { valor: "sim, via DLQ dedicada", origem: "sugerido", confirmado: false },
          },
        }}
        onResponderItem={onResponderItem}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await selecionarEIrPraAba(user, atividade.chave, "Refinamento");
    const linhaDlq = screen.getByTestId(`placeholder-Backend::DLQ configurada e monitorada`);
    await user.click(within(linhaDlq).getByRole("button", { name: "Confirmar" }));

    expect(onResponderItem).toHaveBeenCalledWith(
      atividade.chave,
      "Backend::DLQ configurada e monitorada",
      { valor: "sim, via DLQ dedicada", origem: "manual" }
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

describe("ReviewScreen — esteira de agentes (SPEC-24 — orquestração real por papel via /ia/pipeline/:papel)", () => {
  beforeEach(() => {
    apiIaStatusMock.mockReset();
    apiIaStatusMock.mockResolvedValue({ chatInstalado: false, embeddingInstalado: false, pronto: false, caminhoModelos: "" });
    apiIaSugerirPipelineMock.mockReset();
    apiIaSugerirPipelineMock.mockResolvedValue({});
  });

  // Fixture 01 tem 3 atividades cujo tech/contexto batem com essa regra
  // (n2::criacao, e1::publish, e2::consume — todas Backend + Backend-mensagens).
  // Como história/critérios/contrato/regras de teste são SEMPRE presentes
  // (SPEC-24 Fase A), as 6 atividades da fixture têm trabalho pro PO —
  // primeiro papel a rodar — mesmo as 3 que não batem essa regra técnica.
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

  it("modelo pronto: dispara sozinha, mostra a barra de fase com o papel atual, segue o item automaticamente e mostra 'gerando a ficha inteira'", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    let liberar!: () => void;
    apiIaSugerirPipelineMock.mockImplementationOnce(
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

    // 6 atividades com trabalho pro PO, lote de 5 → o primeiro lote mostra o
    // intervalo, não um item só.
    expect(await screen.findByText(/itens 1–\d+ de \d+/)).toBeInTheDocument();
    expect(await screen.findByTestId("handoff-po")).toHaveAttribute("aria-current", "step");
    // Segue o item automaticamente pra aba Refinamento, sem clique nenhum do usuário
    // (o auto-follow reage num efeito separado, após o commit que liga a
    // esteira — por isso `findByText`, não `getByText`, dá tempo pro segundo
    // render acontecer mesmo numa máquina de CI mais lenta).
    expect(await screen.findByText("● Seguindo a geração")).toBeInTheDocument();
    // Sem streaming campo a campo (a resposta de um papel chega tudo de uma
    // vez via GBNF) — enquanto o PO ainda não respondeu, mostra um indicador
    // estático nos campos dele.
    expect(await screen.findAllByText(/PO escrevendo…/)).not.toHaveLength(0);

    liberar();
    await waitFor(() =>
      expect(apiIaSugerirPipelineMock).toHaveBeenCalledWith("po", expect.anything(), expect.any(Function))
    );
  });

  it("campo em geração mostra o texto do modelo DIGITANDO (streaming), não '…' parado — Fase E, achado real do usuário", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    let emitir!: (acumulado: string) => void;
    apiIaSugerirPipelineMock.mockImplementationOnce(
      (_papel: string, _pedido: unknown, onTexto: (acumulado: string) => void) =>
        new Promise(() => {
          emitir = onTexto; // nunca resolve — o teste só olha o meio do caminho
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

    // Espera a esteira ligar (auto-follow abre a aba Refinamento do item 1).
    await screen.findByTestId("handoff-po");
    await waitFor(() => expect(apiIaSugerirPipelineMock).toHaveBeenCalled());

    // O stream agora é o JSON ANINHADO do lote (item → chave → valor) — o
    // texto exibido tem que ser o do item que o auto-follow selecionou (o
    // primeiro do lote).
    const primeiraChave = apiIaSugerirPipelineMock.mock.calls[0][1].itens[0].chave as string;
    act(() => emitir(`{"${primeiraChave}": {"_historiaUsuario": "Como parceiro integrado, quero enviar`));
    expect(await screen.findByTestId("ao-vivo-_historiaUsuario")).toHaveTextContent(
      "Como parceiro integrado, quero enviar"
    );
  });

  it("divisória arrastável muda a altura do diagrama (Fase E — 'clicar e arrastar pra cima e pra baixo')", async () => {
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

    // jsdom não implementa PointerEvent — Event genérico com props atribuídas
    // à mão (o fireEvent.pointerDown descartaria clientY).
    function eventoPonteiro(tipo: string, props: Record<string, unknown>) {
      const ev = new Event(tipo, { bubbles: true, cancelable: true });
      Object.assign(ev, props);
      return ev;
    }
    const divisoria = screen.getByTestId("divisoria-diagrama");
    fireEvent(divisoria, eventoPonteiro("pointerdown", { clientY: 300, pointerId: 1, button: 0 }));
    fireEvent(divisoria, eventoPonteiro("pointermove", { clientY: 600, pointerId: 1 }));
    fireEvent(divisoria, eventoPonteiro("pointerup", { pointerId: 1 }));

    // jsdom mede altura 0 pro elemento anterior, então 0 + 300 = 300px.
    const palco = screen.getByRole("img", { name: "Diagrama compacto da solução" }).parentElement as HTMLElement;
    expect(palco.style.height).toBe("300px");
  });

  it("confirmacaoObrigatoria: false (config carregada) aplica as respostas direto, confirmado: true — SPEC-24 Fase E, achado real do usuário", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    apiPipelineAgentesObterMock.mockResolvedValueOnce({ confirmacaoObrigatoria: false });
    apiIaSugerirPipelineMock.mockImplementation(async (_papel: string, pedido: { itens: { chave: string; placeholders: { chave: string }[] }[] }) =>
      Object.fromEntries(pedido.itens.map((i) => [i.chave, Object.fromEntries(i.placeholders.map((p) => [p.chave, "resposta gerada"]))]))
    );
    const resultado = resultadoFixture01();
    const onResponderItem = vi.fn();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regrasUmPlaceholder}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
        onResponderItem={onResponderItem}
      />
    );

    await waitFor(() =>
      expect(onResponderItem).toHaveBeenCalledWith(
        expect.any(String),
        "_historiaUsuario",
        expect.objectContaining({ confirmado: true })
      )
    );
  });

  it("modelo não pronto: não dispara sozinha, tela fica no comportamento manual de sempre", async () => {
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
    expect(screen.queryByText(/ite(m|ns) \d+/)).not.toBeInTheDocument();
    expect(apiIaSugerirPipelineMock).not.toHaveBeenCalled();
  });

  it("handoff: quando o PO termina todos os itens, a barra passa a mostrar o Arquiteto", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    // Primeira chamada do PO fica pendente até o teste observar "po" ativo —
    // sem isso, como as chamadas seguintes do PO resolvem rápido demais, a
    // esteira já teria avançado pro Arquiteto antes do primeiro render ser
    // capturado. Arquiteto/Especialista/QA nunca resolvem — só interessa
    // provar que o handoff PO→Arquiteto aconteceu.
    let liberarPrimeiraPo!: () => void;
    let jaLiberouPrimeira = false;
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string) => {
      if (papel !== "po") return new Promise(() => {});
      if (!jaLiberouPrimeira) {
        jaLiberouPrimeira = true;
        return new Promise((resolve) => {
          liberarPrimeiraPo = () => resolve({});
        });
      }
      return {};
    });
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

    expect(await screen.findByTestId("handoff-po")).toHaveAttribute("aria-current", "step");
    liberarPrimeiraPo();
    await waitFor(() => expect(screen.getByTestId("handoff-arquiteto")).toHaveAttribute("aria-current", "step"));
  });

  it("Pausar interrompe antes da próxima chamada; Continuar retoma", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    let liberarPrimeira!: () => void;
    apiIaSugerirPipelineMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            liberarPrimeira = () => resolve({});
          })
      )
      // Segunda chamada em diante nunca resolve — evita que a esteira inteira
      // corra sozinha depois do Continuar; só interessa provar que a 2ª
      // chamada foi disparada.
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

    await waitFor(() => expect(apiIaSugerirPipelineMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "⏸ Pausar" }));
    expect(await screen.findByText(/Pausado/)).toBeInTheDocument();

    liberarPrimeira();
    await new Promise((r) => setTimeout(r, 250));
    expect(apiIaSugerirPipelineMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "▶ Continuar" }));
    await waitFor(() => expect(apiIaSugerirPipelineMock).toHaveBeenCalledTimes(2));
  });

  it("clicar manualmente num item quebra o auto-follow — badge 'Seguindo a geração' some", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    apiIaSugerirPipelineMock.mockImplementationOnce(() => new Promise(() => {})); // nunca resolve nesse teste
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

  it("'Gerar de novo' aparece quando não está rodando, e reinicia a esteira", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: false, embeddingInstalado: false, pronto: false, caminhoModelos: "" });
    apiIaSugerirPipelineMock.mockResolvedValue({});
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

    await waitFor(() => expect(apiIaSugerirPipelineMock).toHaveBeenCalled());
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

    // `getByTestId`, não `getByRole("status")`: a faixa de agentes também é
    // uma região `status` (anuncia qual papel está trabalhando), então o role
    // sozinho virou ambíguo — mesma armadilha do `contagem-itens`.
    const status = screen.getByTestId("contadores");
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

    expect(screen.getByTestId(`item-${resultado.atividades[0].chave}`)).toBeInTheDocument();
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
