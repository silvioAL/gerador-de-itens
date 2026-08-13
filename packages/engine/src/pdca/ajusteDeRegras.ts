import type { RegrasConfig } from "../config/types.js";

/**
 * SPEC-45 — um ajuste de configuração como DADO, não como texto solto.
 *
 * O feedback ("sobrou volumetria", "faltou item de DLQ") vira uma operação
 * pequena e nomeada. Ser dado é o que permite as três coisas que o texto
 * livre não permitia: **prever** o efeito num item de exemplo antes de
 * decidir, **aplicar** sozinho quando aprovado (sem alguém reescrever o
 * documento à mão) e **rastrear** o que exatamente mudou.
 *
 * Escopo desta fase: o checklist técnico por tech/contexto — é a
 * configuração que o feedback real cita, e a que aparece item a item na
 * revisão. Recurso novo entra aqui como um `tipo` novo, com a mesma forma.
 */
export type OperacaoDeAjuste =
  | { tipo: "adicionar-checklist"; tech: string; contextos: string[]; texto: string }
  | { tipo: "remover-checklist"; tech: string; texto: string };

/** A frase que a solicitação mostra a quem decide — sem jargão de estrutura. */
export function descreverOperacao(op: OperacaoDeAjuste): string {
  if (op.tipo === "adicionar-checklist") {
    const onde = op.contextos.length > 0 ? ` (contextos: ${op.contextos.join(", ")})` : " (todos os contextos)";
    return `Adicionar ao checklist técnico de ${op.tech}${onde}: "${op.texto}"`;
  }
  return `Remover do checklist técnico de ${op.tech}: "${op.texto}"`;
}

/**
 * Aplica a operação e devolve um documento NOVO — nunca muta o recebido: a
 * prévia precisa comparar antes/depois lado a lado, e mutar tornaria os dois
 * o mesmo objeto.
 *
 * Adicionar duas vezes o mesmo texto na mesma tech é no-op: aprovar duas
 * solicitações parecidas não pode duplicar linha no checklist de ninguém.
 */
export function aplicarOperacao(regras: RegrasConfig, op: OperacaoDeAjuste): RegrasConfig {
  const porTech = { ...regras.porTech };
  const daTech = { ...(porTech[op.tech] ?? {}) };
  const checklist = [...(daTech.checklistTecnico ?? [])];

  if (op.tipo === "adicionar-checklist") {
    if (!checklist.some((c) => c.texto === op.texto)) {
      checklist.push({ texto: op.texto, contextos: op.contextos });
    }
  } else {
    const semOItem = checklist.filter((c) => c.texto !== op.texto);
    // Remover algo que não existe é no-op, não erro: a config pode ter
    // mudado entre o pedido e a decisão (a validade já barra o caso grave).
    checklist.length = 0;
    checklist.push(...semOItem);
  }

  daTech.checklistTecnico = checklist;
  porTech[op.tech] = daTech;
  return { ...regras, porTech };
}

/** As linhas que ENTRAM e SAEM do checklist de uma combinação tech/contexto —
 * o diff que a prévia pinta ao lado do item de exemplo. */
export function diferencaDoChecklist(
  antes: RegrasConfig,
  depois: RegrasConfig,
  tech: string
): { adicionados: string[]; removidos: string[] } {
  const textos = (r: RegrasConfig) => (r.porTech[tech]?.checklistTecnico ?? []).map((c) => c.texto);
  const antesTextos = textos(antes);
  const depoisTextos = textos(depois);
  return {
    adicionados: depoisTextos.filter((t) => !antesTextos.includes(t)),
    removidos: antesTextos.filter((t) => !depoisTextos.includes(t)),
  };
}
