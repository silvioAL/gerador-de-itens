import type { Aresta, Diagrama, DiagramaConfig, No, Quebra } from "@gerador/engine";

/** `time` nasce como o time ativo da sessão (App.tsx) — não é mais texto livre. */
export function quebraVazia(time?: string): Quebra {
  return { demandInfo: "", time, diagrama: { nodes: [], edges: [] } };
}

function proximoId(prefixo: string, existentes: { id: string }[]): string {
  const numeros = existentes
    .map((e) => e.id.match(new RegExp(`^${prefixo}(\\d+)$`)))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => Number(m[1]));
  const proximo = numeros.length > 0 ? Math.max(...numeros) + 1 : 1;
  return `${prefixo}${proximo}`;
}

export function criarNo(tipo: string, config: DiagramaConfig, existentes: No[], x: number, y: number): No {
  const cfg = config.nodeTypes[tipo];
  return {
    id: proximoId("n", existentes),
    type: tipo,
    x,
    y,
    label: cfg?.label ?? tipo,
    status: "novo",
    spec: {},
    specNA: {},
    endpoints: cfg?.derives === "service" ? [] : undefined,
  };
}

export function criarAresta(
  source: string,
  target: string,
  type: string,
  existentes: Aresta[],
  sourceHandle?: string,
  targetHandle?: string
): Aresta {
  return { id: proximoId("e", existentes), source, target, type, sourceHandle, targetHandle };
}

/**
 * Injeta o diagrama de um cenário pronto no diagrama atual, sem substituir —
 * IDs de nó/aresta são renumerados pra nunca colidir com o que já existe
 * (dois cenários carregados em sequência podem ambos ter "n1", "n2"...), e o
 * bloco novo entra deslocado abaixo do que já está no canvas, não empilhado
 * em cima.
 */
export function mesclarDiagrama(atual: Diagrama, adicional: Diagrama): Diagrama {
  const nodesVistos = [...atual.nodes];
  const mapaIds = new Map<string, string>();

  const novosNos = adicional.nodes.map((no) => {
    const novoId = proximoId("n", nodesVistos);
    mapaIds.set(no.id, novoId);
    const renumerado: No = { ...no, id: novoId };
    nodesVistos.push(renumerado);
    return renumerado;
  });

  const offsetY = atual.nodes.length > 0 ? Math.max(...atual.nodes.map((n) => n.y)) + 220 : 0;
  const nosPosicionados = novosNos.map((no) => ({ ...no, y: no.y + offsetY }));

  const arestasVistas = [...atual.edges];
  const novasArestas = adicional.edges.map((e) => {
    const novoId = proximoId("e", arestasVistas);
    const renumerada: Aresta = {
      ...e,
      id: novoId,
      source: mapaIds.get(e.source) ?? e.source,
      target: mapaIds.get(e.target) ?? e.target,
    };
    arestasVistas.push(renumerada);
    return renumerada;
  });

  return {
    nodes: [...atual.nodes, ...nosPosicionados],
    edges: [...atual.edges, ...novasArestas],
  };
}
