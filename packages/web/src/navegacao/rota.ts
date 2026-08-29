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
  | "exportacao"
  /** SPEC-79 fatia A — os tokens do design system do time. */
  | "tokens";

/**
 * SPEC-58 — `documento` é tela própria da demanda: o documento deixou de ser
 * uma saída da revisão e virou o artefato de trabalho.
 *
 * SPEC-61 — e `itens` sumiu daqui. Ele mostrava a MESMA derivação que o
 * documento já mostra numa seção; as duas telas precisavam apontar uma para a
 * outra o tempo todo (§269), que é o sintoma de serem uma só. `#/itens`
 * continua sendo ENTENDIDO em `rotaDoHash` — ver lá.
 */
export type Rota =
  | { tela: "canvas" }
  | { tela: "config"; area: AreaConfig }
  | { tela: "documento" }
  /** SPEC-59 fatia A — a vista de leitura de como a ferramenta está montada. */
  | { tela: "sistema" }
  /**
   * SPEC-66/68 — a bancada de ENSAIOS: "e se…?".
   *
   * ROTA, e não aba do assistente. O assistente é onde se CONVERSA para
   * produzir desenho, e aqui não se produz nada — se ensaia. E rota é
   * linkável: *"olha o que acontece se o bureau cair"* é uma URL que se manda
   * para alguém, e isso é metade do valor.
   */
  | { tela: "ensaios" };

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
  tokens: "design-system",
};
/** SPEC-78 fatia D — as áreas de config, em runtime. O tipo `AreaConfig` não
 * existe depois da compilação, e o teste que impede o tour de apontar para uma
 * área morta precisa da lista de verdade. */
export const AREAS_CONFIG_CONHECIDAS = Object.keys(SEGMENTO_DA_AREA) as AreaConfig[];

const AREA_DO_SEGMENTO = Object.fromEntries(
  Object.entries(SEGMENTO_DA_AREA).map(([area, seg]) => [seg, area as AreaConfig])
);

export function hashDaRota(rota: Rota): string {
  if (rota.tela === "canvas") return "#/";
  if (rota.tela === "documento") return "#/documento";
  if (rota.tela === "sistema") return "#/sistema";
  if (rota.tela === "ensaios") return "#/ensaios";
  return `#/config/${SEGMENTO_DA_AREA[rota.area]}`;
}

/** Hash desconhecido cai no canvas — link velho nunca vira tela em branco. */
export function rotaDoHash(hash: string): Rota {
  const partes = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  // SPEC-61 §6.7 — a rota que morreu REDIRECIONA. Rota que some sem
  // redirecionar dá tela branca para quem tinha o link salvo, e link salvo é
  // justamente o de quem mais usa. O destino é o documento porque é lá que os
  // itens passaram a morar, numa seção.
  if (partes[0] === "itens") return { tela: "documento" };
  if (partes[0] === "documento") return { tela: "documento" };
  if (partes[0] === "sistema") return { tela: "sistema" };
  if (partes[0] === "ensaios") return { tela: "ensaios" };
  // SPEC-68 §4.2 — `#/simulacao` era "e se ficar lento?", e o nome estreito
  // fechava a porta para retry, pico e disjuntor. Rota que some sem
  // redirecionar dá tela branca para quem tinha o link salvo — e a SPEC-66 §5
  // apostou justamente em o endereço ser mandável para alguém.
  if (partes[0] === "simulacao") return { tela: "ensaios" };
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
