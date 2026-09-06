import { describe, expect, it } from "vitest";
import type { Diagrama, DiagramaConfig } from "@gerador/engine";
import { filaDaEsteiraDaDemanda } from "./filaDaEsteira.js";
import { PAPEIS_PADRAO } from "../config/normalizacao.js";

/**
 * SPEC-107 G5 — a fila da esteira a partir da DEMANDA, no servidor.
 *
 * O grosso da montagem (placeholders por papel, dono da seção, encadeamento)
 * é provado pelos 60+ testes da ReviewScreen, que agora passam pela MESMA
 * função (§263). Aqui se prova o caminho da fiação: demanda → atividades →
 * fichas → fila, com a régua de pendentes.
 */

const CONFIG = {
  nodeTypes: {
    service: {
      label: "Serviço",
      techs: ["Backend"],
      contextos: ["Backend"],
      spec: [{ key: "nome", label: "Nome", type: "text", required: true }],
    },
  },
  edgeTypes: { http: { label: "HTTP" } },
  edgeRules: {},
} as unknown as DiagramaConfig;

const DIAGRAMA = {
  nodes: [
    {
      id: "a",
      type: "service",
      x: 0,
      y: 0,
      label: "Aprovação",
      status: "novo",
      spec: { nome: { valor: "aprovacao", origem: "manual" } },
      specNA: {},
    },
  ],
  edges: [],
} as unknown as Diagrama;

describe("filaDaEsteiraDaDemanda (SPEC-107 G5)", () => {
  it("a demanda vira fila: um item por atividade, placeholders separados por papel", () => {
    const fila = filaDaEsteiraDaDemanda({ diagrama: DIAGRAMA }, { diagramaConfig: CONFIG, papeisAtivos: PAPEIS_PADRAO });

    expect(fila.length).toBeGreaterThan(0);
    const item = fila[0];
    expect(item.atividadeChave).toBeTruthy();
    expect(item.atividadeRotulo).toBeTruthy();
    // Todos os papéis padrão têm entrada no mapa (mesmo que vazia) — a chave é
    // o ID do papel configurado, não o grupo.
    for (const p of PAPEIS_PADRAO) expect(item.placeholdersPorPapel).toHaveProperty(p.id);
    // O PO sempre tem trabalho num item recém-derivado: história/critérios.
    expect(item.placeholdersPorPapel["po"].length).toBeGreaterThan(0);
  });

  it("o que já foi CONFIRMADO não volta para a fila — e vira insumo dos papéis", () => {
    const semRespostas = filaDaEsteiraDaDemanda({ diagrama: DIAGRAMA }, { diagramaConfig: CONFIG, papeisAtivos: PAPEIS_PADRAO });
    const chaveDoItem = semRespostas[0].atividadeChave;
    const chaveDaHistoria = semRespostas[0].placeholdersPorPapel["po"][0].chave;

    const comConfirmada = filaDaEsteiraDaDemanda(
      {
        diagrama: DIAGRAMA,
        respostasItens: { [chaveDoItem]: { [chaveDaHistoria]: { valor: "Como analista, quero…", origem: "manual" } } },
      },
      { diagramaConfig: CONFIG, papeisAtivos: PAPEIS_PADRAO }
    );

    const item = comConfirmada.find((i) => i.atividadeChave === chaveDoItem)!;
    expect(item.placeholdersPorPapel["po"].map((p) => p.chave)).not.toContain(chaveDaHistoria);
    // O confirmado entra como insumo (o Arquiteto lê a história do PO).
    expect(item.respostasExistentes?.map((r) => r.valor)).toContain("Como analista, quero…");
  });

  it("`apenasPendentes: false` é o 'Gerar de novo' — regenera até o confirmado", () => {
    const fila = filaDaEsteiraDaDemanda({ diagrama: DIAGRAMA }, { diagramaConfig: CONFIG, papeisAtivos: PAPEIS_PADRAO });
    const chaveDoItem = fila[0].atividadeChave;
    const chaveDaHistoria = fila[0].placeholdersPorPapel["po"][0].chave;

    const tudo = filaDaEsteiraDaDemanda(
      {
        diagrama: DIAGRAMA,
        respostasItens: { [chaveDoItem]: { [chaveDaHistoria]: { valor: "confirmada", origem: "manual" } } },
      },
      { diagramaConfig: CONFIG, papeisAtivos: PAPEIS_PADRAO, apenasPendentes: false }
    );

    expect(tudo.find((i) => i.atividadeChave === chaveDoItem)!.placeholdersPorPapel["po"].map((p) => p.chave)).toContain(
      chaveDaHistoria
    );
  });

  it("desenho que não deriva nada vira fila vazia — ausência, não erro", () => {
    expect(
      filaDaEsteiraDaDemanda(
        { diagrama: { nodes: [], edges: [] } as unknown as Diagrama },
        { diagramaConfig: CONFIG, papeisAtivos: PAPEIS_PADRAO }
      )
    ).toEqual([]);
  });
});
