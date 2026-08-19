import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";

vi.mock("../api/client", () => ({
  apiPdca: {
    config: vi.fn(),
    salvarConfig: vi.fn(),
    listarFeedback: vi.fn(),
    descartarFeedback: vi.fn(),
    reabrirFeedback: vi.fn(),
    listarAjustes: vi.fn(),
    criarAjuste: vi.fn(),
    decidirAjuste: vi.fn(),
    reconsiderarAjuste: vi.fn(),
    aplicarAjuste: vi.fn(),
  },
  apiRegras: { obter: vi.fn() },
  apiCamposNo: { listar: vi.fn() },
  apiCamposAresta: { listar: vi.fn() },
  apiPipelineAgentes: { obter: vi.fn() },
  apiIa: { sugerir: vi.fn() },
}));

import { apiCamposAresta, apiCamposNo, apiIa, apiPdca, apiPipelineAgentes, apiRegras } from "../api/client";
import { PdcaTab } from "./PdcaTab";

const config: DiagramaConfig = {
  nodeTypes: {
    fila: {
      label: "Fila Rabbit",
      derives: "queue",
      techs: ["Backend"],
      contextos: ["Backend-mensageria"],
      spec: [{ key: "nome", label: "Nome da fila", type: "text", required: true, identificador: true }],
    },
  },
  edgeTypes: { sync: { label: "Chamada síncrona" } },
  edgeRules: {},
};

const regras = {
  tipos: [],
  tamanhos: [],
  porTech: { Backend: { checklistTecnico: [{ texto: "Logs relevantes emitidos", contextos: [] }], testes: [] } },
};

const feedback = {
  id: "f1",
  email: "dev@empresa.com",
  timeId: "time-pagamentos",
  texto: "faltou item de DLQ nas filas",
  estado: "novo" as const,
  solicitacaoId: null,
  criadoEm: new Date("2026-08-12T10:00:00Z").toISOString(),
};

function montar() {
  render(<PdcaTab config={config} timeAtivo="time-pagamentos" onAbrirArea={vi.fn()} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  (apiPdca.config as Mock).mockResolvedValue({ cadenciaUsos: 5, cadenciaFeedback: 3 });
  (apiPdca.listarFeedback as Mock).mockResolvedValue([feedback]);
  (apiPdca.listarAjustes as Mock).mockResolvedValue([]);
  (apiRegras.obter as Mock).mockResolvedValue(regras);
  (apiCamposNo.listar as Mock).mockResolvedValue([
    { id: "c1", timeId: "__global__", tipoNo: "fila", key: "nome", label: "Nome da fila", type: "text", required: true, ajuda: null },
    { id: "c2", timeId: "__global__", tipoNo: "fila", key: "dlq", label: "Tem DLQ?", type: "boolean", required: false, ajuda: null },
  ]);
  (apiCamposAresta.listar as Mock).mockResolvedValue([]);
  (apiPipelineAgentes.obter as Mock).mockResolvedValue({
    confirmacaoObrigatoria: true,
    papeis: [
      { id: "po", nome: "PO", grupo: "po", ativo: true, contextos: [] },
      { id: "qa", nome: "QA", grupo: "qa", ativo: true, contextos: [] },
    ],
  });
});

describe("PdcaTab — a jornada do PDCA (SPEC-45)", () => {
  it("o feedback do agente APARECE — era o buraco do §194 (escrita-só)", async () => {
    montar();
    expect(await screen.findByText(/faltou item de DLQ nas filas/)).toBeInTheDocument();
    expect(screen.getByTestId("feedbacks-do-ciclo").textContent).toContain("1 sem tratar");
  });

  it("propor ajuste abre o estúdio, e a prévia mostra a linha ENTRANDO num item de exemplo", async () => {
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));

    fireEvent.change(screen.getByLabelText("Texto do item"), { target: { value: "Política de DLQ definida" } });

    const previa = screen.getByTestId("previa-do-ajuste");
    await waitFor(() => expect(within(previa).getByTestId("previa-adicionado").textContent).toContain("Política de DLQ definida"));
    // O item simulado é o documento de verdade, com a regra já aplicada.
    expect(within(previa).getByTestId("previa-markdown").textContent).toContain("Política de DLQ definida");
  });

  it("tecnologia que o componente não usa avisa que NADA muda — o erro fácil de cometer", async () => {
    (apiRegras.obter as Mock).mockResolvedValue({
      ...regras,
      porTech: { ...regras.porTech, Frontend: { checklistTecnico: [], testes: [] } },
    });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));
    fireEvent.change(screen.getByLabelText("Texto do item"), { target: { value: "Acessibilidade verificada" } });
    fireEvent.change(screen.getByLabelText("Tecnologia alvo"), { target: { value: "Frontend" } });

    await waitFor(() => expect(screen.getByTestId("previa-sem-efeito").textContent).toContain("não é a deste componente"));
  });

  it("salvar cria a solicitação com a OPERAÇÃO e amarrada ao feedback", async () => {
    (apiPdca.criarAjuste as Mock).mockResolvedValue({ id: "s1" });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));
    fireEvent.change(screen.getByLabelText("Texto do item"), { target: { value: "Política de DLQ definida" } });
    fireEvent.click(screen.getByTestId("salvar-ajuste"));

    await waitFor(() =>
      expect(apiPdca.criarAjuste).toHaveBeenCalledWith(
        expect.objectContaining({
          recurso: "regras",
          feedbackId: "f1",
          operacao: {
            tipo: "adicionar-checklist",
            secao: "checklistTecnico",
            tech: "Backend",
            contextos: ["Backend-mensageria"],
            texto: "Política de DLQ definida",
          },
        })
      )
    );
  });

  it("o ✨ redige o texto do item a partir do feedback", async () => {
    (apiIa.sugerir as Mock).mockResolvedValue({ valor: "DLQ configurada e monitorada" });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));
    fireEvent.click(screen.getByTestId("redigir-com-ia"));

    await waitFor(() => expect(screen.getByLabelText("Texto do item")).toHaveValue("DLQ configurada e monitorada"));
    expect((apiIa.sugerir as Mock).mock.calls[0][0].contextoNo).toContain("faltou item de DLQ nas filas");
  });

  it("as solicitações aparecem JÁ no mount, e a aprovada aplica de verdade (o Act que faltava)", async () => {
    (apiPdca.listarAjustes as Mock).mockResolvedValue([
      {
        id: "s1",
        timeId: "time-pagamentos",
        solicitante: "dev@empresa.com",
        recurso: "regras",
        descricao: "faltou item de DLQ",
        estado: "aprovada",
        operacao: { tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "DLQ" },
        criadoEm: new Date().toISOString(),
      },
    ]);
    (apiPdca.aplicarAjuste as Mock).mockResolvedValue({ id: "s1", estado: "aplicada", aplicadaPor: "dev" });
    montar();

    await waitFor(() => expect(screen.getByTestId("solicitacoes-do-pdca")).toBeInTheDocument());
    expect(within(screen.getByTestId("ajuste-s1")).getByText(/faltou item de DLQ/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("aplicar-s1"));
    await waitFor(() => expect(apiPdca.aplicarAjuste).toHaveBeenCalledWith("s1"));
  });

  it("descartar registra a decisão de não tratar", async () => {
    (apiPdca.descartarFeedback as Mock).mockResolvedValue({ id: "f1", estado: "descartado" });
    montar();
    fireEvent.click(await screen.findByTestId("descartar-f1"));
    await waitFor(() => expect(apiPdca.descartarFeedback).toHaveBeenCalledWith("f1"));
  });
});

/**
 * SPEC-62 — quem decide decidia no escuro, e o "não" era um beco.
 *
 * RELATO REAL: *"só aparece direto para aprovar antes de conseguir ver o pdca
 * (não gerei nenhuma nova), e se rejeito simplesmente some para sempre"*.
 */
describe("PdcaTab — o card de quem DECIDE", () => {
  function pendente(extra: Record<string, unknown> = {}) {
    return {
      id: "s9",
      timeId: "time-pagamentos",
      solicitante: "dev@empresa.com",
      recurso: "regras",
      descricao: "Adicionar DLQ ao checklist",
      estado: "pendente",
      operacao: { tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "Política de DLQ monitorada" },
      criadoEm: new Date("2026-08-12T10:00:00Z").toISOString(),
      ...extra,
    };
  }

  it("§278 — diz QUANDO foi pedido: um de três semanas atrás era idêntico a um de hoje", async () => {
    (apiPdca.listarAjustes as Mock).mockResolvedValue([pendente()]);
    montar();

    const card = await screen.findByTestId("ajuste-s9");
    expect(card.textContent).toContain("12/08/2026");
  });

  it("§278 — mostra DE ONDE veio: o feedback que gerou o pedido", async () => {
    // O dado sempre existiu (`pdca_feedback.solicitacao_id`) e nunca chegava a
    // quem decide.
    (apiPdca.listarFeedback as Mock).mockResolvedValue([{ ...feedback, estado: "virou-ajuste", solicitacaoId: "s9" }]);
    (apiPdca.listarAjustes as Mock).mockResolvedValue([pendente()]);
    montar();

    const origem = await screen.findByTestId("origem-s9");
    expect(origem.textContent).toContain("faltou item de DLQ nas filas");
  });

  it("§278 — pedido escrito direto DIZ que não passou pelo ciclo", async () => {
    // Não é defeito (a SPEC-51 cria pedido em texto), mas é confiança diferente.
    (apiPdca.listarFeedback as Mock).mockResolvedValue([]);
    (apiPdca.listarAjustes as Mock).mockResolvedValue([pendente()]);
    montar();

    expect((await screen.findByTestId("sem-origem-s9")).textContent).toContain("sem passar pelo ciclo");
  });

  it("§278 — mostra O EFEITO num item de exemplo, que só quem PROPÕE via", async () => {
    (apiPdca.listarAjustes as Mock).mockResolvedValue([pendente()]);
    montar();

    fireEvent.click(await screen.findByTestId("ver-efeito-s9"));
    expect(screen.getByTestId("efeito-s9").textContent).toContain("Política de DLQ monitorada");
  });

  it("§278 — pedido só em texto avisa que aprovar NÃO aplica nada", async () => {
    // `POST /aplicar` recusa com "este pedido é só texto"; o botão prometia o
    // fechamento do ciclo e entregava um bilhete.
    (apiPdca.listarAjustes as Mock).mockResolvedValue([pendente({ operacao: null })]);
    montar();

    expect((await screen.findByTestId("so-texto-s9")).textContent).toContain("a mudança é à mão");
  });

  it("§278 — recusar pede o PORQUÊ, e o motivo vai junto na decisão", async () => {
    (apiPdca.listarAjustes as Mock).mockResolvedValue([pendente()]);
    (apiPdca.decidirAjuste as Mock).mockResolvedValue({ id: "s9", estado: "rejeitada" });
    montar();

    fireEvent.click(await screen.findByTestId("recusar-s9"));
    fireEvent.change(screen.getByLabelText("Motivo da recusa"), {
      target: { value: "já existe um item equivalente em observabilidade" },
    });
    fireEvent.click(screen.getByTestId("confirmar-recusa-s9"));

    await waitFor(() =>
      expect(apiPdca.decidirAjuste).toHaveBeenCalledWith("s9", false, "já existe um item equivalente em observabilidade")
    );
  });

  it("§278 — o recusado tem volta, e o 'não' anterior continua à vista", async () => {
    (apiPdca.listarAjustes as Mock).mockResolvedValue([
      pendente({ estado: "rejeitada", decididoPor: "ana@empresa.com", motivoDaDecisao: "duplicado" }),
    ]);
    (apiPdca.reconsiderarAjuste as Mock).mockResolvedValue({ id: "s9", estado: "pendente" });
    montar();

    expect((await screen.findByTestId("motivo-s9")).textContent).toContain("duplicado");
    fireEvent.click(screen.getByTestId("reconsiderar-s9"));
    await waitFor(() => expect(apiPdca.reconsiderarAjuste).toHaveBeenCalledWith("s9"));
  });

  it("§278 — o invalidado também reconsidera: a mensagem manda reavaliar e não havia como", async () => {
    (apiPdca.listarAjustes as Mock).mockResolvedValue([pendente({ estado: "invalida" })]);
    montar();

    expect(await screen.findByTestId("reconsiderar-s9")).toBeInTheDocument();
  });

  it("§278 — aprovada e aplicada não oferecem reconsiderar: não há o que desdizer", async () => {
    (apiPdca.listarAjustes as Mock).mockResolvedValue([pendente({ estado: "aplicada", aplicadaPor: "ana" })]);
    montar();

    await screen.findByTestId("ajuste-s9");
    expect(screen.queryByTestId("reconsiderar-s9")).toBeNull();
  });

  it("SPEC-46 — dá pra ajustar o checklist de PROCESSO, e a prévia mostra no item de exemplo", async () => {
    (apiPdca.criarAjuste as Mock).mockResolvedValue({ id: "s2" });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));

    fireEvent.change(screen.getByLabelText("Seção das regras"), { target: { value: "checklistProcesso" } });
    fireEvent.change(screen.getByLabelText("Texto do item"), { target: { value: "Repontar massa de teste" } });

    await waitFor(() =>
      expect(screen.getByTestId("previa-adicionado").textContent).toContain("Repontar massa de teste")
    );

    fireEvent.click(screen.getByTestId("salvar-ajuste"));
    await waitFor(() =>
      expect(apiPdca.criarAjuste).toHaveBeenCalledWith(
        expect.objectContaining({
          operacao: expect.objectContaining({ tipo: "adicionar-checklist", secao: "checklistProcesso" }),
        })
      )
    );
  });

  it("SPEC-46 — ciclo de teste pede o que valida e os ambientes", async () => {
    (apiPdca.criarAjuste as Mock).mockResolvedValue({ id: "s3" });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));

    fireEvent.change(screen.getByLabelText("Seção das regras"), { target: { value: "testes" } });
    fireEvent.change(screen.getByLabelText("Tipo do ciclo de teste"), { target: { value: "Teste de contrato" } });
    fireEvent.change(screen.getByLabelText("Validação do teste"), { target: { value: "pacto continua verde" } });
    fireEvent.click(screen.getByTestId("salvar-ajuste"));

    await waitFor(() =>
      expect(apiPdca.criarAjuste).toHaveBeenCalledWith(
        expect.objectContaining({
          operacao: expect.objectContaining({
            tipo: "adicionar-teste",
            tipoTeste: "Teste de contrato",
            validacao: "pacto continua verde",
            dev: true,
          }),
        })
      )
    );
  });

  it("SPEC-46 — volumetria é liga/desliga: sem campo de texto, e 'deixar de exigir' vira remover", async () => {
    (apiPdca.criarAjuste as Mock).mockResolvedValue({ id: "s4" });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));

    fireEvent.change(screen.getByLabelText("Seção das regras"), { target: { value: "volumetria" } });
    expect(screen.queryByLabelText("Texto do item")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tipo de ajuste"), { target: { value: "remover" } });
    fireEvent.click(screen.getByTestId("salvar-ajuste"));

    await waitFor(() =>
      expect(apiPdca.criarAjuste).toHaveBeenCalledWith(
        expect.objectContaining({ operacao: { tipo: "remover-volumetria", tech: "Backend" } })
      )
    );
  });

  it("SPEC-50 — o ajuste alcança a ESTEIRA: desligar um papel vira operação de pipeline", async () => {
    (apiPdca.criarAjuste as Mock).mockResolvedValue({ id: "s5" });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));

    fireEvent.change(screen.getByLabelText("Documento a ajustar"), { target: { value: "pipeline-agentes" } });
    await waitFor(() => expect(screen.getByLabelText("Papel da esteira")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Papel da esteira"), { target: { value: "qa" } });

    // A prévia do pipeline responde outra pergunta: quem escreve, não o texto.
    expect(screen.getByTestId("previa-do-pipeline").textContent).toContain("para de escrever");

    fireEvent.click(screen.getByTestId("salvar-ajuste"));
    await waitFor(() =>
      expect(apiPdca.criarAjuste).toHaveBeenCalledWith(
        expect.objectContaining({
          recurso: "pipeline-agentes",
          operacao: { tipo: "desativar-papel", papelId: "qa", papelNome: "QA" },
        })
      )
    );
  });

  it("SPEC-50 — papel já desligado sugere LIGAR: quem abre o ajuste quer mudar, não confirmar", async () => {
    (apiPipelineAgentes.obter as Mock).mockResolvedValue({
      confirmacaoObrigatoria: true,
      papeis: [{ id: "qa", nome: "QA", grupo: "qa", ativo: false, contextos: [] }],
    });
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));
    fireEvent.change(screen.getByLabelText("Documento a ajustar"), { target: { value: "pipeline-agentes" } });
    await waitFor(() => expect(screen.getByLabelText("Papel da esteira")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Papel da esteira"), { target: { value: "qa" } });

    expect(screen.getByLabelText("Ligar ou desligar")).toHaveValue("ligar");
    expect(screen.getByTestId("previa-do-pipeline").textContent).toContain("passa a escrever");
  });
});

/**
 * SPEC-52 — a ficha entra no ciclo. O que se testa aqui é o que a pessoa VÊ
 * antes de decidir (a ficha mudando, não o texto do item, que seria outra
 * pergunta) e o que sai do formulário como operação.
 */
describe("PdcaTab — o ajuste alcança a FICHA (SPEC-52)", () => {
  async function abrirFicha(alvo: "campos-no" | "campos-aresta" = "campos-no") {
    montar();
    fireEvent.click(await screen.findByTestId("propor-f1"));
    fireEvent.change(screen.getByLabelText("Documento a ajustar"), { target: { value: alvo } });
    await waitFor(() => expect(screen.getByTestId("previa-da-ficha")).toBeInTheDocument());
  }

  it("mostra a ficha REAL do componente e o campo novo entrando nela", async () => {
    await abrirFicha();
    await waitFor(() => expect(screen.getByTestId("previa-da-ficha").textContent).toContain("Nome da fila"));

    fireEvent.change(screen.getByLabelText("Rótulo do campo"), { target: { value: "SLA acordado" } });

    const previa = screen.getByTestId("previa-da-ficha");
    await waitFor(() => expect(within(previa).getByTestId("ficha-campo-novo").textContent).toContain("SLA acordado"));
    // Os que já existiam continuam listados — a prévia é a ficha inteira, não
    // só o delta: é assim que se vê se o campo novo faz sentido ao lado deles.
    expect(previa.textContent).toContain("Tem DLQ?");
  });

  it("a ficha da prévia inclui o que vem do COMPONENTE — omiti-los mentiria sobre o que a pessoa vai ver", async () => {
    // Achado real do E2E: a tabela de campos guarda só os CUSTOMIZADOS, e a
    // prévia mostrava só eles. Quem preenche vê os dois — o `spec` do tipo
    // junto com o que foi acrescentado.
    (apiCamposNo.listar as Mock).mockResolvedValue([]);
    await abrirFicha();
    await waitFor(() =>
      expect(screen.getByTestId("previa-da-ficha").textContent).toContain("Nome da fila")
    );
    expect(screen.getByTestId("ficha-campo-do-componente").textContent).toContain("do componente");
  });

  it("sem campo customizado, remover explica por que a lista está vazia em vez de só não oferecer nada", async () => {
    (apiCamposNo.listar as Mock).mockResolvedValue([]);
    await abrirFicha();
    fireEvent.change(screen.getByLabelText("Tipo de ajuste na ficha"), { target: { value: "remover" } });
    expect(await screen.findByTestId("sem-campo-removivel")).toHaveTextContent("não saem por aqui");
  });

  it("a chave técnica nasce do rótulo, sem acento nem espaço — e continua editável", async () => {
    await abrirFicha();
    fireEvent.change(screen.getByLabelText("Rótulo do campo"), { target: { value: "Tempo de retenção (dias)" } });
    expect(screen.getByLabelText("Chave do campo")).toHaveValue("tempo_de_retencao_dias");

    // Editada à mão, ela para de seguir o rótulo — senão a pessoa digita a
    // chave e vê o próximo caractere do rótulo apagá-la.
    fireEvent.change(screen.getByLabelText("Chave do campo"), { target: { value: "retencao" } });
    fireEvent.change(screen.getByLabelText("Rótulo do campo"), { target: { value: "Tempo de retenção" } });
    expect(screen.getByLabelText("Chave do campo")).toHaveValue("retencao");
  });

  it("salvar manda a operação de campo, com o recurso que decide quem aprova", async () => {
    await abrirFicha();
    fireEvent.change(screen.getByLabelText("Rótulo do campo"), { target: { value: "SLA acordado" } });
    fireEvent.change(screen.getByLabelText("Tipo do campo"), { target: { value: "number" } });
    fireEvent.click(screen.getByTestId("salvar-ajuste"));

    await waitFor(() =>
      expect(apiPdca.criarAjuste).toHaveBeenCalledWith(
        expect.objectContaining({
          recurso: "campos-no",
          operacao: {
            tipo: "adicionar-campo-no",
            tipoNo: "fila",
            campo: { key: "sla_acordado", label: "SLA acordado", tipoCampo: "number", obrigatorio: false },
          },
        })
      )
    );
  });

  it("remover escolhe entre os campos que EXISTEM, e a prévia risca o que sai", async () => {
    await abrirFicha();
    fireEvent.change(screen.getByLabelText("Tipo de ajuste na ficha"), { target: { value: "remover" } });
    await waitFor(() => expect(screen.getByLabelText("Campo a remover")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Campo a remover"), { target: { value: "dlq" } });

    const previa = screen.getByTestId("previa-da-ficha");
    await waitFor(() => expect(within(previa).getByTestId("ficha-campo-removido").textContent).toContain("Tem DLQ?"));
    expect(previa.textContent).toContain("Nome da fila");
  });

  it("a ficha da CONEXÃO usa os tipos de conexão, não os componentes — vocabulários diferentes", async () => {
    await abrirFicha("campos-aresta");
    expect(screen.getByLabelText("Componente da ficha").textContent).toContain("Chamada síncrona");
    expect(screen.getByLabelText("Componente da ficha").textContent).not.toContain("Fila Rabbit");
  });
});

/**
 * §266 — a mesma régua do `ProdutosTab`, na outra tela que tinha o defeito.
 */
describe("PdcaTab — a releitura não apaga a cadência que a pessoa mudou", () => {
  it("mudar a cadência e salvar não devolve o valor antigo", async () => {
    // `recarregar` roda depois de TODA ação desta tela, e trazia o valor do
    // servidor por cima do campo. Quem mudasse 5 → 9 e clicasse em salvar via
    // o 5 voltar, sem erro nenhum — e concluía que o botão não funciona.
    (apiPdca.salvarConfig as Mock).mockResolvedValue({ cadenciaUsos: 9, cadenciaFeedback: 3 });
    montar();

    const campo = await screen.findByLabelText("Cadência da entrevista (usos)");
    fireEvent.change(campo, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadência" }));

    await waitFor(() => expect(apiPdca.salvarConfig).toHaveBeenCalledWith({ cadenciaUsos: 9, cadenciaFeedback: 3 }));
    expect(screen.getByLabelText("Cadência da entrevista (usos)")).toHaveValue(9);
  });
});

/**
 * §276 — o histórico do ciclo, e a caixa que não podia fazer nada.
 */
describe("PdcaTab — o histórico conta o que o ciclo produziu", () => {
  function feedbackTratado(i: number, estado: "virou-ajuste" | "descartado", solicitacaoId: string | null = null) {
    return {
      id: `f${i}`,
      email: "dev@empresa",
      texto: `feedback ${i}`,
      estado,
      solicitacaoId,
      criadoEm: new Date(2026, 0, i + 1).toISOString(),
      timeId: null,
    };
  }

  function pedido(id: string, estado: string) {
    return {
      id,
      timeId: "time-pagamentos",
      solicitante: "dev@empresa",
      recurso: "regras",
      descricao: `pedido ${id}`,
      estado,
      operacao: null,
      criadoEm: new Date(2026, 0, 5).toISOString(),
    };
  }

  /**
   * SPEC-62 §4 — o placar contava `virou-ajuste` como "virou mudança", e um
   * feedback cujo pedido foi RECUSADO entrava na conta. O placar nasceu para
   * responder "o que isto mudou"; assim ele respondia o contrário.
   */
  it("§278 — só conta como mudança o que foi APLICADO; recusa conta como recusa", async () => {
    (apiPdca.listarFeedback as Mock).mockResolvedValue([
      feedbackTratado(1, "virou-ajuste", "a1"),
      feedbackTratado(2, "virou-ajuste", "a2"),
      feedbackTratado(3, "descartado"),
    ]);
    (apiPdca.listarAjustes as Mock).mockResolvedValue([pedido("a1", "aplicada"), pedido("a2", "rejeitada")]);
    montar();

    const placar = await screen.findByTestId("historico-do-ciclo");
    expect(placar.textContent).toContain("1 de 3 viraram mudança aplicada");
    expect(placar.textContent).toContain("1 foram lidos e descartados");
    expect(placar.textContent).toContain("1 viraram pedido e foram recusados");
  });

  it("§278 — o feedback descartado tem caminho de volta", async () => {
    // Ele sumia da tela (ia para dentro deste histórico fechado) e não voltava
    // a "sem tratar": descarte silencioso ensina o time a parar de responder.
    (apiPdca.listarFeedback as Mock).mockResolvedValue([feedbackTratado(3, "descartado")]);
    (apiPdca.reabrirFeedback as Mock).mockResolvedValue({ id: "f3", estado: "novo" });
    montar();

    await screen.findByTestId("historico-do-ciclo");
    fireEvent.click(screen.getByTestId("reabrir-f3"));
    await waitFor(() => expect(apiPdca.reabrirFeedback).toHaveBeenCalledWith("f3"));
  });

  it("com muitos tratados, corta — e o resto se pede", async () => {
    (apiPdca.listarFeedback as Mock).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => feedbackTratado(i, "virou-ajuste"))
    );
    montar();

    await screen.findByTestId("historico-do-ciclo");
    expect(screen.getAllByTestId(/^tratado-/)).toHaveLength(8);

    fireEvent.click(screen.getByTestId("ver-todo-o-historico"));
    expect(screen.getAllByTestId(/^tratado-/)).toHaveLength(12);
  });
});
