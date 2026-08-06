import { useCallback, useState } from "react";
import type { Aresta, DiagramaConfig, No, Quebra } from "@gerador/engine";
import { criarAresta, criarNo } from "./factory";

export interface EdgeRejeitada {
  motivo: string;
}

export function useQuebra(inicial: Quebra, config: DiagramaConfig) {
  const [quebra, setQuebra] = useState<Quebra>(inicial);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [arestaSelecionadaId, setArestaSelecionadaId] = useState<string | null>(null);
  const [edgeRejeitada, setEdgeRejeitada] = useState<EdgeRejeitada | null>(null);

  const atualizarNo = useCallback((id: string, updater: (no: No) => No) => {
    setQuebra((q) => ({
      ...q,
      diagrama: {
        ...q.diagrama,
        nodes: q.diagrama.nodes.map((n) => (n.id === id ? updater(n) : n)),
      },
    }));
  }, []);

  const moverNo = useCallback(
    (id: string, x: number, y: number) => atualizarNo(id, (n) => ({ ...n, x, y })),
    [atualizarNo]
  );

  const definirValorSpec = useCallback(
    (noId: string, campoKey: string, valor: unknown) =>
      atualizarNo(noId, (n) => ({
        ...n,
        spec: { ...n.spec, [campoKey]: { valor, origem: "manual" } },
      })),
    [atualizarNo]
  );

  const definirNA = useCallback(
    (noId: string, campoKey: string, motivo: string) =>
      atualizarNo(noId, (n) => ({
        ...n,
        specNA: { ...n.specNA, [campoKey]: { motivo } },
      })),
    [atualizarNo]
  );

  const removerNA = useCallback(
    (noId: string, campoKey: string) =>
      atualizarNo(noId, (n) => {
        const specNA = { ...n.specNA };
        delete specNA[campoKey];
        return { ...n, specNA };
      }),
    [atualizarNo]
  );

  const confirmarValor = useCallback(
    (noId: string, campoKey: string) =>
      atualizarNo(noId, (n) => {
        const atual = n.spec[campoKey];
        if (!atual) return n;
        return { ...n, spec: { ...n.spec, [campoKey]: { ...atual, confirmado: true } } };
      }),
    [atualizarNo]
  );

  const descartarValor = useCallback(
    (noId: string, campoKey: string) =>
      atualizarNo(noId, (n) => {
        const spec = { ...n.spec };
        delete spec[campoKey];
        return { ...n, spec };
      }),
    [atualizarNo]
  );

  const renomearNo = useCallback(
    (noId: string, label: string) => atualizarNo(noId, (n) => ({ ...n, label })),
    [atualizarNo]
  );

  const alternarStatus = useCallback(
    (noId: string) =>
      atualizarNo(noId, (n) => ({ ...n, status: n.status === "novo" ? "existente" : "novo" })),
    [atualizarNo]
  );

  const definirTime = useCallback(
    (noId: string, time: string) => atualizarNo(noId, (n) => ({ ...n, time })),
    [atualizarNo]
  );

  const adicionarNo = useCallback(
    (tipo: string, x: number, y: number) => {
      setQuebra((q) => {
        const no = criarNo(tipo, config, q.diagrama.nodes, x, y);
        return { ...q, diagrama: { ...q.diagrama, nodes: [...q.diagrama.nodes, no] } };
      });
    },
    [config]
  );

  const removerNo = useCallback((id: string) => {
    setQuebra((q) => ({
      ...q,
      diagrama: {
        nodes: q.diagrama.nodes.filter((n) => n.id !== id),
        edges: q.diagrama.edges.filter((e) => e.source !== id && e.target !== id),
      },
    }));
    setSelecionadoId((sel) => (sel === id ? null : sel));
  }, []);

  const tentarConectar = useCallback(
    (source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null) => {
      const alvo = quebra.diagrama.nodes.find((n) => n.id === target);
      if (!alvo) return;
      const regra = config.edgeRules[alvo.type] ?? config.edgeRules._fallback;
      if (!regra) {
        setEdgeRejeitada({
          motivo: `Tipo de nó "${alvo.type}" não tem regras de conexão definidas.`,
        });
        return;
      }
      const tipoAresta = regra.default ?? regra.valid[0];
      if (!tipoAresta) {
        setEdgeRejeitada({ motivo: `Nenhum tipo de aresta válido para "${alvo.type}".` });
        return;
      }
      setQuebra((q) => ({
        ...q,
        diagrama: {
          ...q.diagrama,
          edges: [
            ...q.diagrama.edges,
            criarAresta(source, target, tipoAresta, q.diagrama.edges, sourceHandle ?? undefined, targetHandle ?? undefined),
          ],
        },
      }));
    },
    [config, quebra.diagrama.nodes]
  );

  const definirTipoAresta = useCallback((edgeId: string, tipo: string) => {
    setQuebra((q) => ({
      ...q,
      diagrama: {
        ...q.diagrama,
        edges: q.diagrama.edges.map((e) => (e.id === edgeId ? { ...e, type: tipo } : e)),
      },
    }));
  }, []);

  const removerAresta = useCallback((edgeId: string) => {
    setQuebra((q) => ({
      ...q,
      diagrama: { ...q.diagrama, edges: q.diagrama.edges.filter((e) => e.id !== edgeId) },
    }));
    setArestaSelecionadaId((sel) => (sel === edgeId ? null : sel));
  }, []);

  return {
    quebra,
    setQuebra,
    selecionadoId,
    setSelecionadoId,
    arestaSelecionadaId,
    setArestaSelecionadaId,
    edgeRejeitada,
    limparEdgeRejeitada: () => setEdgeRejeitada(null),
    moverNo,
    definirValorSpec,
    definirNA,
    removerNA,
    confirmarValor,
    descartarValor,
    renomearNo,
    alternarStatus,
    definirTime,
    adicionarNo,
    removerNo,
    tentarConectar,
    definirTipoAresta,
    removerAresta,
  };
}

export type UseQuebra = ReturnType<typeof useQuebra>;
export type { Aresta, No };
