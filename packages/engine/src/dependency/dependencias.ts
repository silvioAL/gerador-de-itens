import type { Ciclo, Conflito, Dependencia } from "../model/types.js";

export interface AtividadeComDependencias {
  chave: string;
  dependencias: Dependencia[];
}

export interface ResultadoDependenciasDe<T extends AtividadeComDependencias> {
  atividades: T[];
  ciclos: Ciclo[];
  conflitos: Conflito[];
  ordemTopologica: string[];
  podeDerivar: boolean;
}

/**
 * Grafo de referência: aresta literal dono→alvo para cada `dependent` ("a depende de b" → a→b).
 * Usado para achar e relatar ciclos — o caminho relatado é a cadeia de referências tal
 * como declarada ("a precisa de b, que precisa de c, que precisa de a"), não a ordem de execução.
 * `enabler` não participa aqui: nas fixtures ele é sempre a restatement redundante do
 * `dependent` do outro lado, e incluí-lo aqui produziria ciclos espúrios de 2 nós.
 */
function construirGrafoReferencia(
  atividades: AtividadeComDependencias[],
  chavesValidas: Set<string>
): Set<string> {
  const arestas = new Set<string>();
  for (const ativ of atividades) {
    for (const dep of ativ.dependencias) {
      if (dep.type === "dependent" && dep.alvoChave && chavesValidas.has(dep.alvoChave)) {
        arestas.add(`${ativ.chave}->${dep.alvoChave}`);
      }
    }
  }
  return arestas;
}

/**
 * Grafo de precedência: aresta X→Y significa "X antes de Y" na execução.
 * `dependent` inverte o sentido da referência (o alvo precede o dono);
 * `enabler` mantém (o dono precede o alvo). Usado só para `ordemTopologica`.
 */
function construirGrafoPrecedencia(
  atividades: AtividadeComDependencias[],
  chavesValidas: Set<string>
): Set<string> {
  const arestas = new Set<string>();
  for (const ativ of atividades) {
    for (const dep of ativ.dependencias) {
      if (!dep.alvoChave || !chavesValidas.has(dep.alvoChave)) continue;
      if (dep.type === "dependent") arestas.add(`${dep.alvoChave}->${ativ.chave}`);
      else if (dep.type === "enabler") arestas.add(`${ativ.chave}->${dep.alvoChave}`);
    }
  }
  return arestas;
}

function construirAdjacencia(arestas: Set<string>): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const aresta of arestas) {
    const [de, para] = aresta.split("->");
    if (!adj.has(de)) adj.set(de, []);
    adj.get(de)!.push(para);
  }
  return adj;
}

function detectarCiclo(chaves: string[], adj: Map<string, string[]>): Ciclo | null {
  const visitado = new Set<string>();
  const naPilha = new Set<string>();
  const caminho: string[] = [];

  function dfs(chave: string): Ciclo | null {
    visitado.add(chave);
    naPilha.add(chave);
    caminho.push(chave);

    for (const vizinho of adj.get(chave) ?? []) {
      if (naPilha.has(vizinho)) {
        const inicio = caminho.indexOf(vizinho);
        return { caminho: [...caminho.slice(inicio), vizinho] };
      }
      if (!visitado.has(vizinho)) {
        const achado = dfs(vizinho);
        if (achado) return achado;
      }
    }

    naPilha.delete(chave);
    caminho.pop();
    return null;
  }

  for (const chave of chaves) {
    if (!visitado.has(chave)) {
      const achado = dfs(chave);
      if (achado) return achado;
    }
  }
  return null;
}

function ordemTopologica(chaves: string[], adj: Map<string, string[]>): string[] {
  const grauEntrada = new Map(chaves.map((c) => [c, 0]));
  for (const destinos of adj.values()) {
    for (const destino of destinos) {
      grauEntrada.set(destino, (grauEntrada.get(destino) ?? 0) + 1);
    }
  }
  const fila = chaves.filter((c) => grauEntrada.get(c) === 0);
  const ordem: string[] = [];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    ordem.push(atual);
    for (const vizinho of adj.get(atual) ?? []) {
      const grau = (grauEntrada.get(vizinho) ?? 0) - 1;
      grauEntrada.set(vizinho, grau);
      if (grau === 0) fila.push(vizinho);
    }
  }
  return ordem;
}

function detectarConflitos(
  atividades: AtividadeComDependencias[],
  chavesValidas: Set<string>
): Conflito[] {
  const conflitos: Conflito[] = [];

  for (const ativ of atividades) {
    // ALVO_INEXISTENTE
    for (const dep of ativ.dependencias) {
      if (dep.alvoChave && !chavesValidas.has(dep.alvoChave)) {
        conflitos.push({ codigo: "ALVO_INEXISTENTE", atividades: [ativ.chave], alvo: dep.alvoChave });
      }
    }

    // INDEPENDENT_COM_DEPENDENCIA
    const independente = ativ.dependencias.some((d) => d.type === "independent");
    const temDependenciaReal = ativ.dependencias.some(
      (d) => (d.type === "dependent" || d.type === "enabler") && d.alvoChave
    );
    if (independente && temDependenciaReal) {
      conflitos.push({ codigo: "INDEPENDENT_COM_DEPENDENCIA", atividades: [ativ.chave] });
    }

    // ENABLER_E_DEPENDENT — mesmo alvo declarado como enabler e dependent na mesma atividade
    const alvosEnabler = new Set(
      ativ.dependencias.filter((d) => d.type === "enabler" && d.alvoChave).map((d) => d.alvoChave)
    );
    for (const dep of ativ.dependencias) {
      if (dep.type === "dependent" && dep.alvoChave && alvosEnabler.has(dep.alvoChave)) {
        conflitos.push({
          codigo: "ENABLER_E_DEPENDENT",
          atividades: [ativ.chave, dep.alvoChave],
        });
      }
    }
  }

  return conflitos;
}

export function resolverDependencias<T extends AtividadeComDependencias>(
  atividades: T[]
): ResultadoDependenciasDe<T> {
  const chaves = atividades.map((a) => a.chave);
  const chavesValidas = new Set(chaves);

  const conflitos = detectarConflitos(atividades, chavesValidas);

  const adjReferencia = construirAdjacencia(construirGrafoReferencia(atividades, chavesValidas));
  const ciclo = detectarCiclo(chaves, adjReferencia);
  const ciclos = ciclo ? [ciclo] : [];

  const adjPrecedencia = construirAdjacencia(construirGrafoPrecedencia(atividades, chavesValidas));

  return {
    atividades,
    ciclos,
    conflitos,
    ordemTopologica: ciclos.length === 0 ? ordemTopologica(chaves, adjPrecedencia) : [],
    podeDerivar: ciclos.length === 0 && conflitos.length === 0,
  };
}
