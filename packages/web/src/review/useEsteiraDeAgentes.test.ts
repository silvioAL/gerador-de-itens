import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { EVIDENCIA_SIMULADA } from "@gerador/engine";
import { TAM_LOTE_ESTEIRA, extrairRespostasParciaisAninhadas, useEsteiraDeAgentes, type ItemFilaEsteira } from "./useEsteiraDeAgentes";

const apiIaSugerirPipelineMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async (importActual) => ({
  // Constantes reais (PAPEIS_PADRAO etc.) — só a API de rede é mockada.
  ...(await importActual<typeof import("../api/client")>()),
  apiIa: { sugerirPipeline: apiIaSugerirPipelineMock },
}));

interface PedidoLote {
  contextoEpico?: string;
  itens: { chave: string; rotulo: string; contextoNo: string; placeholders: { chave: string }[] }[];
}

beforeEach(() => {
  apiIaSugerirPipelineMock.mockReset();
  apiIaSugerirPipelineMock.mockResolvedValue({});
});

function item(n: number): ItemFilaEsteira {
  return {
    atividadeChave: `a${n}`,
    atividadeRotulo: `Atividade ${n}`,
    contextoNo: "",
    placeholdersPorPapel: {
      po: [{ chave: "_historiaUsuario", tech: "", rotulo: "História de usuário" }],
      arquiteto: [{ chave: "_contratoRequest", tech: "", rotulo: "Request" }],
      especialista: [{ chave: `Backend::req${n}`, tech: "Backend", rotulo: `Requisito ${n}` }],
      qa: [{ chave: "_regrasTeste", tech: "", rotulo: "Regras de teste" }],
    },
  };
}

/** Resposta aninhada item→chave→valor no formato que a rota de lote devolve. */
function respostaDoLote(papel: string, pedido: PedidoLote) {
  return Object.fromEntries(
    pedido.itens.map((i) => [i.chave, Object.fromEntries(i.placeholders.map((p) => [p.chave, `resposta ${papel}/${i.chave}/${p.chave}`]))])
  );
}

describe("extrairRespostasParciaisAninhadas (SPEC-24 Fase E — o que o modelo escreve, por item e por chave)", () => {
  it("JSON aninhado completo: extrai todos os itens e pares", () => {
    expect(
      extrairRespostasParciaisAninhadas('{"a1": {"_historiaUsuario": "Como analista, quero X", "_criteriosAceite": "1. Y"}, "a2": {"_historiaUsuario": "Como gestor, quero Z"}}')
    ).toEqual({
      a1: { _historiaUsuario: "Como analista, quero X", _criteriosAceite: "1. Y" },
      a2: { _historiaUsuario: "Como gestor, quero Z" },
    });
  });

  it("JSON INCOMPLETO (o modelo ainda escrevendo): o último valor vem até onde chegou", () => {
    expect(extrairRespostasParciaisAninhadas('{"a1": {"_historiaUsuario": "Como analista, quero rec')).toEqual({
      a1: { _historiaUsuario: "Como analista, quero rec" },
    });
  });

  it("escapes de aspas e quebras de linha viram texto de verdade", () => {
    expect(extrairRespostasParciaisAninhadas('{"a1": {"chave": "linha 1\\nlinha \\"dois\\""}}')).toEqual({
      a1: { chave: 'linha 1\nlinha "dois"' },
    });
  });
});

describe("useEsteiraDeAgentes (SPEC-24 — orquestração por papel × lotes de itens)", () => {
  it("processa papel por papel, o LOTE inteiro numa chamada só, antes de passar pro próximo (handoff)", async () => {
    const chamadas: string[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => {
      chamadas.push(`${papel}:${pedido.itens.map((i) => i.rotulo).join("+")}`);
      return {};
    });
    const { result } = renderHook(() => useEsteiraDeAgentes({}));

    act(() => result.current.iniciar([item(1), item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    // Uma chamada por papel com os 2 itens juntos — não mais uma por item.
    expect(chamadas).toEqual([
      "po:Atividade 1+Atividade 2",
      "arquiteto:Atividade 1+Atividade 2",
      "especialista:Atividade 1+Atividade 2",
      "qa:Atividade 1+Atividade 2",
    ]);
  });

  it(`mais itens que o lote: quebra em grupos de ${TAM_LOTE_ESTEIRA}, cada grupo com o contexto completo de novo`, async () => {
    const chamadas: { papel: string; chaves: string[]; contextoEpico?: string }[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => {
      chamadas.push({ papel, chaves: pedido.itens.map((i) => i.chave), contextoEpico: pedido.contextoEpico });
      return {};
    });
    const fila = Array.from({ length: TAM_LOTE_ESTEIRA + 2 }, (_, n) => item(n + 1));
    const { result } = renderHook(() => useEsteiraDeAgentes({ contextoEpico: "épico de crédito" }));

    act(() => result.current.iniciar(fila));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    const doPo = chamadas.filter((c) => c.papel === "po");
    expect(doPo).toHaveLength(2);
    expect(doPo[0].chaves).toHaveLength(TAM_LOTE_ESTEIRA);
    expect(doPo[1].chaves).toEqual([`a${TAM_LOTE_ESTEIRA + 1}`, `a${TAM_LOTE_ESTEIRA + 2}`]);
    // "Recuperação do contexto": o segundo lote recebe o contexto do épico de novo.
    expect(doPo[1].contextoEpico).toBe("épico de crédito");
  });

  it("distribui a resposta aninhada de cada papel via onResponderItem, sugerido/não confirmado", async () => {
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => respostaDoLote(papel, pedido));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem }));

    act(() => result.current.iniciar([item(1), item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem).toHaveBeenCalledWith("a1", "_historiaUsuario", {
      valor: "resposta po/a1/_historiaUsuario", origem: "sugerido", confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a2", "_historiaUsuario", {
      valor: "resposta po/a2/_historiaUsuario", origem: "sugerido", confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a1", "Backend::req1", {
      valor: "resposta especialista/a1/Backend::req1", origem: "sugerido", confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a1", "_regrasTeste", {
      valor: "resposta qa/a1/_regrasTeste", origem: "sugerido", confirmado: false,
    });
  });

  it("SPEC-74 — com destino simulado, a resposta nasce com a evidência de que nenhum modelo foi consultado", async () => {
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => respostaDoLote(papel, pedido));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem, simulado: true }));

    act(() => result.current.iniciar([item(1)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem).toHaveBeenCalledWith("a1", "_historiaUsuario", {
      valor: "resposta po/a1/_historiaUsuario",
      origem: "sugerido",
      confirmado: false,
      evidencia: EVIDENCIA_SIMULADA,
    });
  });

  it("e sem destino simulado a resposta sai limpa — marcar trabalho legítimo é o erro caro", async () => {
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => respostaDoLote(papel, pedido));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem }));

    act(() => result.current.iniciar([item(1)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem.mock.calls.every(([, , r]) => r.evidencia === undefined)).toBe(true);
  });

  it("item com MUITO mais placeholders que os outros no mesmo lote recebe todos — chaves com '::', espaços e acentos", async () => {
    // Achado da validação real (cenário de integração interna): o item do nó
    // marcado como EXISTENTE tinha 17 placeholders contra 10 dos demais — 9
    // deles do especialista, com chaves como
    // "Backend::volumetria::Response time" e "Backend::Definir timeout e
    // política de retry". Ele terminou a esteira sem nenhum pip aceso,
    // enquanto os outros 3 itens do MESMO lote acenderam os 4. Este teste
    // fixa a parte que é nossa: dado que o modelo devolve as chaves, a
    // distribuição não pode perder nenhuma por causa da forma da chave nem
    // do desequilíbrio de tamanho entre itens do lote.
    const chavesPesadas = [
      "Backend::Definir pontos de log (decisão, erro, correlação)",
      "Backend::Definir timeout e política de retry",
      "Backend::Definir autenticação/autorização da chamada",
      "Backend::volumetria::Response time",
      "Backend::volumetria::RPS (Requisições por segundo)",
    ];
    const pesado: ItemFilaEsteira = {
      atividadeChave: "n2::ep0",
      atividadeRotulo: "Endpoint do serviço existente",
      contextoNo: "",
      placeholdersPorPapel: {
        po: [{ chave: "_historiaUsuario", tech: "", rotulo: "História de usuário" }],
        arquiteto: [{ chave: "_contratoRequest", tech: "", rotulo: "Request" }],
        especialista: chavesPesadas.map((chave) => ({ chave, tech: "Backend", rotulo: chave })),
        qa: [{ chave: "_regrasTeste", tech: "", rotulo: "Regras de teste" }],
      },
    };
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => respostaDoLote(papel, pedido));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem }));

    act(() => result.current.iniciar([item(1), pesado, item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    const respondidasDoPesado = onResponderItem.mock.calls.filter(([chave]) => chave === "n2::ep0").map(([, ph]) => ph);
    expect(respondidasDoPesado).toEqual(["_historiaUsuario", "_contratoRequest", ...chavesPesadas, "_regrasTeste"]);
    // E o item leve do mesmo lote não perde nada por conviver com o pesado.
    expect(onResponderItem.mock.calls.filter(([chave]) => chave === "a1")).toHaveLength(4);
  });

  it("resposta que volta sem campos de um item AVISA no console — a falha que custou horas era silenciosa", async () => {
    const avisos: unknown[][] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...args) => void avisos.push(args));
    // O modelo responde o item a1 e ignora o a2 — exatamente o formato do
    // problema observado na validação real.
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => {
      const completa = respostaDoLote(papel, pedido);
      delete completa.a2;
      return completa;
    });
    const { result } = renderHook(() => useEsteiraDeAgentes({}));

    act(() => result.current.iniciar([item(1), item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    const doA2 = avisos.filter((a) => String(a[0]).includes('"a2"'));
    // Um aviso por papel que perdeu o item — nenhum papel some sem deixar rastro.
    expect(doA2).toHaveLength(4);
    expect(String(doA2[0][0])).toContain("[esteira/po]");
    spy.mockRestore();
  });

  it("respostasAoVivoPorItem reflete o streaming aninhado DURANTE a chamada, e limpa ao terminar; atual segue o item escrito", async () => {
    let emitir!: (acumulado: string) => void;
    let liberar!: () => void;
    apiIaSugerirPipelineMock.mockImplementationOnce(
      (_papel: string, _pedido: unknown, onTexto: (acumulado: string) => void) =>
        new Promise((resolve) => {
          emitir = onTexto;
          liberar = () => resolve({ a1: { _historiaUsuario: "final" } });
        })
    );
    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar([item(1), item(2)]));

    // Antes do primeiro token: o lote inteiro está "escrevendo", e `atual`
    // cai no primeiro item do lote.
    await waitFor(() => expect(result.current.escrevendoChaves).toEqual(["a1", "a2"]));
    expect(result.current.atual?.atividadeChave).toBe("a1");

    act(() => emitir('{"a1": {"_historiaUsuario": "Como um analista de cré'));
    await waitFor(() =>
      expect(result.current.respostasAoVivoPorItem.a1?._historiaUsuario).toBe("Como um analista de cré")
    );

    // O modelo passou pro segundo item do lote — `atual` acompanha.
    act(() => emitir('{"a1": {"_historiaUsuario": "Como um analista"}, "a2": {"_historiaUsuario": "Como um gestor'));
    await waitFor(() => expect(result.current.atual?.atividadeChave).toBe("a2"));

    act(() => liberar());
    await waitFor(() => expect(result.current.respostasAoVivoPorItem).toEqual({}));
  });

  it("confirmacaoObrigatoria: false aplica direto (confirmado: true), sem pausa — SPEC-24 Fase E, achado real do usuário", async () => {
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => respostaDoLote(papel, pedido));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ confirmacaoObrigatoria: false, onResponderItem }));

    act(() => result.current.iniciar([item(1)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem).toHaveBeenCalledWith("a1", "_historiaUsuario", {
      valor: "resposta po/a1/_historiaUsuario", origem: "sugerido", confirmado: true,
    });
  });

  it("item sem nada pra um papel fica fora do lote desse papel, sem quebrar a esteira", async () => {
    const chamadas: { papel: string; chaves: string[] }[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => {
      chamadas.push({ papel, chaves: pedido.itens.map((i) => i.chave) });
      return {};
    });
    const itemSemEspecialista: ItemFilaEsteira = { ...item(2), placeholdersPorPapel: { ...item(2).placeholdersPorPapel, especialista: [] } };

    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar([item(1), itemSemEspecialista]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(chamadas.find((c) => c.papel === "especialista")?.chaves).toEqual(["a1"]);
    expect(chamadas.find((c) => c.papel === "qa")?.chaves).toEqual(["a1", "a2"]);
  });

  it("nunca chama dois lotes em paralelo", async () => {
    let emVoo = 0;
    let maxSimultaneo = 0;
    apiIaSugerirPipelineMock.mockImplementation(async () => {
      emVoo++;
      maxSimultaneo = Math.max(maxSimultaneo, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
      return {};
    });
    const fila = Array.from({ length: TAM_LOTE_ESTEIRA + 2 }, (_, n) => item(n + 1));
    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar(fila));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(maxSimultaneo).toBe(1);
  });

  it("papelAtual reflete o handoff em andamento", async () => {
    let liberarPo!: () => void;
    apiIaSugerirPipelineMock
      .mockImplementationOnce(() => new Promise((resolve) => { liberarPo = () => resolve({}); }))
      // Os demais papéis nunca resolvem nesse teste — só interessa provar que
      // o handoff PO→Arquiteto aconteceu, sem a esteira inteira correr sozinha
      // rápido demais pro `waitFor` observar o estado intermediário.
      .mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar([item(1)]));

    await waitFor(() => expect(result.current.papelAtual).toBe("po"));
    expect(result.current.atual?.atividadeChave).toBe("a1");

    act(() => liberarPo());
    await waitFor(() => expect(result.current.papelAtual).toBe("arquiteto"));
  });

  it("pausar interrompe antes do próximo lote; continuar retoma", async () => {
    let liberarPrimeira!: () => void;
    apiIaSugerirPipelineMock
      .mockImplementationOnce(() => new Promise((resolve) => { liberarPrimeira = () => resolve({}); }))
      .mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useEsteiraDeAgentes({}));

    act(() => result.current.iniciar([item(1), item(2)]));
    act(() => result.current.pausar());
    expect(result.current.pausado).toBe(true);

    act(() => liberarPrimeira());
    await new Promise((r) => setTimeout(r, 250));
    expect(apiIaSugerirPipelineMock).toHaveBeenCalledTimes(1);

    act(() => result.current.continuar());
    await waitFor(() => expect(apiIaSugerirPipelineMock).toHaveBeenCalledTimes(2));
  });

  it("encadeamento: o papel seguinte recebe as respostas do anterior (e as pré-existentes da fila) como respostasAnteriores", async () => {
    const pedidosPorPapel: Record<string, { respostasAnteriores?: { rotulo: string; valor: string }[] }[]> = {};
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote & { itens: { respostasAnteriores?: { rotulo: string; valor: string }[] }[] }) => {
      pedidosPorPapel[papel] = pedido.itens;
      if (papel === "po") return { a1: { _historiaUsuario: "Como analista, quero X" } };
      return {};
    });
    const filaItem: ItemFilaEsteira = {
      ...item(1),
      respostasExistentes: [{ rotulo: "Request", valor: "POST /v1/coisas {id}" }],
    };
    const { result } = renderHook(() => useEsteiraDeAgentes({}));

    act(() => result.current.iniciar([filaItem]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    // O PO já recebe o que existia antes da corrida (ex.: edição do usuário).
    expect(pedidosPorPapel.po[0].respostasAnteriores).toEqual([{ rotulo: "Request", valor: "POST /v1/coisas {id}" }]);
    // O Arquiteto recebe o de antes + o que o PO acabou de escrever.
    expect(pedidosPorPapel.arquiteto[0].respostasAnteriores).toEqual([
      { rotulo: "Request", valor: "POST /v1/coisas {id}" },
      { rotulo: "História de usuário", valor: "Como analista, quero X" },
    ]);
  });

  it("Fase F: papéis configurados dirigem a esteira — ordem custom, papel extra e nenhuma chamada pra quem ficou de fora", async () => {
    const chamadas: string[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string) => {
      chamadas.push(papel);
      return {};
    });
    // QA primeiro, um agente contextual custom no meio, e SEM arquiteto.
    const papeis = [
      { id: "qa", nome: "QA", grupo: "qa" as const, ativo: true, contextos: [] },
      { id: "especialista-kafka", nome: "Especialista Kafka", grupo: "especialista" as const, ativo: true, contextos: [] },
      { id: "po", nome: "PO", grupo: "po" as const, ativo: true, contextos: [] },
    ];
    const base = item(1);
    const filaItem: ItemFilaEsteira = {
      ...base,
      // A fila já vem chaveada pelo ID do papel configurado (quem monta é a
      // ReviewScreen) — o hook só segue a lista.
      placeholdersPorPapel: {
        qa: base.placeholdersPorPapel.qa,
        "especialista-kafka": base.placeholdersPorPapel.especialista,
        po: base.placeholdersPorPapel.po,
      },
    };
    const { result } = renderHook(() => useEsteiraDeAgentes({ papeis }));

    act(() => result.current.iniciar([filaItem]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(chamadas).toEqual(["qa", "especialista-kafka", "po"]);
  });

  it("iniciar de novo reinicia do zero, mesmo com execução anterior em voo (token invalida a antiga)", async () => {
    let liberarAntiga!: () => void;
    apiIaSugerirPipelineMock
      .mockImplementationOnce(() => new Promise((resolve) => { liberarAntiga = () => resolve({ a1: { _historiaUsuario: "antiga" } }); }))
      .mockResolvedValue({});
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem }));

    act(() => result.current.iniciar([item(1)]));
    act(() => result.current.iniciar([item(2)]));

    liberarAntiga();
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem).not.toHaveBeenCalledWith("a1", expect.anything(), expect.anything());
  });
});

describe("resposta truncada no fim do lote (bug real: 'vi o PO escrevendo e depois todos ficaram vazios')", () => {
  /** Simula o que acontece de verdade: o texto streama (e a pessoa vê), mas o
   * corpo chega truncado e o `JSON.parse` dentro de `sugerirPipeline` explode
   * — exatamente no handoff pro papel seguinte. */
  function loteQueTruncaNoFim(papelQueFalha: string) {
    return async (papel: string, pedido: PedidoLote, onTexto?: (t: string) => void) => {
      const completo = JSON.stringify(respostaDoLote(papel, pedido));
      if (papel !== papelQueFalha) {
        onTexto?.(completo);
        return JSON.parse(completo);
      }
      // Streama até quase o fim e "morre" — é o que o usuário vê na tela.
      onTexto?.(completo.slice(0, Math.floor(completo.length * 0.8)));
      throw new SyntaxError("Unexpected end of JSON input");
    };
  }

  it("o que o modelo chegou a escrever é APLICADO, em vez de sumir com o lote inteiro", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiIaSugerirPipelineMock.mockImplementation(loteQueTruncaNoFim("po"));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem }));

    act(() => result.current.iniciar([item(1), item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    // O PO falhou no parse — mas o que ele escreveu antes de truncar ficou.
    const doPo = onResponderItem.mock.calls.filter(([, chave]) => chave === "_historiaUsuario");
    expect(doPo.length).toBeGreaterThan(0);
    expect(doPo[0][2]).toMatchObject({ origem: "sugerido", confirmado: false });
    // A falha deixou de ser silenciosa.
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[esteira/po]"), expect.anything());

    spy.mockRestore();
    aviso.mockRestore();
  });

  it("texto recuperado nunca nasce confirmado, mesmo com confirmação desligada — pode estar truncado", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiIaSugerirPipelineMock.mockImplementation(loteQueTruncaNoFim("po"));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() =>
      useEsteiraDeAgentes({ onResponderItem, confirmacaoObrigatoria: false })
    );

    act(() => result.current.iniciar([item(1)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    const doPo = onResponderItem.mock.calls.filter(([, chave]) => chave === "_historiaUsuario");
    expect(doPo[0][2].confirmado).toBe(false);
    // Os papéis seguintes, que não falharam, seguem confirmando direto.
    const doQa = onResponderItem.mock.calls.filter(([, chave]) => chave === "_regrasTeste");
    expect(doQa[0][2].confirmado).toBe(true);

    spy.mockRestore();
    aviso.mockRestore();
  });

  it("a esteira não trava: os papéis seguintes rodam mesmo com o lote do PO quebrado", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiIaSugerirPipelineMock.mockImplementation(loteQueTruncaNoFim("po"));
    const { result } = renderHook(() => useEsteiraDeAgentes({}));

    act(() => result.current.iniciar([item(1)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(apiIaSugerirPipelineMock.mock.calls.map((c) => c[0])).toEqual([
      "po", "arquiteto", "especialista", "qa",
    ]);
    spy.mockRestore();
    aviso.mockRestore();
  });
});
