import type { RegrasConfig, RequisitoDeTopologia } from "../config/types.js";

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
export type SecaoDeRegras = "checklistTecnico" | "checklistProcesso" | "testes" | "volumetria" | "topologia";

/** As duas seções que compartilham a forma "um texto por item". */
export type SecaoDeChecklist = "checklistTecnico" | "checklistProcesso";

/** As operações que mexem no DOCUMENTO de regras — as únicas que têm `tech`.
 * Separadas da união maior porque `aplicarOperacao` e `secaoDaOperacao` só
 * fazem sentido sobre elas, e um tipo próprio diz isso melhor que um `if` de
 * seis termos repetido em cada função. */
export type OperacaoDeRegras =
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
  /**
   * SPEC-63 fatia D — a régua sobre a FORMA nasce do ciclo, como as outras.
   *
   * Sem isto ela só se configuraria editando JSON, e o §194 já mostrou o que
   * acontece com capacidade que não tem porta na tela: ninguém a usa. `id`
   * entra na operação porque é a chave estável a que as exceções se prendem —
   * gerá-lo na aplicação faria o mesmo pedido aplicado duas vezes criar duas
   * regras.
   */
  | { tipo: "adicionar-topologia"; requisito: RequisitoDeTopologia }
  | { tipo: "remover-topologia"; id: string; texto?: string };

/** SPEC-50 — o ajuste sai das regras: papel da esteira que sobra (ou que
 * falta) é feedback tão comum quanto item de checklist, e até então só dava
 * pra pedir por texto e aplicar à mão. */
export type OperacaoDePipeline =
  | { tipo: "ativar-papel"; papelId: string; papelNome?: string }
  | { tipo: "desativar-papel"; papelId: string; papelNome?: string };

/** SPEC-52 — os campos da ficha, que são o pedido mais comum de todos ("falta
 * um campo de SLA no serviço"). */
export type OperacaoDeCampo =
  | { tipo: "adicionar-campo-no"; tipoNo: string; campo: CampoProposto }
  | { tipo: "remover-campo-no"; tipoNo: string; key: string; label?: string }
  | { tipo: "adicionar-campo-aresta"; tipoAresta: string; campo: CampoProposto }
  | { tipo: "remover-campo-aresta"; tipoAresta: string; key: string; label?: string };

export type OperacaoDeAjuste = OperacaoDeRegras | OperacaoDePipeline | OperacaoDeCampo;

/** O guard que estreita a união — `recursoAlvoDaOperacao` devolve string, e
 * string não estreita nada para o compilador. */
export function ehOperacaoDeRegras(op: OperacaoDeAjuste): op is OperacaoDeRegras {
  return recursoAlvoDaOperacao(op) === "regras";
}

/**
 * SPEC-52 — o que um pedido consegue propor de um campo.
 *
 * `lista` fica de fora de propósito: uma lista carrega `itemSpec` (sub-campos
 * com chave, rótulo, tipo e opções), que é estrutura para editar na tela de
 * campos, não para nascer de uma frase de feedback. Pedido de lista continua
 * sendo texto — nem tudo se aplica sozinho.
 */
export type TipoDeCampoProposto = "text" | "textarea" | "number" | "boolean" | "select";

export interface CampoProposto {
  key: string;
  label: string;
  tipoCampo: TipoDeCampoProposto;
  obrigatorio: boolean;
  ajuda?: string;
  opcoes?: string[];
}

/** A forma mínima de um campo da ficha que a operação precisa conhecer — o
 * engine não importa `CampoNo`/`CampoAresta` do `aplicacao` só pra dizer qual
 * campo entra e qual sai (mesma disciplina de `PipelineComPapeis`). */
export interface CampoDaFicha {
  key: string;
  label: string;
  tipoCampo: TipoDeCampoProposto | "lista";
  obrigatorio: boolean;
  ajuda?: string;
  opcoes?: string[];
}

/** SPEC-52 — qual RECURSO a operação de campo mexe, e sob qual chave de
 * componente/conexão. `null` para operação que não é de campo. */
export function alvoDeCampoDaOperacao(op: OperacaoDeAjuste): { recurso: "campos-no" | "campos-aresta"; escopo: string } | null {
  switch (op.tipo) {
    case "adicionar-campo-no":
      return { recurso: "campos-no", escopo: op.tipoNo };
    case "remover-campo-no":
      return { recurso: "campos-no", escopo: op.tipoNo };
    case "adicionar-campo-aresta":
      return { recurso: "campos-aresta", escopo: op.tipoAresta };
    case "remover-campo-aresta":
      return { recurso: "campos-aresta", escopo: op.tipoAresta };
    default:
      return null;
  }
}

/** SPEC-50 — qual DOCUMENTO a operação altera. O recurso RBAC e o caminho de
 * aplicação saem daqui: `regras` tem dono por seção (SPEC-28), o pipeline
 * tem dono próprio. */
export function recursoAlvoDaOperacao(op: OperacaoDeAjuste): RecursoDeAjuste {
  const campo = alvoDeCampoDaOperacao(op);
  if (campo) return campo.recurso;
  return op.tipo === "ativar-papel" || op.tipo === "desativar-papel" ? "pipeline-agentes" : "regras";
}

export type RecursoDeAjuste = "regras" | "pipeline-agentes" | "campos-no" | "campos-aresta";

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
    case "definir-volumetria":
    case "remover-volumetria":
      return "volumetria";
    case "adicionar-topologia":
    case "remover-topologia":
      return "topologia";
    default:
      // Operação de outro alvo (pipeline, campos): a resposta não significa
      // nada, e o chamador tem que checar `recursoAlvoDaOperacao` ANTES. Era
      // um `default: return "volumetria"` que valia para tudo — com as
      // operações de campo da SPEC-52 isso mandaria o pedido para o dono da
      // volumetria, que não tem nada com a ficha do componente.
      return "checklistTecnico";
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
  topologia: "forma do desenho",
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
    case "adicionar-campo-no":
      return `Adicionar à ficha de ${op.tipoNo} o campo "${op.campo.label}"${op.campo.obrigatorio ? " (obrigatório)" : ""}`;
    case "remover-campo-no":
      return `Remover da ficha de ${op.tipoNo} o campo "${op.label ?? op.key}"`;
    case "adicionar-campo-aresta":
      return `Adicionar à ficha da conexão ${op.tipoAresta} o campo "${op.campo.label}"${
        op.campo.obrigatorio ? " (obrigatório)" : ""
      }`;
    case "remover-campo-aresta":
      return `Remover da ficha da conexão ${op.tipoAresta} o campo "${op.label ?? op.key}"`;
    // SPEC-63 — a frase descreve a FORMA, e não a estrutura da checagem: quem
    // lê o pedido precisa saber o que o desenho passa a ter de respeitar.
    case "adicionar-topologia":
      return `Passar a exigir do desenho: "${op.requisito.texto}"`;
    case "remover-topologia":
      return `Deixar de exigir do desenho: "${op.texto ?? op.id}"`;
  }
}

/**
 * SPEC-52 — a ficha DEPOIS da operação, sem mutar a de antes.
 *
 * É esta função que a tela usa pra mostrar o antes/depois e que o servidor usa
 * pra decidir o que gravar: uma régua só, e não duas implementações que
 * combinam por enquanto.
 *
 * Adicionar campo que já existe é no-op (aprovar duas vezes não duplica linha
 * na ficha de ninguém); remover o que não existe também — é a idempotência que
 * faz as vezes da validade por versão, que estes dois recursos não têm por não
 * serem documento.
 */
export function aplicarOperacaoNosCampos(campos: CampoDaFicha[], op: OperacaoDeAjuste): CampoDaFicha[] {
  switch (op.tipo) {
    case "adicionar-campo-no":
    case "adicionar-campo-aresta": {
      if (campos.some((c) => c.key === op.campo.key)) return [...campos];
      const { key, label, tipoCampo, obrigatorio, ajuda, opcoes } = op.campo;
      return [...campos, { key, label, tipoCampo, obrigatorio, ...(ajuda ? { ajuda } : {}), ...(opcoes ? { opcoes } : {}) }];
    }
    case "remover-campo-no":
    case "remover-campo-aresta":
      return campos.filter((c) => c.key !== op.key);
    default:
      // Operação de outro documento não mexe na ficha — passar pelo caminho
      // errado tem que ser no-op, não exceção (mesma régua de `aplicarOperacao`).
      return [...campos];
  }
}

/** O que ENTRA e o que SAI da ficha — o diff que a prévia pinta e que o
 * servidor traduz em gravação. Por `key`, que é a chave natural do campo. */
export function diferencaDeCampos(
  antes: CampoDaFicha[],
  depois: CampoDaFicha[]
): { adicionados: CampoDaFicha[]; removidos: CampoDaFicha[] } {
  const chaves = (lista: CampoDaFicha[]) => new Set(lista.map((c) => c.key));
  const antesChaves = chaves(antes);
  const depoisChaves = chaves(depois);
  return {
    adicionados: depois.filter((c) => !antesChaves.has(c.key)),
    removidos: antes.filter((c) => !depoisChaves.has(c.key)),
  };
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
  if (!ehOperacaoDeRegras(op)) return regras;

  /**
   * SPEC-63 — a régua de FORMA mora no topo do documento, e não em `porTech`.
   * Ela sai antes do `op.tech` abaixo porque simplesmente não tem tech: uma
   * regra sobre a forma atravessa techs por definição.
   */
  if (op.tipo === "adicionar-topologia") {
    const topologia = [...(regras.topologia ?? [])];
    const i = topologia.findIndex((t) => t.id === op.requisito.id);
    // Idempotente por `id`: aplicar o mesmo pedido duas vezes atualiza, não
    // duplica — e duplicar dividiria as exceções entre duas regras iguais.
    if (i >= 0) topologia[i] = op.requisito;
    else topologia.push(op.requisito);
    return { ...regras, topologia };
  }
  if (op.tipo === "remover-topologia") {
    return { ...regras, topologia: (regras.topologia ?? []).filter((t) => t.id !== op.id) };
  }

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
