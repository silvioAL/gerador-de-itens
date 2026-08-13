import type { RegrasConfig } from "../config/types.js";

/**
 * SPEC-45/46 — um ajuste de configuração como DADO, não como texto solto.
 *
 * O feedback ("sobrou volumetria", "faltou item de DLQ") vira uma operação
 * pequena e nomeada. Ser dado é o que permite as três coisas que o texto
 * livre não permitia: **prever** o efeito num item de exemplo antes de
 * decidir, **aplicar** sozinho quando aprovado (sem alguém reescrever o
 * documento à mão) e **rastrear** o que exatamente mudou.
 *
 * SPEC-46 — as QUATRO seções das regras de refinamento, não só o checklist
 * técnico: processo, ciclos de teste e volumetria têm donos diferentes
 * (SPEC-28) e é sobre elas que boa parte do feedback real fala ("sobrou o
 * bloco de volumetria", "faltou repontar massa"). `secao` ausente =
 * `checklistTecnico`: solicitação gravada antes desta fase continua válida
 * e aplicável.
 */
export type SecaoDeRegras = "checklistTecnico" | "checklistProcesso" | "testes" | "volumetria";

/** As duas seções que compartilham a forma "um texto por item". */
export type SecaoDeChecklist = "checklistTecnico" | "checklistProcesso";

export type OperacaoDeAjuste =
  | { tipo: "adicionar-checklist"; secao?: SecaoDeChecklist; tech: string; contextos: string[]; texto: string }
  | { tipo: "remover-checklist"; secao?: SecaoDeChecklist; tech: string; texto: string }
  | {
      tipo: "adicionar-teste";
      tech: string;
      contextos: string[];
      tipoTeste: string;
      validacao: string;
      dev: boolean;
      hlg: boolean;
    }
  | { tipo: "remover-teste"; tech: string; tipoTeste: string }
  | { tipo: "definir-volumetria"; tech: string; contextos: string[] }
  | { tipo: "remover-volumetria"; tech: string }
  // SPEC-50 — o ajuste sai das regras: papel da esteira que sobra (ou que
  // falta) é feedback tão comum quanto item de checklist, e até agora só
  // dava pra pedir por texto e aplicar à mão.
  | { tipo: "ativar-papel"; papelId: string; papelNome?: string }
  | { tipo: "desativar-papel"; papelId: string; papelNome?: string };

/** SPEC-50 — qual DOCUMENTO a operação altera. O recurso RBAC e o caminho de
 * aplicação saem daqui: `regras` tem dono por seção (SPEC-28), o pipeline
 * tem dono próprio. */
export function recursoAlvoDaOperacao(op: OperacaoDeAjuste): "regras" | "pipeline-agentes" {
  return op.tipo === "ativar-papel" || op.tipo === "desativar-papel" ? "pipeline-agentes" : "regras";
}

/** Qual seção a operação mexe — é o que decide QUEM pode aprovar (o RBAC por
 * seção da SPEC-28) e o que a tela destaca na prévia. Só faz sentido quando
 * o alvo é `regras`. */
export function secaoDaOperacao(op: OperacaoDeAjuste): SecaoDeRegras {
  switch (op.tipo) {
    case "adicionar-checklist":
    case "remover-checklist":
      return op.secao ?? "checklistTecnico";
    case "adicionar-teste":
    case "remover-teste":
      return "testes";
    default:
      return "volumetria";
  }
}

/** A forma mínima do documento de pipeline que a operação precisa conhecer —
 * o engine não importa o tipo do `aplicacao` só pra ligar/desligar um papel. */
export interface PipelineComPapeis {
  papeis: { id: string; nome?: string; ativo: boolean }[];
}

/**
 * SPEC-50 — liga/desliga um papel da esteira, devolvendo documento NOVO (a
 * prévia compara antes/depois). Papel que não existe é no-op: a config pode
 * ter mudado entre o pedido e a decisão, e a validade por versão já barra o
 * caso grave.
 */
export function aplicarOperacaoNoPipeline<T extends PipelineComPapeis>(pipeline: T, op: OperacaoDeAjuste): T {
  if (op.tipo !== "ativar-papel" && op.tipo !== "desativar-papel") return pipeline;
  const ativo = op.tipo === "ativar-papel";
  return {
    ...pipeline,
    papeis: pipeline.papeis.map((p) => (p.id === op.papelId ? { ...p, ativo } : p)),
  };
}

const ROTULO_SECAO: Record<SecaoDeRegras, string> = {
  checklistTecnico: "checklist técnico",
  checklistProcesso: "checklist de processo",
  testes: "ciclos de teste",
  volumetria: "requisitos de volumetria",
};

/** A frase que a solicitação mostra a quem decide — sem jargão de estrutura. */
export function descreverOperacao(op: OperacaoDeAjuste): string {
  const secao = recursoAlvoDaOperacao(op) === "regras" ? ROTULO_SECAO[secaoDaOperacao(op)] : "";
  const contextosDe = (contextos: string[]) =>
    contextos.length > 0 ? ` (contextos: ${contextos.join(", ")})` : " (todos os contextos)";

  switch (op.tipo) {
    case "adicionar-checklist":
      return `Adicionar ao ${secao} de ${op.tech}${contextosDe(op.contextos)}: "${op.texto}"`;
    case "remover-checklist":
      return `Remover do ${secao} de ${op.tech}: "${op.texto}"`;
    case "adicionar-teste": {
      const ambientes = [op.dev ? "dev" : null, op.hlg ? "hlg" : null].filter(Boolean).join(" e ");
      return `Adicionar aos ${secao} de ${op.tech}${contextosDe(op.contextos)}: "${op.tipoTeste}" — ${op.validacao} (${
        ambientes || "sem ambiente marcado"
      })`;
    }
    case "remover-teste":
      return `Remover dos ${secao} de ${op.tech}: "${op.tipoTeste}"`;
    case "definir-volumetria":
      return `Exigir ${secao} em ${op.tech}${contextosDe(op.contextos)}`;
    case "remover-volumetria":
      return `Não exigir mais ${secao} em ${op.tech}`;
    case "ativar-papel":
      return `Ligar o papel "${op.papelNome ?? op.papelId}" na esteira de agentes`;
    case "desativar-papel":
      return `Desligar o papel "${op.papelNome ?? op.papelId}" da esteira de agentes`;
  }
}

/**
 * Aplica a operação e devolve um documento NOVO — nunca muta o recebido: a
 * prévia precisa comparar antes/depois lado a lado, e mutar tornaria os dois
 * o mesmo objeto.
 *
 * Adicionar duas vezes a mesma coisa é no-op: aprovar duas solicitações
 * parecidas não pode duplicar linha no checklist de ninguém. Remover o que
 * não existe também é no-op — a config pode ter mudado entre o pedido e a
 * decisão (a validade por versão já barra o caso grave).
 */
export function aplicarOperacao(regras: RegrasConfig, op: OperacaoDeAjuste): RegrasConfig {
  // Operação de outro documento (papel da esteira, SPEC-50) não mexe aqui —
  // quem escolhe o caminho é `recursoAlvoDaOperacao`, e passar pelo lugar
  // errado tem que ser no-op, não exceção.
  // (checagem pelo `tipo` e não por `recursoAlvoDaOperacao`: é o que estreita
  // a união pro resto da função enxergar `tech`.)
  if (op.tipo === "ativar-papel" || op.tipo === "desativar-papel") return regras;
  const porTech = { ...regras.porTech };
  const daTech = { ...(porTech[op.tech] ?? { checklistTecnico: [], testes: [] }) };

  switch (op.tipo) {
    case "adicionar-checklist": {
      const secao = op.secao ?? "checklistTecnico";
      const lista = [...(daTech[secao] ?? [])];
      if (!lista.some((c) => c.texto === op.texto)) lista.push({ texto: op.texto, contextos: op.contextos });
      daTech[secao] = lista;
      break;
    }
    case "remover-checklist": {
      const secao = op.secao ?? "checklistTecnico";
      daTech[secao] = (daTech[secao] ?? []).filter((c) => c.texto !== op.texto);
      break;
    }
    case "adicionar-teste": {
      const testes = [...(daTech.testes ?? [])];
      if (!testes.some((t) => t.tipo === op.tipoTeste)) {
        testes.push({ tipo: op.tipoTeste, validacao: op.validacao, contextos: op.contextos, dev: op.dev, hlg: op.hlg });
      }
      daTech.testes = testes;
      break;
    }
    case "remover-teste":
      daTech.testes = (daTech.testes ?? []).filter((t) => t.tipo !== op.tipoTeste);
      break;
    case "definir-volumetria":
      daTech.volumetria = { contextos: op.contextos };
      break;
    case "remover-volumetria":
      delete daTech.volumetria;
      break;
  }

  // `checklistTecnico` e `testes` são obrigatórios no tipo: tech nova nasce
  // com as duas listas, mesmo que a operação tenha mexido em outra seção.
  porTech[op.tech] = { ...daTech, checklistTecnico: daTech.checklistTecnico ?? [], testes: daTech.testes ?? [] };
  return { ...regras, porTech };
}

/** As linhas que ENTRAM e SAEM de uma seção em lista — o diff que a prévia
 * pinta ao lado do item de exemplo. */
export function diferencaDoChecklist(
  antes: RegrasConfig,
  depois: RegrasConfig,
  tech: string,
  secao: SecaoDeChecklist = "checklistTecnico"
): { adicionados: string[]; removidos: string[] } {
  const textos = (r: RegrasConfig) => (r.porTech[tech]?.[secao] ?? []).map((c) => c.texto);
  const antesTextos = textos(antes);
  const depoisTextos = textos(depois);
  return {
    adicionados: depoisTextos.filter((t) => !antesTextos.includes(t)),
    removidos: antesTextos.filter((t) => !depoisTextos.includes(t)),
  };
}
