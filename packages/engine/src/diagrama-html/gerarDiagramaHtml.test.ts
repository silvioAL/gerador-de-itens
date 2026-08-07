import { describe, expect, it } from "vitest";
import type { Diagrama } from "../model/types.js";
import type { DiagramaConfig } from "../config/types.js";
import { derivar } from "../derive/derivar.js";
import { gerarDiagramaHtml } from "./gerarDiagramaHtml.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], color: "#2563eb", spec: [
      { key: "nome", label: "Nome do serviço", type: "text", required: true },
    ] },
    fila: { label: "Fila", derives: "queue", techs: ["Backend"], contextos: [], color: "#f97316", spec: [] },
    banco: { label: "Banco", derives: "datastore", techs: ["Backend"], contextos: [], color: "#10b981", spec: [] },
  },
  edgeTypes: {
    publishes: { label: "publica", color: "#f97316", verbo: "publica em", fluxo: "forward" },
    consumes: { label: "consome", color: "#0891b2", verbo: "consome de", fluxo: "reverse" },
    readwrite: { label: "lê e escreve", color: "#0d9488", verbo: "lê e escreve em", fluxo: "bidirectional" },
    binding: { label: "binding", color: "#f43f5e", gerarAtividade: false },
  },
  edgeRules: {
    fila: { valid: ["publishes", "consumes", "binding"], default: "publishes" },
    banco: { valid: ["readwrite"], default: "readwrite" },
  },
};

function diagramaBase(): Diagrama {
  return {
    nodes: [
      { id: "svc", type: "service", status: "novo", label: "srv-pedidos", x: 40, y: 250, spec: { nome: { valor: "srv-pedidos", origem: "manual" } }, specNA: {} },
      { id: "fila", type: "fila", status: "novo", label: "fila-pedidos", x: 300, y: 250, spec: {}, specNA: {} },
      { id: "banco", type: "banco", status: "existente", label: "db-pedidos", x: 560, y: 250, spec: {}, specNA: {} },
    ],
    edges: [
      { id: "e1", source: "svc", target: "fila", type: "publishes" },
      { id: "e2", source: "svc", target: "banco", type: "readwrite" },
    ],
  };
}

function extrairDados(html: string): {
  nos: { id: string; x: number; y: number; cor: string; label: string }[];
  arestas: { id: string; fluxo: string; cor: string; verbo: string }[];
  itens: { indice: number; nivel?: string; rotulo: string }[];
  nodeIdParaItens: Record<string, number[]>;
  legenda: { cor: string; rotulo: string }[];
} {
  // JSON.stringify nunca produz ";" no corpo — "linha inteira até o primeiro ;"
  // é seguro e evita o regex ganancioso capturar além do objeto DADOS (o script
  // depois dele tem várias outras ocorrências de "};").
  const m = html.match(/const DADOS = (.+);\n/);
  if (!m) throw new Error("DADOS não encontrado no HTML gerado");
  return JSON.parse(m[1]);
}

describe("gerarDiagramaHtml (SPEC-21)", () => {
  it("gera um HTML autocontido (DOCTYPE, título, sem link/script externo)", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const html = gerarDiagramaHtml(atividades, diagrama, config, { titulo: "Crédito — fluxo" });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Crédito — fluxo");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href="https?:/);
  });

  it("posição e cor dos nós vêm de No.x/y e NodeTypeConfig.color", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const dados = extrairDados(gerarDiagramaHtml(atividades, diagrama, config));

    const svc = dados.nos.find((n) => n.id === "svc")!;
    expect(svc.x).toBe(40);
    expect(svc.y).toBe(250);
    expect(svc.cor).toBe("#2563eb");
    expect(svc.label).toBe("srv-pedidos");
  });

  it("direção do fluxo animado vem de EdgeTypeConfig.fluxo — forward/reverse/bidirectional/estático", () => {
    const diagrama = diagramaBase();
    diagrama.edges.push({ id: "e3", source: "svc", target: "fila", type: "consumes" });
    diagrama.edges.push({ id: "e4", source: "svc", target: "fila", type: "binding" });
    const atividades = derivar(diagrama, config, {});
    const dados = extrairDados(gerarDiagramaHtml(atividades, diagrama, config));

    expect(dados.arestas.find((a) => a.id === "e1")!.fluxo).toBe("forward");
    expect(dados.arestas.find((a) => a.id === "e2")!.fluxo).toBe("bidirectional");
    expect(dados.arestas.find((a) => a.id === "e3")!.fluxo).toBe("reverse");
    // binding tem gerarAtividade: false — vira "estatico" independente do que fluxo diria
    expect(dados.arestas.find((a) => a.id === "e4")!.fluxo).toBe("estatico");
  });

  it("nodeIdParaItens liga cada nó de origem (source+target de aresta) aos índices das atividades derivadas dali", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const dados = extrairDados(gerarDiagramaHtml(atividades, diagrama, config));

    // a atividade da aresta e1 (svc -> fila, publishes) deve aparecer nos dois nós
    const indicesSvc = dados.nodeIdParaItens.svc ?? [];
    const indicesFila = dados.nodeIdParaItens.fila ?? [];
    expect(indicesSvc.length).toBeGreaterThan(0);
    expect(indicesFila.length).toBeGreaterThan(0);
    expect(indicesSvc.some((i) => indicesFila.includes(i))).toBe(true);
  });

  it("nível de prontidão do item é o pior entre os nós de origem (campo obrigatório sem valor = vermelho)", () => {
    const diagrama = diagramaBase();
    // svc tem 'nome' preenchido (spec obrigatório do tipo service) — mas o segundo svc (via clone) não teria.
    const diagramaSemNome: Diagrama = {
      ...diagrama,
      nodes: diagrama.nodes.map((n) => (n.id === "svc" ? { ...n, spec: {} } : n)),
    };
    const atividades = derivar(diagramaSemNome, config, {});
    const dados = extrairDados(gerarDiagramaHtml(atividades, diagramaSemNome, config));

    const itemDeSvc = dados.itens.find((it) => (dados.nodeIdParaItens.svc ?? []).includes(it.indice));
    expect(itemDeSvc?.nivel).toBe("vermelho"); // 'nome' é required e ficou vazio
  });

  it("legenda lista as cores dos tipos de aresta realmente usados no diagrama", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const dados = extrairDados(gerarDiagramaHtml(atividades, diagrama, config));

    const cores = dados.legenda.map((l) => l.cor);
    expect(cores).toContain("#f97316"); // publishes
    expect(cores).toContain("#0d9488"); // readwrite
    expect(cores).not.toContain("#0891b2"); // consumes não usado neste diagrama
  });

  it("diagrama sem nenhuma atividade não quebra — HTML gerado normalmente, painéis vazios", () => {
    const diagrama: Diagrama = { nodes: [], edges: [] };
    const html = gerarDiagramaHtml([], diagrama, config);
    expect(html).toContain("<!DOCTYPE html>");
    const dados = extrairDados(html);
    expect(dados.nos).toEqual([]);
    expect(dados.arestas).toEqual([]);
  });
});
