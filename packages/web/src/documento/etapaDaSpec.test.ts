import { describe, expect, it } from "vitest";
import type { ItemGerado } from "../api/client";
import { contarPipeline, etapaDaSpec, temEnvioEmCurso } from "./etapaDaSpec";

/**
 * SPEC-115 fatia E — **a prova de que o pipeline não é estado de tela.**
 *
 * Tudo aqui é função pura sobre o item que veio do servidor. É esse desenho que
 * faz o F5 funcionar: se a etapa fosse guardada em algum lugar do cliente, ela
 * se perderia no recarregar; sendo derivada, ela se reconstrói sozinha a partir
 * do mesmo dado — e é isso que o último teste deste arquivo afirma.
 */
function item(chave: string, p: Partial<ItemGerado> = {}): ItemGerado {
  return {
    id: chave,
    quebraId: "q1",
    chave,
    titulo: `Item ${chave}`,
    tipo: "atomica",
    tamanho: "P",
    dependencias: [],
    corpoMarkdown: "corpo",
    pendencias: 0,
    sugestoes: 0,
    estado: "gerado",
    linkExterno: null,
    specAnexada: false,
    specEnviadaEm: null,
    specErro: null,
    criadoEm: "2026-09-10T10:00:00.000Z",
    ...p,
  };
}

describe("etapaDaSpec — o pipeline da SPEC-98 §3.2, lido do dado", () => {
  it("sem link do tracker, o item está na fila — não há onde anexar", () => {
    expect(etapaDaSpec(item("a"))).toBe("naFila");
  });

  it("com link e sem spec, está esperando — e isso NÃO é o mesmo que estar indo", () => {
    // A combinação que a SPEC-98 §3.2 nomeou: "história subiu, spec não". Ela
    // não é erro nem sucesso, e somá-la a qualquer um dos dois é o defeito do
    // §276 (dois estados diferentes num rótulo só).
    expect(etapaDaSpec(item("a", { estado: "exportado", linkExterno: "https://tracker/A-1" }))).toBe("noTracker");
  });

  it("com o envio marcado, está indo agora", () => {
    const indo = item("a", {
      estado: "exportado",
      linkExterno: "https://tracker/A-1",
      specEnviadaEm: "2026-09-10T10:05:00.000Z",
    });
    expect(etapaDaSpec(indo)).toBe("anexando");
  });

  it("anexada vence o carimbo de envio — o que chegou não está mais a caminho", () => {
    const chegou = item("a", {
      linkExterno: "https://tracker/A-1",
      specEnviadaEm: "2026-09-10T10:05:00.000Z",
      specAnexada: true,
    });
    expect(etapaDaSpec(chegou)).toBe("anexada");
  });

  it("o erro vence tudo: um item com motivo de falha está PARADO, não esperando", () => {
    // É a única etapa que contradiz as outras. Sem esta precedência, um item
    // que falhou apareceria como "no tracker esperando" — e a tela prometeria
    // uma continuação que não vai acontecer.
    const falhou = item("a", {
      linkExterno: "https://tracker/A-1",
      specEnviadaEm: "2026-09-10T10:05:00.000Z",
      specErro: "o agente respondeu HTTP 500",
    });
    expect(etapaDaSpec(falhou)).toBe("falhou");
  });
});

describe("contarPipeline — a contagem REAL que substitui a barra fingida", () => {
  it("conta cada etapa separadamente, sem somar estados diferentes", () => {
    const contagem = contarPipeline([
      item("a", { linkExterno: "https://t/A", specAnexada: true }),
      item("b", { linkExterno: "https://t/B", specEnviadaEm: "2026-09-10T10:05:00.000Z" }),
      item("c", { linkExterno: "https://t/C" }),
      item("d", { linkExterno: "https://t/D", specErro: "não consegui falar com o agente" }),
      item("e"),
    ]);

    expect(contagem).toEqual({ anexada: 1, anexando: 1, noTracker: 1, falhou: 1, naFila: 1, total: 5 });
  });
});

describe("temEnvioEmCurso — o que liga o acompanhamento", () => {
  it("é falso quando ninguém está indo, mesmo com itens pendentes", () => {
    // Pendente não é em curso: um item esperando a spec não faz a tela ficar
    // perguntando ao servidor para sempre.
    expect(temEnvioEmCurso([item("a", { linkExterno: "https://t/A" })])).toBe(false);
  });

  it("é verdadeiro a partir do dado, e não de um clique — é o que faz o F5 continuar acompanhando", () => {
    /**
     * A prova central da fatia E. Ninguém clicou em nada nesta "sessão": os
     * itens simplesmente chegaram do servidor com o envio marcado, como
     * chegariam depois de um recarregar no meio de um envio de minutos. A tela
     * liga o acompanhamento mesmo assim.
     */
    const recemCarregadosDoServidor = [
      item("a", { linkExterno: "https://t/A", specAnexada: true }),
      item("b", { linkExterno: "https://t/B", specEnviadaEm: "2026-09-10T10:05:00.000Z" }),
    ];
    expect(temEnvioEmCurso(recemCarregadosDoServidor)).toBe(true);
  });
});
