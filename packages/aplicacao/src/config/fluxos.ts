import { resolverDependencias, type Dependencia } from "@gerador/engine";
import { ConfigInvalida } from "./normalizacao.js";

/**
 * SPEC-105 fatia C — **o FLUXO como grafo, sem execução.**
 *
 * O fluxo é a fiação: em que ordem, e o que alimenta o quê. Nó referencia um
 * `Conector` (catálogo, fatia A) ou um `PapelConfigurado` (esteira); a aresta
 * carrega o `mapeamento` — DE qual campo de saída PARA qual campo de entrada.
 * **Uma aresta sem mapeamento é decoração**; com ele, a resposta de um
 * conector vira a entrada de um agente (§4.1).
 *
 * É DO TIME (§9.2): dois times podem enriquecer de formas diferentes sem
 * ambiguidade, porque fluxo não deriva — a derivação continua determinística e
 * fora do fluxo (§6).
 *
 * ## Por que só `conector` e `agente`
 *
 * A §4.1 desenhou quatro tipos; os outros dois (`transformacao`, `saida`) não
 * têm executor nesta leva — e um tipo que a tela oferece e o executor ignora é
 * a meia-integração que o §346 já pagou para aprender. Entram quando houver
 * quem os honre.
 */
export const TIPOS_DE_NO_DO_FLUXO = ["conector", "agente"] as const;
export type TipoDeNoDoFluxo = (typeof TIPOS_DE_NO_DO_FLUXO)[number];

export interface NoDoFluxo {
  id: string;
  tipo: TipoDeNoDoFluxo;
  /** id do `Conector` (tipo "conector") ou do `PapelConfigurado` (tipo "agente"). */
  refId: string;
  posicao: { x: number; y: number };
  /** Valores fixos dos campos de entrada que não vêm de aresta. */
  parametros: Record<string, unknown>;
}

export interface ArestaDoFluxo {
  de: string;
  para: string;
  /** DE qual campo de saída PARA qual campo de entrada. */
  mapeamento: { saida: string; entrada: string }[];
}

export interface Fluxo {
  id: string;
  nome: string;
  nos: NoDoFluxo[];
  arestas: ArestaDoFluxo[];
}

export interface ConfigFluxos {
  fluxos: Fluxo[];
}

function sanearMapeamento(bruto: unknown): { saida: string; entrada: string }[] {
  if (!Array.isArray(bruto)) return [];
  return (bruto as { saida?: unknown; entrada?: unknown }[])
    .map((par) => ({
      saida: typeof par?.saida === "string" ? par.saida.trim() : "",
      entrada: typeof par?.entrada === "string" ? par.entrada.trim() : "",
    }))
    .filter((par) => par.saida && par.entrada);
}

export function normalizarFluxos(documento: unknown): ConfigFluxos {
  const bruto = (documento ?? {}) as Partial<ConfigFluxos>;
  const fluxos: Fluxo[] = [];
  const idsVistos = new Set<string>();

  for (const cru of Array.isArray(bruto.fluxos) ? bruto.fluxos : []) {
    if (!cru || typeof cru !== "object") continue;
    const id = typeof cru.id === "string" ? cru.id.trim() : "";
    if (!id || idsVistos.has(id)) continue;
    idsVistos.add(id);

    const nos: NoDoFluxo[] = [];
    const nosVistos = new Set<string>();
    for (const noCru of Array.isArray(cru.nos) ? (cru.nos as Partial<NoDoFluxo>[]) : []) {
      const noId = typeof noCru?.id === "string" ? noCru.id.trim() : "";
      const refId = typeof noCru?.refId === "string" ? noCru.refId.trim() : "";
      // Nó sem id não é ligável; sem refId não aponta para nada executável;
      // tipo desconhecido não tem executor — os três descartes são o mesmo:
      // o que sobra não roda.
      if (!noId || !refId || nosVistos.has(noId)) continue;
      if (!(TIPOS_DE_NO_DO_FLUXO as readonly string[]).includes(noCru.tipo as string)) continue;
      nosVistos.add(noId);
      nos.push({
        id: noId,
        tipo: noCru.tipo as TipoDeNoDoFluxo,
        refId,
        posicao: {
          x: typeof noCru.posicao?.x === "number" ? noCru.posicao.x : 0,
          y: typeof noCru.posicao?.y === "number" ? noCru.posicao.y : 0,
        },
        parametros:
          noCru.parametros && typeof noCru.parametros === "object" && !Array.isArray(noCru.parametros)
            ? (noCru.parametros as Record<string, unknown>)
            : {},
      });
    }

    const arestas: ArestaDoFluxo[] = [];
    for (const arestaCru of Array.isArray(cru.arestas) ? (cru.arestas as Partial<ArestaDoFluxo>[]) : []) {
      const de = typeof arestaCru?.de === "string" ? arestaCru.de.trim() : "";
      const para = typeof arestaCru?.para === "string" ? arestaCru.para.trim() : "";
      // Aresta para nó que não existe apontaria o dado para o vazio.
      if (!de || !para || !nosVistos.has(de) || !nosVistos.has(para)) continue;
      arestas.push({ de, para, mapeamento: sanearMapeamento(arestaCru.mapeamento) });
    }

    fluxos.push({
      id,
      nome: typeof cru.nome === "string" && cru.nome.trim() ? cru.nome.trim() : id,
      nos,
      arestas,
    });
  }

  return { fluxos };
}

/**
 * O plano de execução: a mesma ordenação topológica do desenho
 * (`resolverDependencias`, engine) — um ciclo no fluxo é o MESMO erro que um
 * ciclo no desenho, e dá a mesma mensagem (§4.4).
 */
export function planoDoFluxo(fluxo: Fluxo): { ordem: string[]; ciclo?: string[] } {
  const atividades = fluxo.nos.map((no) => ({
    chave: no.id,
    dependencias: fluxo.arestas
      .filter((a) => a.para === no.id)
      .map((a) => ({ type: "dependent", alvoChave: a.de }) as Dependencia),
  }));
  const { ciclos, ordemTopologica } = resolverDependencias(atividades);
  if (ciclos.length > 0) return { ordem: [], ciclo: ciclos[0].caminho };
  return { ordem: ordemTopologica };
}

/** A mensagem do desenho, à letra — é a prova da fatia C. */
export function mensagemDeCiclo(caminho: string[]): string {
  return `Ciclo: ${caminho.join(" → ")}`;
}

/** SPEC-35 — a escrita recusa o que a leitura tolera, ciclo incluído. */
export function validarEscritaFluxos(documento: unknown): void {
  const bruto = (documento ?? {}) as Partial<ConfigFluxos>;
  if (bruto.fluxos === undefined) return;
  if (!Array.isArray(bruto.fluxos)) throw new ConfigInvalida("`fluxos` precisa ser uma lista de fluxos");

  const vistos = new Set<string>();
  for (const [i, f] of (bruto.fluxos as Partial<Fluxo>[]).entries()) {
    const posicao = i + 1;
    const id = typeof f?.id === "string" ? f.id.trim() : "";
    if (!id) throw new ConfigInvalida(`o fluxo na posição ${posicao} está sem "id" — seria descartado em silêncio ao salvar`);
    if (vistos.has(id)) throw new ConfigInvalida(`há dois fluxos com o id "${id}" — o segundo seria descartado em silêncio ao salvar`);
    vistos.add(id);

    const nosVistos = new Set<string>();
    for (const [j, no] of (Array.isArray(f.nos) ? (f.nos as Partial<NoDoFluxo>[]) : []).entries()) {
      const noId = typeof no?.id === "string" ? no.id.trim() : "";
      if (!noId) throw new ConfigInvalida(`no fluxo "${id}", o nó na posição ${j + 1} está sem "id"`);
      if (nosVistos.has(noId)) throw new ConfigInvalida(`no fluxo "${id}", há dois nós com o id "${noId}"`);
      nosVistos.add(noId);
      if (!(TIPOS_DE_NO_DO_FLUXO as readonly string[]).includes(no.tipo as string)) {
        throw new ConfigInvalida(
          `no fluxo "${id}", o nó "${noId}" tem tipo desconhecido "${String(no.tipo)}" (aceitos: ${TIPOS_DE_NO_DO_FLUXO.join(", ")})`
        );
      }
      if (!(typeof no.refId === "string" && no.refId.trim())) {
        throw new ConfigInvalida(`no fluxo "${id}", o nó "${noId}" está sem "refId" — não aponta para conector ou agente nenhum`);
      }
    }
    for (const aresta of Array.isArray(f.arestas) ? (f.arestas as Partial<ArestaDoFluxo>[]) : []) {
      for (const ponta of [aresta?.de, aresta?.para]) {
        if (typeof ponta !== "string" || !nosVistos.has(ponta.trim())) {
          throw new ConfigInvalida(
            `no fluxo "${id}", há uma aresta apontando para o nó "${String(ponta)}", que não existe`
          );
        }
      }
    }

    // O ciclo é conferido sobre a forma NORMALIZADA — a mesma que será lida.
    const { fluxos } = normalizarFluxos({ fluxos: [f] });
    if (fluxos[0]) {
      const plano = planoDoFluxo(fluxos[0]);
      if (plano.ciclo) throw new ConfigInvalida(mensagemDeCiclo(plano.ciclo));
    }
  }
}
