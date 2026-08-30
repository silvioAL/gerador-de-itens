import type {
  ItemProcesso,
  RegrasConfig,
  RegrasPorTech,
  Requisito,
  RequisitoDePercurso,
  RequisitoDeTopologia,
  TesteAutomatizado,
} from "./types.js";

/**
 * SPEC-86 fatia A — **as regras do time mais as do produto, com procedência.**
 *
 * ## A decisão que define esta função: soma, não substituição
 *
 * O degrau `time → global`, que já existia em `configEmPostgres.obter`,
 * **substitui**: um time com documento próprio não vê o da casa. Está certo lá,
 * porque as duas respondem à mesma pergunta — *"como este time refina?"* — e
 * duas respostas para uma pergunta é ambiguidade.
 *
 * Aqui não é a mesma pergunta:
 *
 * - o checklist do **time** responde *"como se constrói software nesta casa"*:
 *   DLQ configurada, idempotência, plano de migração, ciclos de teste;
 * - o checklist do **produto** responde *"o que é verdade sobre ESTE produto"*:
 *   a vitrine é pública, então acessibilidade se confere; o backoffice processa
 *   dado sensível, então a trilha de auditoria se confere.
 *
 * **Um não substitui o outro.** Um produto que declarasse regras e com isso
 * perdesse as do time ficaria pior do que antes — e é o congelamento que o §306
 * mediu no `PipelineAgentesTab`: herdado copiado vira cópia morta que para de
 * acompanhar a evolução do original.
 *
 * ## A identidade de um item é o TEXTO
 *
 * `Requisito` e `ItemProcesso` não têm id. O que os distingue para quem lê é a
 * frase, e é por ela que o produto sobrepõe um item do time — a régua do §306
 * (*declarado vence herdado*) vale só onde há **conflito**, e conflito aqui é
 * dizer a mesma frase de dois lugares.
 *
 * Isso tem um custo, e é honesto declará-lo: mudar o texto de um requisito do
 * time desfaz a sobreposição, e o item volta a aparecer duas vezes. O contrário
 * — inventar id agora — obrigaria a migrar todo documento de config que já
 * existe para ganhar uma precisão que ninguém pediu.
 */

export type OrigemDaRegra = "time" | "produto";

/** As listas de `RegrasPorTech` que o produto pode somar. */
export type ListaDeRegra = "checklistTecnico" | "checklistProcesso" | "testes";

/**
 * A chave de procedência de um item, para a tela dizer de onde ele veio sem
 * precisar refazer a comparação por conta própria (§263).
 */
export function chaveDaRegra(tech: string, lista: ListaDeRegra | "percursos" | "topologia", texto: string): string {
  return `${tech}|${lista}|${texto}`;
}

export interface RegrasEmVigor {
  /**
   * O documento somado. Tem a MESMA forma de `RegrasConfig` de propósito: todo
   * consumidor de hoje — derivação, documento, conformidade — continua lendo o
   * que sempre leu, sem saber que existe um eixo novo.
   */
  regras: RegrasConfig;
  /** `chaveDaRegra(...)` → de onde o item veio. Só o que é do produto entra. */
  origemDe: Record<string, OrigemDaRegra>;
  /** Quantos itens o produto acrescentou ou sobrepôs — a tela diz o número. */
  doProduto: number;
}

/**
 * A identidade de um item, para saber quando o do produto sobrepõe o do time.
 *
 * Os requisitos (técnico, processo, percurso, topologia) se identificam pela
 * **frase**, que é o que quem lê usa para reconhecê-los.
 *
 * `TesteAutomatizado` é a exceção, e vale ser explícito em vez de deixar um
 * `JSON.stringify` decidir: ele não tem `texto` — tem `tipo` e `validacao`, e o
 * que identifica um ciclo de teste dentro de uma tech é o **tipo** ("unitário",
 * "integração"). Dois com o mesmo tipo são o mesmo ciclo, e o do produto manda.
 */
function textoDe(item: Requisito | ItemProcesso | TesteAutomatizado | RequisitoDePercurso | RequisitoDeTopologia): string {
  if ("texto" in item && typeof item.texto === "string") return item.texto;
  if ("tipo" in item && typeof item.tipo === "string") return item.tipo;
  // Forma inesperada: cai numa identidade que só casa consigo mesma, o que faz
  // o item ACRESCENTAR em vez de sumir. Errar somando é recuperável; errar
  // sobrepondo apaga a regra de alguém sem aviso.
  return JSON.stringify(item);
}

/**
 * Soma duas listas: o que o produto declara com o mesmo texto **sobrepõe**, o
 * resto **acrescenta**. A ordem preserva a do time primeiro — quem lê o
 * checklist aprendeu a ordem da casa, e embaralhá-la a cada produto novo
 * custaria mais que o benefício de agrupar.
 */
function somar<T extends Requisito | ItemProcesso | TesteAutomatizado | RequisitoDePercurso | RequisitoDeTopologia>(
  doTime: T[] | undefined,
  doProduto: T[] | undefined,
  marcar: (texto: string) => void
): T[] {
  const deLa = doProduto ?? [];
  if (deLa.length === 0) return doTime ?? [];

  const porTexto = new Map(deLa.map((i) => [textoDe(i), i]));
  const sobrepostos = (doTime ?? []).map((i) => {
    const substituto = porTexto.get(textoDe(i));
    if (!substituto) return i;
    porTexto.delete(textoDe(i));
    marcar(textoDe(i));
    return substituto;
  });

  for (const novo of porTexto.values()) marcar(textoDe(novo));
  return [...sobrepostos, ...porTexto.values()];
}

/**
 * Sem documento de produto, devolve **o objeto do time**, e não uma cópia.
 *
 * É a garantia mais importante da fatia: quem não usa o eixo não paga nada, e o
 * teste compara o objeto inteiro em vez de por trecho — comparação por trecho
 * deixaria passar exatamente a mudança que isto arrisca introduzir.
 */
export function regrasEmVigor(doTime: RegrasConfig, doProduto?: RegrasConfig | null): RegrasEmVigor {
  if (!doProduto) return { regras: doTime, origemDe: {}, doProduto: 0 };

  const origemDe: Record<string, OrigemDaRegra> = {};
  const marcarEm = (tech: string, lista: ListaDeRegra | "percursos" | "topologia") => (texto: string) => {
    origemDe[chaveDaRegra(tech, lista, texto)] = "produto";
  };

  const techs = [...new Set([...Object.keys(doTime.porTech), ...Object.keys(doProduto.porTech ?? {})])];
  const porTech: Record<string, RegrasPorTech> = {};

  for (const tech of techs) {
    const t = doTime.porTech[tech];
    const p = doProduto.porTech?.[tech];
    porTech[tech] = {
      checklistTecnico: somar(t?.checklistTecnico, p?.checklistTecnico, marcarEm(tech, "checklistTecnico")),
      checklistProcesso: somar(t?.checklistProcesso, p?.checklistProcesso, marcarEm(tech, "checklistProcesso")),
      testes: somar(t?.testes, p?.testes, marcarEm(tech, "testes")),
      // A volumetria é um bloco só, não uma lista: o produto declara ou herda.
      volumetria: p?.volumetria ?? t?.volumetria,
    };
  }

  return {
    regras: {
      // `tipos` e `tamanhos` são o VOCABULÁRIO do time — a taxonomia com que
      // esta casa nomeia item e tamanho. Um produto que os redefinisse criaria
      // dialeto interno, e o §306 já mediu o custo de duas verdades.
      tipos: doTime.tipos,
      tamanhos: doTime.tamanhos,
      porTech,
      percursos: somar(doTime.percursos, doProduto.percursos, marcarEm("*", "percursos")),
      topologia: somar(doTime.topologia, doProduto.topologia, marcarEm("*", "topologia")),
    },
    origemDe,
    doProduto: Object.keys(origemDe).length,
  };
}
