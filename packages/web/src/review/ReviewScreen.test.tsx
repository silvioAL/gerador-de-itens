import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  carimbarInsumos,
  derivar,
  EVIDENCIA_SIMULADA,
  insumosDoItem,
  resolverDependencias,
  TEMPLATE_ESPECIFICACAO_PADRAO,
  type Diagrama,
  type DiagramaConfig,
  type RegrasConfig,
  type ValorSpec,
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
vi.mock("../api/client", async (importActual) => ({
  // Constantes reais (PAPEIS_PADRAO etc., Fase F) — só a API de rede é mockada.
  ...(await importActual<typeof import("../api/client")>()),
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

  it("a timeline sinaliza começo e fim: primeiro item marca início, último marca fim (achado real)", () => {
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

    const cards = resultado.atividades.map((a) => screen.getByTestId(`item-${a.chave}`));
    expect(cards.length).toBeGreaterThan(1);
    expect(cards[0].className).toContain("review-item-rail-inicio");
    expect(cards[cards.length - 1].className).toContain("review-item-rail-fim");
    for (const meio of cards.slice(1, -1)) {
      expect(meio.className).not.toMatch(/rail-inicio|rail-fim|rail-unico/);
    }
  });

  it("com UM item só, início e fim moram no mesmo card (classe própria, não as duas)", () => {
    const resultado = resultadoFixture01();
    const unico = { ...resultado, atividades: resultado.atividades.slice(0, 1) };
    render(
      <ReviewScreen
        resultado={unico}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    const card = screen.getByTestId(`item-${unico.atividades[0].chave}`);
    expect(card.className).toContain("review-item-rail-unico");
    expect(card.className).not.toMatch(/rail-inicio|rail-fim/);
  });

  it("SPEC-37 M4: sem modelo de IA, o balão mais bloqueante aparece e o chip abre a aba Modelo de IA", async () => {
    const onConfigurarModeloIa = vi.fn();
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
        onConfigurarModeloIa={onConfigurarModeloIa}
      />
    );

    // O status default dos mocks é "pronto: false" — exatamente o gatilho.
    const balao = await screen.findByTestId("balao-sem-ia");
    expect(balao).toHaveTextContent("sem credencial de gateway");
    // M4 GANHA do M5 (demandInfo também está vazio aqui): um balão por vez,
    // o mais bloqueante primeiro.
    expect(screen.queryByTestId("balao-sem-contexto")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("balao-sem-ia-acao"));
    expect(onConfigurarModeloIa).toHaveBeenCalled();
  });

  it("SPEC-37 M5: derivou sem Contexto da demanda (e IA não é o problema) — aviso dispensável", async () => {
    // Status rejeitado = "sem-rota" (modo sem IA): não é o M4; sobra o M5.
    apiIaStatusMock.mockRejectedValueOnce(new Error("sem rota"));
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    const balao = await screen.findByTestId("balao-sem-contexto");
    expect(balao).toHaveTextContent("Contexto da demanda");

    fireEvent.click(within(balao).getByRole("button", { name: "Dispensar sugestão" }));
    expect(screen.queryByTestId("balao-sem-contexto")).not.toBeInTheDocument();
  });

  it("§184: demanda com especificação JÁ GERADA — o chat abre sozinho com a fala adaptada (mecânica do M1)", async () => {
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
        documentoJaAprovado
      />
    );

    await waitFor(() => expect(screen.getByTestId("conversa-especificacao")).toBeInTheDocument());
    expect(screen.getByTestId("conversa-especificacao")).toHaveTextContent(
      /já teve o documento de desenho aprovado/
    );
  });

  it("§270: o balão oferece ITENS, e não há mais como gerar a especificação daqui", async () => {
    // A especificação de solução era o markdown do documento de desenho por
    // outra porta — mesma função, mesmas opções, outro nome de arquivo. E a
    // porta de trás ainda gravava por cima da foto da aprovação (§264).
    const user = userEvent.setup();
    const resultado = resultadoFixture01();
    const chave = resultado.atividades[0].chave;
    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
        onItensGerados={vi.fn()}
        respostasItens={{
          [chave]: { _historiaUsuario: { valor: "Como cobrança, quero enfileirar propostas.", origem: "manual" } },
        }}
      />
    );

    fireEvent.click(within(await screen.findByTestId("balao-sem-ia")).getByRole("button", { name: "Dispensar sugestão" }));
    fireEvent.click(within(await screen.findByTestId("balao-sem-contexto")).getByRole("button", { name: "Dispensar sugestão" }));
    const balao = await screen.findByTestId("balao-gerar");

    expect(balao.querySelector('[data-testid="balao-gerar-acao"]')).toBeNull();
    expect(balao.querySelector('[data-testid="balao-gerar-itens"]')).not.toBeNull();
    // E nada é baixado por esta tela: o markdown tem um lugar só, o documento.
    await user.click(balao.querySelector('[data-testid="balao-gerar-itens"]') as HTMLElement);
    expect(baixarArquivoTextoMock).not.toHaveBeenCalled();
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

    // As quatro abas deixaram de existir: a ficha é uma só, com as seções na
    // ordem do pipeline configurado. O que era determinístico virou "insumos".
    expect(screen.queryByRole("button", { name: "Especificação" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contrato" })).not.toBeInTheDocument();
    expect(screen.getByTestId("alternar-insumos")).toBeInTheDocument();
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

  it("SPEC-39: a especificação sai pelo AGENTE — o botão morreu; o chip do balão M12 baixa o markdown", async () => {
    const user = userEvent.setup();
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Gerar especificação de solução" })).not.toBeInTheDocument();

    // O M4 (sem modelo, default dos mocks) fala primeiro — dispensado, o M12
    // assume como a porta da geração.
    fireEvent.click(within(await screen.findByTestId("balao-sem-ia")).getByRole("button", { name: "Dispensar sugestão" }));
    // …e o M5 (sem contexto do épico) fala em seguida — dispensado também.
    fireEvent.click(within(await screen.findByTestId("balao-sem-contexto")).getByRole("button", { name: "Dispensar sugestão" }));
    // §270 — o balão do M12 perdeu a geração de especificação junto: ela era a
    // mesma coisa do documento de desenho, com outro nome de arquivo.
    const balao = await screen.findByTestId("balao-gerar");
    expect(balao.querySelector('[data-testid="balao-gerar-acao"]')).toBeNull();
    expect(balao.textContent).toContain("itens de trabalho");
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
    // importa é ter saído do traço de repouso (var(--borda-forte)).
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

  /**
   * As abas da ficha deixaram de existir: tudo o que os agentes escrevem fica
   * na mesma coluna, na ordem do pipeline configurado. O que era conteúdo das
   * abas Contrato/Testes virou "insumos", atrás de um expandir — então o
   * segundo argumento só decide se é preciso abrir esse bloco.
   */
  async function selecionarEIrPraAba(user: ReturnType<typeof userEvent.setup>, chave: string, aba: string) {
    await user.click(screen.getByTestId(`item-${chave}`));
    if (aba === "Contrato" || aba === "Testes") await user.click(screen.getByTestId("alternar-insumos"));
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
      // `objectContaining`: desde a SPEC-26 Bloco 1 a resposta também leva
      // `baseadoEm` (procedência), que não é o objeto deste teste.
      expect.objectContaining({ valor: "sim, via política X no tópico Y", origem: "sugerido", confirmado: false })
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
      expect.objectContaining({ valor: "sim, via TTL de 7 dias", origem: "manual" })
    );
  });

  /**
   * ACHADO REAL (SPEC-74) — e este teste era CÚMPLICE do defeito.
   *
   * Ele nasceu para provar que "Confirmar sem digitar nada" não é um no-op, e
   * acertou nisso. Mas afirmava `origem: "manual"` para um texto que a esteira
   * escreveu — ou seja, fixava como esperado o fato de a confirmação APAGAR a
   * proveniência. Com isso, confirmar uma sugestão passava a dizer que uma
   * pessoa a tinha escrito, e junto iam a evidência, a confiança e o carimbo
   * de insumos.
   *
   * A régua certa já existia em `FilaDeRevisao`, a dois arquivos daqui:
   * editou vira manual, não editou vira a MESMA resposta, confirmada. Duas
   * superfícies confirmando a mesma coisa de formas diferentes é a assinatura
   * do §263 — e aqui ela custava um fato falso sobre quem escreveu.
   */
  it("Confirmar sem editar mantém a resposta da esteira e sua proveniência — só a confirma", async () => {
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
            // Resposta que a esteira gravou: sugerida, ainda NÃO confirmada, e
            // com a evidência de que nenhum modelo foi consultado (SPEC-74). O
            // textarea a mostra como fallback, e o Confirmar precisa enxergar o
            // MESMO fallback — o bug original era ler só o rascunho digitado e
            // virar um no-op silencioso.
            "Backend::DLQ configurada e monitorada": {
              valor: "sim, via DLQ dedicada",
              origem: "sugerido",
              confirmado: false,
              evidencia: EVIDENCIA_SIMULADA,
            },
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
      expect.objectContaining({
        valor: "sim, via DLQ dedicada",
        origem: "sugerido",
        confirmado: true,
        // O que o defeito apagava, e é o que faz a marca chegar ao documento.
        evidencia: EVIDENCIA_SIMULADA,
      })
    );
  });

  it("mas EDITAR o texto vira manual de verdade — a pessoa passou a ser a autora", async () => {
    // O controle negativo do teste acima: se tudo virasse "sugerido
    // confirmado", o produto passaria a dizer que a IA escreveu o que uma
    // pessoa digitou, que é o mesmo erro na direção contrária.
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
            "Backend::DLQ configurada e monitorada": {
              valor: "sim, via DLQ dedicada",
              origem: "sugerido",
              confirmado: false,
              evidencia: EVIDENCIA_SIMULADA,
            },
          },
        }}
        onResponderItem={onResponderItem}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await selecionarEIrPraAba(user, atividade.chave, "Refinamento");
    const linhaDlq = screen.getByTestId(`placeholder-Backend::DLQ configurada e monitorada`);
    await user.type(within(linhaDlq).getByRole("textbox"), " e alarme no painel");
    await user.click(within(linhaDlq).getByRole("button", { name: "Confirmar" }));

    expect(onResponderItem).toHaveBeenCalledWith(
      atividade.chave,
      "Backend::DLQ configurada e monitorada",
      expect.objectContaining({ origem: "manual" })
    );
    expect(onResponderItem.mock.calls.at(-1)?.[2].evidencia).toBeUndefined();
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

  it("Fase F: config com papéis reordenados/desativados dirige a faixa E a esteira; agente contextual leva os itens do contexto dele", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    // QA desativado; um Especialista contextual de mensageria ANTES do geral
    // (regra da Fase F: o primeiro do grupo que casar leva o item).
    apiPipelineAgentesObterMock.mockResolvedValueOnce({
      confirmacaoObrigatoria: true,
      papeis: [
        { id: "po", nome: "PO", grupo: "po", ativo: true, contextos: [] },
        { id: "arquiteto", nome: "Arquiteto", grupo: "arquiteto", ativo: true, contextos: [] },
        { id: "esp-mensagens", nome: "Especialista mensageria", grupo: "especialista", ativo: true, contextos: ["Backend-mensagens"] },
        { id: "especialista", nome: "Especialista técnico", grupo: "especialista", ativo: true, contextos: [] },
        { id: "qa", nome: "QA", grupo: "qa", ativo: false, contextos: [] },
      ],
    });
    const chamadas: { papel: string; chaves: string[] }[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: { itens: { chave: string }[] }) => {
      chamadas.push({ papel, chaves: pedido.itens.map((i) => i.chave) });
      return {};
    });
    const resultado = resultadoFixture01();
    const comMensageria = resultado.atividades
      .filter((a) => a.contextos.some((c) => c.includes("Backend-mensagens")))
      .map((a) => a.chave);

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

    // A faixa mostra o papel custom e esconde o desativado.
    expect(await screen.findByTestId("handoff-esp-mensagens")).toBeInTheDocument();
    expect(screen.queryByTestId("handoff-qa")).not.toBeInTheDocument();

    // Espera a esteira COMPLETAR (botão de refazer volta) — só então dá pra
    // afirmar quem foi e quem não foi chamado.
    await screen.findByRole("button", { name: "🔄 Gerar de novo" }, { timeout: 4000 });

    // QA desativado: nenhuma chamada. O contextual levou EXATAMENTE os itens
    // de mensageria. O Especialista geral ficou sem trabalho nesta fixture
    // (o único requisito técnico é de mensageria, e o contextual o roubou) —
    // zero chamadas dele também, que é o comportamento certo.
    expect(chamadas.filter((c) => c.papel === "qa")).toHaveLength(0);
    const doContextual = chamadas.filter((c) => c.papel === "esp-mensagens").flatMap((c) => c.chaves);
    const doGeral = chamadas.filter((c) => c.papel === "especialista").flatMap((c) => c.chaves);
    expect(doContextual.sort()).toEqual([...comMensageria].sort());
    expect(doGeral).toHaveLength(0);
  });

  it("re-rodar a partir da alteração: botão na seção regenera SÓ os papéis seguintes deste item, com a alteração como insumo", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: false, embeddingInstalado: false, pronto: false, caminhoModelos: "" });
    const chamadas: { papel: string; itens: { chave: string; respostasAnteriores?: { rotulo: string; valor: string }[] }[] }[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: { itens: { chave: string; respostasAnteriores?: { rotulo: string; valor: string }[] }[] }) => {
      chamadas.push({ papel, itens: pedido.itens });
      return {};
    });
    const resultado = resultadoFixture01();
    const atividade = atividadeComPlaceholder(resultado);
    const user = userEvent.setup();

    render(
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regrasUmPlaceholder}
        especificacaoTemplate={templateFixture}
        respostasItens={{
          // A história foi revisada e ALTERADA pelo usuário — o ciclo tem que
          // rodar de novo a partir daqui, com esse texto como insumo.
          [atividade.chave]: {
            _historiaUsuario: { valor: "Como analista, quero a versão REVISADA da história.", origem: "manual" },
          },
        }}
        onResponderItem={vi.fn()}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await user.click(screen.getByTestId(`item-${atividade.chave}`));
    const botoes = await screen.findAllByRole("button", { name: "↻ Re-rodar papéis seguintes" });
    await user.click(botoes[0]); // seção PO — a primeira com resposta

    await waitFor(() => expect(apiIaSugerirPipelineMock).toHaveBeenCalled());
    // Só papéis DEPOIS do PO; um item só; a história revisada vai como insumo.
    expect(chamadas.every((c) => c.papel !== "po")).toBe(true);
    expect(chamadas[0].itens).toHaveLength(1);
    expect(chamadas[0].itens[0].chave).toBe(atividade.chave);
    expect(chamadas[0].itens[0].respostasAnteriores).toEqual(
      expect.arrayContaining([expect.objectContaining({ valor: "Como analista, quero a versão REVISADA da história." })])
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

describe("ReviewScreen — obsolescência de respostas (SPEC-26 Bloco 1)", () => {
  const primeiraChave = () => resultadoFixture01().atividades[0].chave;

  /** Carimbo de uma resposta escrita quando o desenho estava como está agora. */
  function carimboAtual() {
    const resultado = resultadoFixture01();
    return carimbarInsumos(insumosDoItem(resultado.atividades[0], fixture.quebra.diagrama));
  }

  function comResposta(baseadoEm?: Record<string, string>) {
    return { [primeiraChave()]: { _historiaUsuario: { valor: "Como analista...", origem: "manual" as const, baseadoEm } } };
  }

  it("desenho intacto: nenhum aviso de desatualizado", () => {
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        respostasItens={comResposta(carimboAtual())}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );
    expect(screen.queryByTestId("contador-desatualizados")).not.toBeInTheDocument();
  });

  it("spec do nó mudou depois da resposta: contador no header e selo no item", () => {
    const diagramaMudado = structuredClone(fixture.quebra.diagrama);
    const no = diagramaMudado.nodes[0];
    no.spec = { ...no.spec, timeout: { valor: "150ms", origem: "manual" } };

    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={diagramaMudado}
        config={config}
        respostasItens={comResposta(carimboAtual())}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    expect(screen.getByTestId("contador-desatualizados")).toHaveTextContent("1 campo desatualizado");
    expect(screen.getByTestId(`desatualizado-${primeiraChave()}`)).toBeInTheDocument();
  });

  it("resposta SEM carimbo (escrita antes deste mecanismo) não vira alarme falso", () => {
    const diagramaMudado = structuredClone(fixture.quebra.diagrama);
    diagramaMudado.nodes[0].spec = { ...diagramaMudado.nodes[0].spec, timeout: { valor: "150ms", origem: "manual" } };

    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={diagramaMudado}
        config={config}
        respostasItens={comResposta(undefined)}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );
    expect(screen.queryByTestId("contador-desatualizados")).not.toBeInTheDocument();
  });

  it("toda resposta nova nasce carimbada — é o que permite detectar a mudança depois", () => {
    const onResponderItem = vi.fn();
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        onResponderItem={onResponderItem}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    // Confirma um campo pela ficha (o caminho manual) e olha o que foi gravado.
    fireEvent.click(screen.getAllByTestId(/^item-/)[0]);
    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: "Como analista, quero X" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar" })[0]);

    expect(onResponderItem).toHaveBeenCalled();
    const [, , resposta] = onResponderItem.mock.calls.at(-1)!;
    expect(resposta.baseadoEm).toBeTruthy();
    expect(Object.keys(resposta.baseadoEm).length).toBeGreaterThan(0);
  });
});

describe("ReviewScreen — revisor determinístico (SPEC-26 Bloco 4a)", () => {
  it("quebra com dependência órfã: botão de achados no header e painel que leva ao item", () => {
    const resultado = resultadoFixture01();
    // Simula o que acontece de verdade: um nó apagado deixa quem dependia dele
    // apontando pro vazio.
    resultado.atividades[0].dependencias = [{ type: "dependent", alvoChave: "n9::sumido" }];

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

    const botao = screen.getByTestId("abrir-revisor");
    // O rótulo conta QUANTOS dependem de uma decisão sua, não quantos achados
    // existem no total: "20 aviso(s)" logo depois de derivar era lido como 20
    // defeitos quando quase todos eram só a fila do que a esteira ainda vai
    // escrever (achado real do usuário: "no canvas está tudo com a bolinha
    // verde"). Dependência órfã é das de pessoa — nenhum agente resolve.
    expect(botao).toHaveTextContent("1 a resolver");
    fireEvent.click(botao);
    expect(screen.getByTestId("painel-achados")).toHaveTextContent("n9::sumido");
  });

  it("quebra saudável não mostra o botão — revisor silencioso é revisor que não vira ruído", () => {
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );
    expect(screen.queryByTestId("abrir-revisor")).not.toBeInTheDocument();
  });

  /**
   * ACHADO REAL (dois prints do usuário): canvas com TODAS as bolinhas verdes e,
   * ao mesmo tempo, um painel vermelho com 20 avisos — *"precisamos entender o
   * motivo de ter apresentado esses erros"*. Não havia erro nenhum: eram os
   * campos que a esteira ainda ia escrever, contados junto com os defeitos.
   *
   * A separação por `origem` é o que impede as duas telas de se contradizerem,
   * e este teste é o que impede a contagem de voltar a somar as duas coisas.
   */
  it("pendência da esteira não é contada como coisa a resolver", () => {
    // `porTech` vazio: nenhum ciclo de teste cobre as techs dos itens, então
    // toda atividade com tech gera `sem-ciclo-de-teste` — regra da esteira.
    const semCicloDeTeste: RegrasConfig = { tipos: [], tamanhos: [], porTech: {} };

    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={semCicloDeTeste}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    const botao = screen.getByTestId("abrir-revisor");
    expect(botao).toHaveTextContent("na fila da esteira");
    expect(botao).not.toHaveTextContent("a resolver");

    fireEvent.click(botao);
    const daEsteira = screen.getByTestId("pendencias-da-esteira");
    // Antes de a esteira rodar o texto diz que isto some sozinho — é a frase
    // que responde "por que apareceu erro se está tudo verde?".
    expect(daEsteira).toHaveTextContent("ainda vai preencher");
    expect(screen.queryByTestId("pendencias-de-pessoa")).not.toBeInTheDocument();
  });
});

describe("ReviewScreen — o que um papel escreveu continua na tela quando o próximo começa (bug real)", () => {
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

  /** Espelha o App: o pai guarda `respostasItens` e o `onResponderItem` o
   * atualiza. Sem isso o teste não reproduz o caso real — em `ReviewScreen`
   * sozinho a prop nunca muda, e o bug some. */
  function ComEstado({ resultado }: { resultado: ReturnType<typeof resultadoFixture01> }) {
    const [respostasItens, setRespostasItens] = useState<Record<string, Record<string, ValorSpec>>>({});
    return (
      <ReviewScreen
        resultado={resultado}
        diagrama={fixture.quebra.diagrama}
        config={config}
        regras={regras}
        especificacaoTemplate={templateFixture}
        respostasItens={respostasItens}
        onResponderItem={(chave, placeholder, resposta) =>
          setRespostasItens((r) => {
            const doItem = { ...r[chave] };
            if (resposta === undefined) delete doItem[placeholder];
            else doItem[placeholder] = resposta;
            return { ...r, [chave]: doItem };
          })
        }
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );
  }

  it("o texto do PO continua visível depois que o Arquiteto começa a escrever", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    let liberarArquiteto!: () => void;
    apiIaSugerirPipelineMock.mockImplementation(
      async (papel: string, pedido: { itens: { chave: string; placeholders: { chave: string }[] }[] }) => {
        const resposta = Object.fromEntries(
          pedido.itens.map((i) => [i.chave, Object.fromEntries(i.placeholders.map((p) => [p.chave, `texto do ${papel}`]))])
        );
        if (papel === "po") return resposta;
        // Arquiteto fica em voo: é exatamente o instante em que o usuário
        // relatou que o texto do PO sumia da tela.
        await new Promise<void>((r) => (liberarArquiteto = r));
        return resposta;
      }
    );

    render(<ComEstado resultado={resultadoFixture01()} />);

    // Espera o PO terminar e o Arquiteto entrar em voo.
    await waitFor(
      () => expect(apiIaSugerirPipelineMock.mock.calls.map((c) => c[0])).toContain("arquiteto"),
      { timeout: 4000 }
    );

    fireEvent.click(screen.getAllByTestId(/^item-/)[0]);

    const campoDoPo = screen.getByTestId("placeholder-_historiaUsuario");
    await waitFor(() => expect(campoDoPo.textContent + (campoDoPo.querySelector("textarea")?.value ?? "")).toContain("texto do po"));

    liberarArquiteto();
  });

  it("§199 — a esteira PEDE a entrega final ao PO, e o campo existe pra editar à mão", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    const pedidos: { papel: string; chaves: string[] }[] = [];
    apiIaSugerirPipelineMock.mockImplementation(
      async (papel: string, pedido: { itens: { chave: string; placeholders: { chave: string }[] }[] }) => {
        pedidos.push({ papel, chaves: pedido.itens.flatMap((i) => i.placeholders.map((p) => p.chave)) });
        return Object.fromEntries(
          pedido.itens.map((i) => [i.chave, Object.fromEntries(i.placeholders.map((p) => [p.chave, `texto do ${papel}`]))])
        );
      }
    );

    render(<ComEstado resultado={resultadoFixture01()} />);

    // O defeito era este: o documento cobrava a entrega final e NINGUÉM a
    // escrevia — nem a esteira (não estava no lote do PO), nem a pessoa (não
    // havia campo na tela).
    await waitFor(
      () => expect(pedidos.find((p) => p.papel === "po")?.chaves).toContain("_entregaFinal"),
      { timeout: 4000 }
    );

    fireEvent.click(screen.getAllByTestId(/^item-/)[0]);
    const campo = await screen.findByTestId("placeholder-_entregaFinal");
    expect(campo.textContent).toContain("Entrega final");
  });

  it("§193 — papel que morre no caminho DIZ isso na tela: o trabalho nunca mais some em silêncio", async () => {
    apiIaStatusMock.mockResolvedValueOnce({ chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "" });
    apiIaSugerirPipelineMock.mockImplementation(
      async (papel: string, pedido: { itens: { chave: string; placeholders: { chave: string }[] }[] }) => {
        // O defeito real medido no Qwen local: a conexão cai depois de 300 s
        // e o papel inteiro volta sem nada (o servidor loga "fetch failed").
        if (papel === "po") throw new Error("fetch failed");
        return Object.fromEntries(
          pedido.itens.map((i) => [i.chave, Object.fromEntries(i.placeholders.map((p) => [p.chave, `texto do ${papel}`]))])
        );
      }
    );

    render(<ComEstado resultado={resultadoFixture01()} />);

    const faixa = await screen.findByTestId("falhas-da-esteira", {}, { timeout: 4000 });
    expect(faixa.textContent).toMatch(/não completou/);
    expect(faixa.textContent).toMatch(/a conexão com o modelo caiu no meio da geração/);
    expect(faixa.textContent).toMatch(/nada foi escrito para esses campos/);
  });
});

describe("ReviewScreen — sinais que o usuário leu como falha (relato com print)", () => {
  it("papel sem NADA a escrever no item tem pip de 'sem trabalho', não de 'não fez'", () => {
    // Relato: "o pipeline rodou por completo mas o penúltimo stage não foi
    // preenchido". Não foi porque não havia o que preencher — a config de
    // regras não cobria a tech/contexto. O pip apagado era idêntico ao de um
    // papel que falhou, e a leitura virou "o agente não rodou".
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

    // Sem `regras`, nenhum papel tem placeholder derivado de tabela de regras:
    // é exatamente o cenário do relato.
    const chave = resultado.atividades[0].chave;
    const pips = screen.getAllByTestId(new RegExp(`^pip-${chave}-`));
    expect(pips.length).toBeGreaterThan(0);
    const estados = pips.map((p) => p.getAttribute("data-estado"));
    expect(estados).toContain("sem-trabalho");
    // E o título explica — o pip sozinho não teria como contar isso.
    const semTrabalho = pips.find((p) => p.getAttribute("data-estado") === "sem-trabalho")!;
    expect(semTrabalho.getAttribute("title")).toMatch(/nada a escrever neste item/);
  });

  it("/ia/status inacessível (modo hospedado) DIZ que os agentes não rodam aqui", async () => {
    // Relato: "cliquei em derivar quebra e na tela de revisão não aconteceu
    // nada além do desenho do diagrama". O servidor hospedado não registra
    // rota /ia/* nenhuma — elas só existem no `gerador open` —, então o status
    // dá 404, a promessa rejeita e o efeito de montagem fazia `return` mudo.
    // A esteira ficava desenhada e parada, o que se lê como produto quebrado.
    apiIaStatusMock.mockRejectedValueOnce(new Error("404 Not Found"));
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    const aviso = await screen.findByTestId("ia-indisponivel-sem-rota");
    expect(aviso).toHaveTextContent(/não rodam neste modo/i);
    // Aponta pro modo que tem o recurso, senão o aviso só constata o problema.
    expect(aviso).toHaveTextContent(/gerador open/);
    // E deixa claro que o resto do produto não depende disso.
    expect(aviso).toHaveTextContent(/documento de desenho continuam funcionando/i);
  });

  it("modelo não instalado é motivo DIFERENTE de rota ausente — a ação de quem lê é outra", async () => {
    // Os dois davam no mesmo silêncio. Um se resolve baixando o modelo, o
    // outro trocando de modo: confundir os dois manda a pessoa pro lugar errado.
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    const aviso = await screen.findByTestId("ia-indisponivel-sem-modelo");
    // §236 — a mensagem parou de mandar rodar um comando que a SPEC-33 apagou.
    // O que ela precisa dizer é o que fazer AQUI: configurar o gateway.
    expect(aviso).toHaveTextContent(/Modelo de IA/);
    expect(aviso).not.toHaveTextContent(/gerador ia instalar/);
    expect(screen.queryByTestId("ia-indisponivel-sem-rota")).not.toBeInTheDocument();
  });

  it("com o modelo pronto, aviso nenhum aparece — ele é sobre ausência, não decoração", async () => {
    apiIaStatusMock.mockResolvedValueOnce({
      chatInstalado: true,
      embeddingInstalado: true,
      pronto: true,
      caminhoModelos: "/x",
    });
    render(
      <ReviewScreen
        resultado={resultadoFixture01()}
        diagrama={fixture.quebra.diagrama}
        config={config}
        especificacaoTemplate={templateFixture}
        onFechar={vi.fn()}
        onSelecionarNo={vi.fn()}
      />
    );

    await waitFor(() => expect(apiIaStatusMock).toHaveBeenCalled());
    expect(screen.queryByTestId("ia-indisponivel-sem-rota")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ia-indisponivel-sem-modelo")).not.toBeInTheDocument();
  });
});

describe("ReviewScreen — a ficha segue o pipeline CONFIGURADO", () => {
  // Pedido do usuário ao remover as abas: *"se amanhã o usuário quiser
  // configurar outro agente ou mudar a ordem, os outputs devem aparecer ali na
  // ordem que o fluxo foi configurado, assim o sistema fica genérico".*
  // Antes a ficha iterava uma lista fixa no código enquanto a esteira já lia a
  // config — renomear um papel mudava quem escrevia e não mudava onde aparecia.
  it("renomear e reordenar papéis muda os títulos e a ORDEM das seções", async () => {
    apiPipelineAgentesObterMock.mockResolvedValueOnce({
      confirmacaoObrigatoria: true,
      papeis: [
        { id: "qa", nome: "Qualidade", descricao: "", grupo: "qa", ativo: true, contextos: [] },
        { id: "po", nome: "Dona do Produto", descricao: "", grupo: "po", ativo: true, contextos: [] },
      ],
    });
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
    await user.click(screen.getByTestId(`item-${resultado.atividades[0].chave}`));

    // Aparece na faixa da esteira E na seção da ficha — as duas passaram a ler
    // a mesma config, que era exatamente o ponto.
    expect((await screen.findAllByText("Dona do Produto")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Qualidade").length).toBeGreaterThanOrEqual(2);
    // Nome configurado, não o rótulo de fábrica.
    expect(screen.queryByText("PO")).not.toBeInTheDocument();

    // E na ordem configurada: QA antes do PO, o inverso do padrão.
    const texto = document.body.textContent ?? "";
    expect(texto.indexOf("Qualidade")).toBeLessThan(texto.indexOf("Dona do Produto"));
  });

  it("papel configurado sem nada a escrever DIZ isso, em vez de sumir", async () => {
    // O relato: o Especialista "não rodava". Rodava — a tabela de regras
    // carregada não cobria a combinação do item, e a seção simplesmente não
    // era renderizada. Sumir é indistinguível de falhar.
    apiPipelineAgentesObterMock.mockResolvedValueOnce({
      confirmacaoObrigatoria: true,
      papeis: [
        { id: "especialista", nome: "Especialista técnico", descricao: "", grupo: "especialista", ativo: true, contextos: [] },
      ],
    });
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
    await user.click(screen.getByTestId(`item-${resultado.atividades[0].chave}`));

    // Sem `regras`, o Especialista não tem placeholder nenhum — é o cenário real.
    const aviso = await screen.findByTestId("sem-trabalho-especialista");
    expect(aviso).toHaveTextContent(/Nada a escrever neste item/i);
    expect(aviso).toHaveTextContent(/tabela de regras/i);
  });
});

/**
 * #261 — "item n2::ep0 sem pips depois da esteira completa".
 *
 * Ninguém falhou: ninguém ASSUMIU. `papelDoGrupo` só aceita um papel se ele
 * casa com os contextos/techs do item, ou se tem `contextos: []` (casa com
 * tudo). A atividade de endpoint nasce com `contextos: []` quando o nó está
 * sem tech — então, com todos os papéis contextuais, nenhum pega o item.
 *
 * Era invisível porque o pip apagado de "não assumido" é idêntico ao de "nada
 * a escrever". Estes testes prendem a mensagem que passou a distinguir os dois.
 */
describe("ReviewScreen — item que nenhum agente assume (#261)", () => {
  function comItemSemContexto() {
    const resultado = resultadoFixture01();
    const orfao = { ...resultado.atividades[0], techs: [], contextos: [] };
    return { ...resultado, atividades: [orfao, ...resultado.atividades.slice(1)] };
  }

  function renderizar(resultado: ReturnType<typeof resultadoFixture01>) {
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
  }

  it("com TODOS os papéis contextuais, o item órfão avisa — e aponta a tech do nó", async () => {
    apiPipelineAgentesObterMock.mockResolvedValueOnce({
      confirmacaoObrigatoria: true,
      papeis: [
        { id: "po-msg", nome: "PO mensageria", grupo: "po", ativo: true, contextos: ["Backend-mensagens"] },
        { id: "arq-msg", nome: "Arquiteto mensageria", grupo: "arquiteto", ativo: true, contextos: ["Backend-mensagens"] },
      ],
    });
    const resultado = comItemSemContexto();
    renderizar(resultado);

    const aviso = await screen.findByTestId(`sem-dono-${resultado.atividades[0].chave}`);
    expect(aviso).toHaveTextContent("Nenhum agente assumiu");
    // A causa e onde corrigir, não só o sintoma.
    expect(aviso).toHaveTextContent("não tem tecnologia definida");
  });

  it("com um papel geral (contextos vazios), NÃO avisa — alguém assumiu", async () => {
    // O geral casa com tudo, então o item tem dono e o aviso seria ruído.
    apiPipelineAgentesObterMock.mockResolvedValueOnce({
      confirmacaoObrigatoria: true,
      papeis: [{ id: "po", nome: "PO", grupo: "po", ativo: true, contextos: [] }],
    });
    const resultado = comItemSemContexto();
    renderizar(resultado);

    await screen.findByTestId(`item-${resultado.atividades[0].chave}`);
    expect(screen.queryByTestId(`sem-dono-${resultado.atividades[0].chave}`)).toBeNull();
  });
});
