import { useCallback, useEffect, useState } from "react";

/**
 * SPEC-40 Fase 1 — a rota do app, em hash (`#/config/membros`). Hash e não
 * history API de propósito: o deploy é estático (nginx `try_files`), e hash
 * preserva F5/deep-link sem tocar no servidor. Sem lib de router — duas
 * funções puras e um hook fino.
 */
export type AreaConfig =
  // SPEC-53 — o contexto do PRODUTO: de que negócio a demanda fala.
  | "produtos"
  | "perfis"
  | "campos"
  | "camposAresta"
  | "membros"
  | "acessos"
  | "regras"
  | "especificacao"
  | "pipeline"
  | "modeloIa"
  | "pdca"
  | "exportacao";

/** SPEC-58 — `documento` é tela própria da demanda, ao lado de `itens`: o
 * documento deixou de ser uma saída da revisão e virou o artefato de trabalho. */
export type Rota =
  | { tela: "canvas" }
  | { tela: "config"; area: AreaConfig }
  | { tela: "itens" }
  | { tela: "documento" }
  /** SPEC-59 fatia A — a vista de leitura de como a ferramenta está montada. */
  | { tela: "sistema" };

/** id interno ↔ segmento legível da URL (o hash é interface, fala produto). */
const SEGMENTO_DA_AREA: Record<AreaConfig, string> = {
  produtos: "produtos",
  perfis: "perfis-stack",
  campos: "componentes",
  camposAresta: "conexoes",
  membros: "membros",
  acessos: "acessos",
  regras: "regras",
  especificacao: "especificacao",
  pipeline: "pipeline",
  modeloIa: "modelo-ia",
  pdca: "pdca",
  exportacao: "exportacao",
};
const AREA_DO_SEGMENTO = Object.fromEntries(
  Object.entries(SEGMENTO_DA_AREA).map(([area, seg]) => [seg, area as AreaConfig])
);

export function hashDaRota(rota: Rota): string {
  if (rota.tela === "canvas") return "#/";
  if (rota.tela === "itens") return "#/itens";
  if (rota.tela === "documento") return "#/documento";
  if (rota.tela === "sistema") return "#/sistema";
  return `#/config/${SEGMENTO_DA_AREA[rota.area]}`;
}

/** Hash desconhecido cai no canvas — link velho nunca vira tela em branco. */
export function rotaDoHash(hash: string): Rota {
  const partes = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (partes[0] === "itens") return { tela: "itens" };
  if (partes[0] === "documento") return { tela: "documento" };
  if (partes[0] === "sistema") return { tela: "sistema" };
  if (partes[0] === "config") {
    const area = AREA_DO_SEGMENTO[partes[1] ?? ""];
    if (area) return { tela: "config", area };
  }
  return { tela: "canvas" };
}

export function useRotaHash(): { rota: Rota; navegar: (rota: Rota) => void } {
  const [rota, setRota] = useState<Rota>(() => rotaDoHash(window.location.hash));

  useEffect(() => {
    const aoMudar = () => setRota(rotaDoHash(window.location.hash));
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  const navegar = useCallback((nova: Rota) => {
    const hash = hashDaRota(nova);
    if (window.location.hash === hash) return;
    // O `hashchange` do browser atualiza o estado — uma fonte de verdade só.
    window.location.hash = hash;
  }, []);

  return { rota, navegar };
}
