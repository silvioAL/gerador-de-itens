import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "../config/types.js";
import type { Atividade, Diagrama, No } from "../model/types.js";
import { estruturarDocumento } from "./estruturarDocumento.js";
import { gerarEspecificacaoEntrega } from "../especificacao/gerarEspecificacaoEntrega.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: ["Backend-dados"],
      spec: [{ key: "nome", label: "Nome", type: "text", required: true }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

function no(id: string): No {
  return { id, type: "service", x: 0, y: 0, label: id, status: "novo", spec: {}, specNA: {} };
}
const diagrama: Diagrama = { nodes: [no("n1"), no("n2")], edges: [] };

const atividade: Atividade = {
  chave: "n1::criacao",
  rotulo: "01",
  tipo: "História",
  tamanho: "P",
  descricao: "Criar n1",
  techs: ["Backend"],
  contextos: ["Backend-dados"],
  dependencias: [],
  origem: { nodeId: "n1" },
};

const DECISAO = {
  id: "d1",
  noId: "n1",
  titulo: "Fila em vez de chamada síncrona",
  alternativas: [{ titulo: "Fila" }, { titulo: "Síncrono", consequencia: "a queda do parceiro derruba o checkout" }],
  escolhida: "Fila",
  porque: "Desacopla a disponibilidade do parceiro.",
  status: "aceita" as const,
  origem: "manual" as const,
  autor: "ana",
  em: "2026-08-15T10:00:00.000Z",
};

describe("estruturarDocumento — a fonte única das três saídas (SPEC-58)", () => {
  it("uma dimensão só entra na faixa de saúde quando é USADA", () => {
    // Documento cheio de indicador zerado ensina a ignorar todos eles — mesma
    // disciplina do placar (§230, §239).
    const vazio = estruturarDocumento([atividade], diagrama, config);
    expect(vazio.saude).toEqual([]);

    const comProposito = estruturarDocumento([atividade], diagrama, config, {
      necessidades: [{ id: "r1", texto: "não cobrar duas vezes", origem: "manual", atendidaPor: [] }],
    });
    expect(comProposito.saude.map((s) => s.icone)).toEqual(["🎯"]);
    expect(comProposito.saude[0].nivel).toBe("amarelo");
  });

  it("necessidade sem componente aparece marcada como não atendida", () => {
    const doc = estruturarDocumento([atividade], diagrama, config, {
      necessidades: [
        { id: "r1", texto: "sem dono", origem: "manual", atendidaPor: [] },
        { id: "r2", texto: "com dono", origem: "manual", atendidaPor: ["n1"] },
      ],
    });

    expect(doc.necessidades).toEqual([
      { texto: "sem dono", atendida: false },
      { texto: "com dono", atendida: true },
    ]);
  });

  it("o item cita só os TÍTULOS das decisões — o corpo mora no topo", () => {
    // SPEC-58 fatia 4: o item aponta, o topo conta. Repetir o corpo em cada
    // item é o que faz pular seção num texto que alguém lê inteiro.
    const doc = estruturarDocumento([atividade], diagrama, config, { decisoes: [DECISAO] });

    expect(doc.itens[0].decisoes).toEqual(["Fila em vez de chamada síncrona"]);
    expect(doc.decisoes).toHaveLength(1);
    expect(doc.decisoes[0].alternativas).toHaveLength(2);
  });

  it("a exceção de padrão entra nas decisões do topo, sem virar cópia", () => {
    const doc = estruturarDocumento([atividade], diagrama, config, {
      excecoes: [{ noId: "n1", campo: "timeoutMs", motivo: "o parceiro é lento", autor: "ana", em: "2026-08-15T10:00:00.000Z" }],
    });

    expect(doc.decisoes.map((d) => d.porque)).toContain("o parceiro é lento");
  });
});
