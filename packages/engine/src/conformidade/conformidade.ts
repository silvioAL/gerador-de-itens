import type { Checagem, DiagramaConfig, RegrasConfig, Token } from "../config/types.js";
import type { Diagrama, ExcecaoDePadrao, No } from "../model/types.js";
import { condicaoBate, requisitosRelevantes } from "../refinamento/gerarRefinamento.js";
import { contrasteArredondado } from "./contraste.js";

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
  /** §242 — por que este padrão existe. É o que transforma cobrança em ensino. */
  porque?: string;
  /** §242 — presente quando alguém aceitou esta violação de propósito. */
  excecao?: ExcecaoDePadrao;
  /**
   * SPEC-79 §5 — quanto esta violação cobra. Ausente = `erro`, que é o
   * comportamento de sempre.
   *
   * Viaja NA violação em vez de ser reconsultada na regra por quem a exibe: a
   * tela e a derivação precisam da MESMA resposta, e reler a config em dois
   * lugares é como as duas divergem na primeira mudança (§263).
   */
  severidade?: "aviso" | "erro";
}

/**
 * §241 — o alvo da comparação: literal, outro campo, ou o produto de dois.
 * `undefined` = não dá para afirmar nada (campo ausente ou não numérico), e
 * nesse caso a checagem inteira se cala — mesmo tratamento do campo ausente.
 */
function alvoDa(c: Checagem, no: No): { valor: unknown; descricao: string } | undefined {
  if (!c.valorDe) return { valor: c.valor, descricao: `${c.valor}${c.unidade ?? ""}` };

  const base = numeroDe(no.spec[c.valorDe]?.valor);
  if (base === undefined) return undefined;
  if (!c.multiplicadoPor) return { valor: base, descricao: `${c.valorDe} (= ${base}${c.unidade ?? ""})` };

  const fator = numeroDe(no.spec[c.multiplicadoPor]?.valor);
  if (fator === undefined) return undefined;
  return {
    valor: base * fator,
    // O nome dos campos E a conta: sem os nomes ninguém sabe o que mudar; sem
    // o número ninguém sabe o quanto.
    descricao: `${c.valorDe} × ${c.multiplicadoPor} (= ${base * fator}${c.unidade ?? ""})`,
  };
}

function numeroDe(valor: unknown): number | undefined {
  if (valor === undefined || valor === null || valor === "") return undefined;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

function descreverEsperado(c: Checagem, alvo: string): string {
  switch (c.operador) {
    case "lte":
      return `≤ ${alvo}`;
    case "lt":
      return `< ${alvo}`;
    case "gte":
      return `≥ ${alvo}`;
    case "gt":
      return `> ${alvo}`;
    case "eq":
      return `= ${alvo}`;
    case "ne":
      return `≠ ${alvo}`;
    case "preenchido":
      return "preenchido";
    case "contraste-gte":
      return `contraste ≥ ${alvo}`;
    case "pertence-aos-tokens":
      return "um token declarado";
  }
}

/**
 * SPEC-79 fatia C — os dois operadores do design system.
 *
 * Ficam FORA de `satisfaz` de propósito: aquela função compara um valor com um
 * alvo já resolvido para número, e nenhum destes dois cabe nisso. Contraste
 * precisa da OUTRA cor crua (`valorDe` nomeia um campo, não um número), e
 * pertencimento precisa da lista de tokens, que não é do nó. Espremê-los lá
 * dentro faria `alvoDa` coagir cor para número e devolver `undefined` sempre —
 * a checagem se calaria em silêncio, que é o pior desfecho possível: regra
 * escrita, nada medido, ninguém avisado.
 */
function satisfazDesignSystem(
  c: Checagem,
  no: No,
  tokens: Token[]
): { ok: boolean; atual: string } | undefined {
  const valor = no.spec[c.campo]?.valor;
  if (valor === undefined || valor === null || valor === "") return undefined;
  const texto = String(valor);

  if (c.operador === "contraste-gte") {
    if (!c.valorDe) return undefined;
    const fundo = no.spec[c.valorDe]?.valor;
    if (fundo === undefined || fundo === null || fundo === "") return undefined;

    const razao = contrasteArredondado(texto, String(fundo));
    // Cor que o motor não sabe ler (`var(--painel)`, um nome, um token ainda não
    // resolvido) faz a checagem se calar — a mesma disciplina de `numeroDe`.
    if (razao === undefined) return undefined;

    const minimo = numeroDe(c.valor);
    if (minimo === undefined) return undefined;
    return { ok: razao >= minimo, atual: `${razao}` };
  }

  const declarados = new Set(tokens.map((t) => t.nome));
  return { ok: declarados.has(texto), atual: texto };
}

/** `undefined` = não dá para afirmar nada (campo ausente ou valor de outro tipo). */
function satisfaz(c: Checagem, valor: unknown, valorAlvo: unknown): boolean | undefined {
  if (c.operador === "preenchido") {
    return valor !== undefined && valor !== null && valor !== "";
  }
  if (valor === undefined || valor === null || valor === "") return undefined;

  if (c.operador === "eq") return valor === valorAlvo;
  if (c.operador === "ne") return valor !== valorAlvo;

  // Comparação de ordem só faz sentido em número. Um campo de texto com
  // operador numérico é config incorreta, e o silêncio aqui é deliberado: o
  // lugar de reclamar disso é a validação de config, não o desenho de quem usa.
  const n = numeroDe(valor);
  const alvo = numeroDe(valorAlvo);
  if (n === undefined || alvo === undefined) return undefined;

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
  regras?: RegrasConfig,
  /** §242 — as exceções registradas na quebra. Violação com exceção continua
   * SENDO uma violação (some do vermelho, não do histórico): apagá-la aqui
   * faria a decisão desaparecer junto, e o que se quer é o oposto. */
  excecoes: ExcecaoDePadrao[] = [],
  /** SPEC-79 fatia C — os tokens do time, para `pertence-aos-tokens`. Ausente
   * ou vazio faz essa checagem se calar: cobrar pertencimento a uma lista que
   * ninguém declarou acusaria todo desenho de um time que ainda não configurou
   * design system nenhum. */
  tokens: Token[] = []
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

        // SPEC-79 fatia C — os dois do design system saem antes, porque não
        // passam por `alvoDa` (ver `satisfazDesignSystem`).
        if (c.operador === "contraste-gte" || c.operador === "pertence-aos-tokens") {
          // Lista vazia = time sem design system configurado. Calar é a única
          // resposta honesta: a regra existe, o material contra o qual medir não.
          if (c.operador === "pertence-aos-tokens" && tokens.length === 0) continue;

          const resultado = satisfazDesignSystem(c, no, tokens);
          if (resultado && !resultado.ok) {
            violacoes.push({
              noId: no.id,
              noLabel: rotuloDe(no),
              tech,
              campo: c.campo,
              texto: requisito.texto,
              esperado: descreverEsperado(c, String(c.valor ?? "")),
              atual: resultado.atual,
              porque: requisito.porque,
              severidade: requisito.severidade,
              excecao: excecoes.find((e) => e.noId === no.id && e.campo === c.campo),
            });
          }
          continue;
        }

        const alvo = alvoDa(c, no);
        // Alvo indeterminado (campo comparado ausente ou não numérico): a
        // checagem se cala, como faz com o campo ausente. Acusar aqui seria
        // acusar o desenho por um campo que a regra pressupõe e o tipo não tem.
        if (!alvo && c.operador !== "preenchido") continue;
        const ok = satisfaz(c, no.spec[c.campo]?.valor, alvo?.valor);
        if (ok === false) {
          violacoes.push({
            noId: no.id,
            noLabel: rotuloDe(no),
            tech,
            campo: c.campo,
            texto: requisito.texto,
            esperado: descreverEsperado(c, alvo?.descricao ?? ""),
            atual: String(no.spec[c.campo]?.valor ?? "—"),
            porque: requisito.porque,
            severidade: requisito.severidade,
            excecao: excecoes.find((e) => e.noId === no.id && e.campo === c.campo),
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

/** As que ainda cobram alguém — é este número que vai ao placar. */
export function violacoesEmAberto(violacoes: Violacao[]): Violacao[] {
  return violacoes.filter((v) => !v.excecao);
}

/** As aceitas de propósito. Aparecem, mas noutro lugar e com outra cor. */
export function violacoesAceitas(violacoes: Violacao[]): Violacao[] {
  return violacoes.filter((v) => v.excecao);
}
