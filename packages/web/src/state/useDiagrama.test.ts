import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagrama, DiagramaConfig } from "@gerador/engine";
import { useDiagrama } from "./useDiagrama";

/**
 * SPEC-59 fatia C — o estado do diagrama, sem quebra nenhuma.
 *
 * A separação só vale se ela for VERIFICÁVEL. Um hook que continuasse
 * importando `Quebra` e "por acaso" não a usasse seria a mesma parede de
 * antes, esperando a próxima adição para reaparecer — por isso o primeiro
 * teste olha o arquivo, não o comportamento.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

const config = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: [], contextos: [], spec: [] },
    mongo: { label: "Mongo", derives: "db", techs: [], contextos: [], spec: [] },
  },
  edgeTypes: { writes: { label: "escreve" } },
  edgeRules: { mongo: { valid: ["writes"], default: "writes" } },
} as unknown as DiagramaConfig;

/** Um estado de verdade: o hook recebe o diagrama e como substituí-lo, então
 * o teste guarda o diagrama e devolve o resultado da mudança. */
function comEstado(inicial: Diagrama) {
  const caixa = { atual: inicial };
  const { result, rerender } = renderHook(() =>
    useDiagrama(
      caixa.atual,
      (mudar) => {
        caixa.atual = mudar(caixa.atual);
      },
      config
    )
  );
  return { result, caixa, aplicar: () => rerender() };
}

const VAZIO: Diagrama = { nodes: [], edges: [] };

describe("useDiagrama — a fronteira (SPEC-59 fatia C)", () => {
  it("o arquivo NÃO menciona Quebra — é a separação, verificada", () => {
    // Se algum dia alguém importar `Quebra` aqui "só para um caso", a parede
    // volta, e o segundo diagrama volta a ser impossível. Este teste é o que
    // torna a regressão barulhenta.
    //
    // Olha o CÓDIGO, não o texto: os comentários do arquivo citam `Quebra` de
    // propósito, porque é neles que a fronteira é explicada. Proibir a palavra
    // proibiria justamente a documentação dela.
    const fonte = readFileSync(resolve(__dirname, "useDiagrama.ts"), "utf-8");
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(codigo).not.toMatch(/\bQuebra\b/);
    expect(codigo).not.toMatch(/respostasItens|necessidades|decisoes|percursos/);
  });

  it("adicionar nó escreve pelo callback, não num estado próprio", () => {
    // O hook não guarda o diagrama: ele o recebe. É o que permite o mesmo
    // estado servir a uma quebra e a qualquer outro dono.
    const { result, caixa } = comEstado(VAZIO);

    act(() => result.current.adicionarNo("service", 10, 20));

    expect(caixa.atual.nodes).toHaveLength(1);
    expect(caixa.atual.nodes[0].type).toBe("service");
  });

  it("remover nó leva as conexões dele junto, e limpa a seleção", () => {
    const inicial: Diagrama = {
      nodes: [
        { id: "n1", type: "service", x: 0, y: 0, label: "a", status: "novo", spec: {}, specNA: {} },
        { id: "n2", type: "mongo", x: 0, y: 0, label: "b", status: "novo", spec: {}, specNA: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", type: "writes" }],
    };
    const { result, caixa } = comEstado(inicial);

    act(() => result.current.setSelecionadoId("n1"));
    act(() => result.current.removerNo("n1"));

    expect(caixa.atual.nodes.map((n) => n.id)).toEqual(["n2"]);
    expect(caixa.atual.edges).toEqual([]);
    expect(result.current.selecionadoId).toBeNull();
  });

  it("conectar respeita a regra do tipo de destino", () => {
    const inicial: Diagrama = {
      nodes: [
        { id: "n1", type: "service", x: 0, y: 0, label: "a", status: "novo", spec: {}, specNA: {} },
        { id: "n2", type: "mongo", x: 0, y: 0, label: "b", status: "novo", spec: {}, specNA: {} },
      ],
      edges: [],
    };
    const { result, caixa } = comEstado(inicial);

    act(() => result.current.tentarConectar("n1", "n2"));

    expect(caixa.atual.edges[0].type).toBe("writes");
  });

  it("destino sem regra de conexão é RECUSA explicada, não conexão silenciosa", () => {
    const inicial: Diagrama = {
      nodes: [
        { id: "n1", type: "service", x: 0, y: 0, label: "a", status: "novo", spec: {}, specNA: {} },
        { id: "n2", type: "service", x: 0, y: 0, label: "b", status: "novo", spec: {}, specNA: {} },
      ],
      edges: [],
    };
    const { result, caixa } = comEstado(inicial);

    act(() => result.current.tentarConectar("n1", "n2"));

    expect(caixa.atual.edges).toEqual([]);
    expect(result.current.edgeRejeitada?.motivo).toContain("regras de conexão");
  });

  it("a exclusão pede confirmação — as três portas passam pelo mesmo lugar", () => {
    const inicial: Diagrama = {
      nodes: [{ id: "n1", type: "service", x: 0, y: 0, label: "a", status: "novo", spec: {}, specNA: {} }],
      edges: [],
    };
    const { result, caixa } = comEstado(inicial);

    act(() => result.current.pedirExclusao("no", "n1"));
    expect(result.current.exclusaoPendente).toEqual({ tipo: "no", id: "n1" });
    expect(caixa.atual.nodes).toHaveLength(1);

    act(() => result.current.confirmarExclusao());
    expect(caixa.atual.nodes).toEqual([]);
  });
});
