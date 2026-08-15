import type { Checagem, DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Diagrama, No } from "../model/types.js";
import { condicaoBate, requisitosRelevantes } from "../refinamento/gerarRefinamento.js";

/**
 * SPEC-57 fatia B (§239) — o padrão virando régua.
 *
 * Função pura, como o resto do engine. Percorre os nós, junta os requisitos
 * CONFERÍVEIS que valem para eles (mesma régua tech×contexto×`when` do
 * checklist — os helpers são importados, não reescritos) e devolve o que o
 * desenho viola.
 *
 * O que ela deliberadamente NÃO faz:
 *
 * - **não bloqueia nada.** Violação é sinal, e a decisão de bloquear é do
 *   portão de derivação, não daqui;
 * - **não avalia campo ausente.** Um nó sem o campo da checagem não viola: a
 *   regra é por tech, e uma tech vale para tipos de nó com specs diferentes.
 *   Acusar ali seria acusar o desenho por um descasamento de config;
 * - **não converte unidade.** `unidade` é texto de mensagem. Somar ms com s
 *   caladamente seria pior que não somar.
 */
export interface Violacao {
  noId: string;
  /** O rótulo do nó, para a mensagem não obrigar quem lê a procurar o id. */
  noLabel: string;
  tech: string;
  campo: string;
  /** O texto do requisito — o que a pessoa já lia no checklist. */
  texto: string;
  esperado: string;
  atual: string;
}

function descreverEsperado(c: Checagem): string {
  const unidade = c.unidade ? c.unidade : "";
  switch (c.operador) {
    case "lte":
      return `≤ ${c.valor}${unidade}`;
    case "lt":
      return `< ${c.valor}${unidade}`;
    case "gte":
      return `≥ ${c.valor}${unidade}`;
    case "gt":
      return `> ${c.valor}${unidade}`;
    case "eq":
      return `= ${c.valor}${unidade}`;
    case "ne":
      return `≠ ${c.valor}${unidade}`;
    case "preenchido":
      return "preenchido";
  }
}

/** `undefined` = não dá para afirmar nada (campo ausente ou valor de outro tipo). */
function satisfaz(c: Checagem, valor: unknown): boolean | undefined {
  if (c.operador === "preenchido") {
    return valor !== undefined && valor !== null && valor !== "";
  }
  if (valor === undefined || valor === null || valor === "") return undefined;

  if (c.operador === "eq") return valor === c.valor;
  if (c.operador === "ne") return valor !== c.valor;

  // Comparação de ordem só faz sentido em número. Um campo de texto com
  // operador numérico é config incorreta, e o silêncio aqui é deliberado: o
  // lugar de reclamar disso é a validação de config, não o desenho de quem usa.
  const n = typeof valor === "number" ? valor : Number(valor);
  const alvo = typeof c.valor === "number" ? c.valor : Number(c.valor);
  if (!Number.isFinite(n) || !Number.isFinite(alvo)) return undefined;

  switch (c.operador) {
    case "lte":
      return n <= alvo;
    case "lt":
      return n < alvo;
    case "gte":
      return n >= alvo;
    case "gt":
      return n > alvo;
  }
}

export function avaliarConformidade(
  diagrama: Diagrama,
  config: DiagramaConfig,
  regras?: RegrasConfig
): Violacao[] {
  if (!regras) return [];
  const violacoes: Violacao[] = [];

  for (const no of diagrama.nodes) {
    const tipo = config.nodeTypes[no.type];
    if (!tipo) continue;

    for (const tech of tipo.techs) {
      const porTech = regras.porTech[tech];
      if (!porTech) continue;

      const relevantes = requisitosRelevantes(porTech.checklistTecnico ?? [], tipo.contextos).filter(
        (r) => r.checagem && condicaoBate(r, [no], diagrama.edges)
      );

      for (const requisito of relevantes) {
        const c = requisito.checagem!;
        const ok = satisfaz(c, no.spec[c.campo]?.valor);
        if (ok === false) {
          violacoes.push({
            noId: no.id,
            noLabel: rotuloDe(no),
            tech,
            campo: c.campo,
            texto: requisito.texto,
            esperado: descreverEsperado(c),
            atual: String(no.spec[c.campo]?.valor ?? "—"),
          });
        }
      }
    }
  }

  return violacoes;
}

function rotuloDe(no: No): string {
  return no.label?.trim() || no.id;
}

/** As violações deste nó — é o que o semáforo do nó mostra no popover. */
export function violacoesDoNo(violacoes: Violacao[], noId: string): Violacao[] {
  return violacoes.filter((v) => v.noId === noId);
}
