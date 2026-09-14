import type { ValorSpec } from "@gerador/engine";
import type { FichaItem, FichaPlaceholder } from "@gerador/engine";

/**
 * SPEC-44 — a contagem de pendências da revisão, pura. É a régua ÚNICA:
 * a barra da revisão, os chips dos cards e a seção dos itens do documento
 * falam a partir
 * daqui — "sugestão aguardando" (a esteira escreveu, ninguém assinou) e
 * "campo vazio" (ninguém escreveu) são coisas diferentes e a frase diz qual.
 */

/** Mesma régua do semáforo de prontidão: manual OU sugerido+confirmado. */
export function respostaConfirmada(resp: ValorSpec | undefined): boolean {
  return !!resp && (resp.origem === "manual" || resp.confirmado === true);
}

/** Os placeholders da ficha, achatados na ordem das seções (PO, Arquiteto,
 * Especialista, QA) — mesma ordem de `placeholdersPorPapel` da revisão. */
export function placeholdersDaFicha(ficha: FichaItem): FichaPlaceholder[] {
  return [
    ficha.historiaUsuario,
    ficha.criteriosAceiteContextual,
    ficha.contrato.noVinculado,
    ficha.contrato.request,
    ficha.contrato.response,
    ficha.contrato.erros,
    ficha.contrato.dependencias,
    ...ficha.checklistTecnico,
    ...ficha.volumetria,
    ficha.regrasTeste,
    ficha.cenarioFeature,
    // §199 — sem esta linha, a barra da revisão dizia "nada pendente"
    // enquanto o card do item cobrava "✍️ 1 campo a especificar": duas
    // réguas de novo, que é justamente o que a SPEC-44 unificou.
    ficha.entregaFinal,
  ];
}

/** Uma sugestão aguardando assinatura — o que a fila guiada percorre. */
export interface PendenteDeConfirmacao {
  itemChave: string;
  itemRotulo: string;
  chave: string;
  rotulo: string;
  tech: string;
  resposta: ValorSpec;
}

export interface PendenciasDaRevisao {
  /** Sugestões da esteira sem assinatura, na ordem dos itens. */
  sugestoes: PendenteDeConfirmacao[];
  /** Placeholders sem resposta nenhuma. */
  vazios: number;
  confirmados: number;
  totais: number;
}

export function pendenciasDaRevisao(itens: { chave: string; rotulo: string; ficha: FichaItem }[]): PendenciasDaRevisao {
  const sugestoes: PendenteDeConfirmacao[] = [];
  let vazios = 0;
  let confirmados = 0;
  let totais = 0;

  for (const { chave: itemChave, rotulo: itemRotulo, ficha } of itens) {
    for (const p of placeholdersDaFicha(ficha)) {
      totais++;
      if (respostaConfirmada(p.resposta)) {
        confirmados++;
      } else if (p.resposta !== undefined) {
        sugestoes.push({ itemChave, itemRotulo, chave: p.chave, rotulo: p.rotulo, tech: p.tech, resposta: p.resposta });
      } else {
        vazios++;
      }
    }
  }

  return { sugestoes, vazios, confirmados, totais };
}

/** Assinar uma sugestão SEM apagar a procedência: a IA escreveu
 * (`origem: "sugerido"` fica), o humano confirmou. Editar é outro caminho —
 * vira `manual` (comportamento existente do campo). */
export function assinarSugestao(resposta: ValorSpec): ValorSpec {
  return { ...resposta, confirmado: true };
}

/** A frase de completude compartilhada entre o card da revisão e a tela de
 * itens — uma régua, um vocabulário. */
export function fraseDeCompletude(sugestoes: number, vazios: number): string {
  if (sugestoes === 0 && vazios === 0) return "pronto";
  const partes: string[] = [];
  if (sugestoes > 0) partes.push(`${sugestoes} ${sugestoes === 1 ? "sugestão" : "sugestões"} a confirmar`);
  if (vazios > 0) partes.push(`✍️ ${vazios} a especificar`);
  return partes.join(" · ");
}
