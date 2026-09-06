import type { Atividade, FichaEspecificacaoNo, FichaItem, FichaPlaceholder, ValorSpec } from "@gerador/engine";
import { GRUPOS_FICHA, type GrupoFicha, type PapelConfigurado } from "../config/normalizacao.js";

/**
 * SPEC-107 G5 — **a fila da esteira, PURA e fora do navegador.**
 *
 * A revisão monta a fila de trabalho da esteira (um item por atividade, com os
 * placeholders separados por papel) DENTRO da tela — e a fiação semeada
 * `esteira-de-agentes` precisa da MESMA fila para a prova da SPEC-105 F
 * ("resultado idêntico item a item") ter chance: o dublê determinístico semeia
 * a resposta com o prompt inteiro, e o prompt nasce da fila.
 *
 * Este módulo é a mudança de casa (§263: uma implementação só): as funções
 * vieram da `ReviewScreen` À LETRA, e a tela passa a importar daqui — um
 * desvio entre a fila da revisão e a da fiação quebra em compilação/teste,
 * não em produção.
 */

/** Um placeholder a resolver dentro da ficha de um item (SPEC-23 Fase 1d-ii). */
export interface PlaceholderDoPedido {
  chave: string;
  tech: string;
  rotulo: string;
}

/** Um artefato já escrito por um papel anterior (ou pelo usuário), mandado
 * como insumo pro papel seguinte — o encadeamento que faz a esteira ser um
 * pipeline de verdade, não N geradores independentes. */
export interface RespostaAnterior {
  rotulo: string;
  valor: string;
}

/** Um item da fila de trabalho da esteira (SPEC-24 Fase C). */
export interface ItemDaFilaDaEsteira {
  atividadeChave: string;
  atividadeRotulo: string;
  contextoNo: string;
  /** Chave = ID do papel CONFIGURADO (não o grupo): quem monta a fila já
   * resolveu qual papel leva cada seção de cada item (contextos, Fase F). */
  placeholdersPorPapel: Record<string, PlaceholderDoPedido[]>;
  /** O que JÁ existia antes desta corrida e não vai ser regenerado — entra
   * como insumo dos papéis desde o primeiro. */
  respostasExistentes?: RespostaAnterior[];
}

/** Só conta como "resolvido" resposta manual ou sugestão já confirmada — a
 * mesma régua do engine (`gerarRefinamento.ts`) e da barra de pendências. */
export function respostaConfirmada(resp: ValorSpec | undefined): boolean {
  return !!resp && (resp.origem === "manual" || resp.confirmado === true);
}

/** Agrupa os placeholders da ficha pelo papel da esteira responsável
 * (SPEC-24) — PO escreve história/critérios/entrega, Arquiteto o contrato,
 * Especialista o checklist/volumetria, QA as regras de teste/cenário. Fonte
 * única: nunca uma segunda lista hardcoded de "quais campos existem". */
export function placeholdersDaFichaPorGrupo(ficha: FichaItem): Record<GrupoFicha, FichaPlaceholder[]> {
  return {
    po: [ficha.historiaUsuario, ficha.criteriosAceiteContextual, ficha.entregaFinal],
    arquiteto: [ficha.contrato.noVinculado, ficha.contrato.request, ficha.contrato.response, ficha.contrato.erros, ficha.contrato.dependencias],
    especialista: [...ficha.checklistTecnico, ...ficha.volumetria],
    qa: [ficha.regrasTeste, ficha.cenarioFeature],
  };
}

/** SPEC-24 Fase F — qual papel CONFIGURADO leva a seção `grupo` de um item:
 * o primeiro papel ativo com esse grupo cujos contextos casem com as
 * techs/contextos da atividade (lista vazia casa com tudo). Casamento parcial
 * e sem case — a MESMA semântica do `contextoBate()` do engine. */
export function papelDoGrupo(
  papeisAtivos: PapelConfigurado[],
  grupo: GrupoFicha,
  atividade: { techs: string[]; contextos: string[] }
): PapelConfigurado | undefined {
  return papeisAtivos.find(
    (p) =>
      p.grupo === grupo &&
      (p.contextos.length === 0 ||
        p.contextos.some((c) =>
          [...atividade.contextos, ...atividade.techs].some((sel) => sel.toLowerCase().includes(c.toLowerCase()))
        ))
  );
}

/** Contexto compacto do(s) nó(s) de origem da atividade, mandado ao modelo
 * junto com o requisito — sem isso a sugestão sai genérica demais (SPEC-23). */
export function contextoDoPlaceholder(ficha: FichaEspecificacaoNo[]): string {
  return ficha
    .map((no) => {
      const campos = no.camposEscalares
        .filter((c) => c.valor !== undefined && c.valor !== "")
        .map((c) => `${c.key}: ${String(c.valor)}`)
        .join(", ");
      return `${no.label} (${no.tipoLabel}, ${no.status})${campos ? ` — ${campos}` : ""}`;
    })
    .join(" | ");
}

/**
 * A fila de trabalho da esteira — um item por ATIVIDADE com ficha, com os
 * placeholders já separados por papel. `apenasPendentes` false é o "Gerar de
 * novo" (regenera tudo, inclusive confirmado).
 */
export function montarFilaDaEsteira(opcoes: {
  atividades: Atividade[];
  fichas: Map<string, FichaItem>;
  papeisAtivos: PapelConfigurado[];
  apenasPendentes: boolean;
}): ItemDaFilaDaEsteira[] {
  const { atividades, fichas, papeisAtivos, apenasPendentes } = opcoes;
  const fila: ItemDaFilaDaEsteira[] = [];
  for (const a of atividades) {
    const ficha = fichas.get(a.chave);
    if (!ficha) continue;
    const contextoNo = contextoDoPlaceholder(ficha.especificacaoTecnica);
    const porGrupo = placeholdersDaFichaPorGrupo(ficha);
    // Fase F: cada seção da ficha vai pro papel CONFIGURADO que a leva neste
    // item (contextos) — chaveado pelo id do papel, não pelo grupo.
    const placeholdersPedido: Record<string, PlaceholderDoPedido[]> = Object.fromEntries(
      papeisAtivos.map((p) => [p.id, [] as PlaceholderDoPedido[]])
    );
    for (const grupo of GRUPOS_FICHA) {
      const dono = papelDoGrupo(papeisAtivos, grupo, a);
      if (!dono) continue;
      const relevantes = apenasPendentes ? porGrupo[grupo].filter((p) => !respostaConfirmada(p.resposta)) : porGrupo[grupo];
      placeholdersPedido[dono.id].push(...relevantes.map((p) => ({ chave: p.chave, tech: p.tech, rotulo: p.rotulo })));
    }
    const temTrabalho = papeisAtivos.some((p) => placeholdersPedido[p.id].length > 0);
    if (!temTrabalho) continue;
    // Encadeamento: tudo que JÁ está respondido e NÃO vai ser regenerado
    // nesta corrida entra como insumo dos papéis (o Arquiteto lê a história
    // que o PO escreveu). As respostas geradas durante a corrida quem acumula
    // é o executor.
    const chavesNaFila = new Set(Object.values(placeholdersPedido).flat().map((p) => p.chave));
    const respostasExistentes = GRUPOS_FICHA.flatMap((grupo) => porGrupo[grupo])
      .filter((p) => typeof p.resposta?.valor === "string" && p.resposta.valor !== "" && !chavesNaFila.has(p.chave))
      .map((p) => ({ rotulo: p.rotulo, valor: String(p.resposta?.valor) }));
    fila.push({
      atividadeChave: a.chave,
      atividadeRotulo: a.rotulo,
      contextoNo,
      placeholdersPorPapel: placeholdersPedido,
      respostasExistentes,
    });
  }
  return fila;
}
