import type { Produto } from "./repositorioDeProdutos.js";

/**
 * SPEC-81 fatia F — **trazer a arquitetura de negócio da casa.**
 *
 * ## A premissa, declarada
 *
 * A §7 desta SPEC recomendava adiar: *"depende de a organização ter arquitetura
 * de negócio em formato legível, e **não temos medição disso**"*. O usuário
 * decidiu construir mesmo assim, e a decisão é dele — mas a premissa fica
 * escrita aqui, porque se ela cair é este arquivo que sobra sem uso.
 *
 * O desenho abaixo tenta ser barato de descartar: nenhuma coluna nova, nenhuma
 * migração, e o produto continua funcionando igual para quem não configurar o
 * destino.
 *
 * ## Por que a importação NÃO escreve no produto
 *
 * `Produto` não tem espaço para proveniência — `objetivo` é uma `string`, não um
 * `ValorSpec`. Escrever direto faria texto vindo de fora ficar indistinguível do
 * que alguém digitou, que é exatamente o defeito que a fatia C evita nos ADRs.
 *
 * A saída não é acrescentar proveniência a seis campos: é **não escrever**. A
 * importação devolve uma **proposta**, campo a campo, e quem aceita é a pessoa —
 * que é a tese do produto inteiro (*nada que a IA propõe conta antes da
 * confirmação*) aplicada a dado de terceiro.
 *
 * E isso resolve de graça a pergunta que um `overwrite` teria que responder:
 * **o que acontece quando os dois lados discordam?** Aqui a divergência é
 * mostrada, não resolvida — a régua do §306.
 */

/**
 * O que o gateway devolve. Tudo opcional de propósito: arquitetura de negócio
 * de verdade vem em formatos diferentes, e um contrato rígido faria o produto
 * recusar exatamente os repositórios que ele existe para ler.
 */
export interface ArquiteturaDeNegocioExterna {
  objetivo?: string;
  quemUsa?: string;
  regrasDeNegocio?: string;
  sistemas?: string;
  restricoes?: string;
  glossario?: { termo: string; definicao: string }[];
}

export interface LeitorDeArquiteturaDeNegocio {
  /**
   * `undefined` quando não há o que trazer — repositório fora do ar, destino não
   * configurado, resposta vazia.
   *
   * Ausência é resposta, e não exceção: ninguém pode ficar impedido de descrever
   * o produto à mão porque um sistema de terceiro caiu.
   */
  ler(): Promise<ArquiteturaDeNegocioExterna | undefined>;
}

/** Os campos de prosa que a importação alcança. `nome` fica de fora: o nome do
 * produto é escolha da casa, não dado a ser sobrescrito. */
export const CAMPOS_DA_ARQUITETURA = [
  "objetivo",
  "quemUsa",
  "regrasDeNegocio",
  "sistemas",
  "restricoes",
] as const;

export type CampoDaArquitetura = (typeof CAMPOS_DA_ARQUITETURA)[number];

export interface CampoProposto {
  campo: CampoDaArquitetura;
  /** O que está no produto hoje. */
  atual: string;
  /** O que o gateway trouxe. */
  proposto: string;
  /**
   * `novo` — está vazio aqui e veio de lá. Aceitar é ganho puro.
   * `diverge` — os dois têm texto, e são diferentes. **É a única que exige
   *   leitura**, e por isso a tela mostra os dois lados.
   * `igual` — não há o que decidir, e não aparece.
   */
  situacao: "novo" | "diverge" | "igual";
}

export interface PropostaDeArquitetura {
  campos: CampoProposto[];
  /** Termos que a casa tem e este produto não. Os que já existem ficam de fora:
   * redefinir termo do glossário é decisão maior que importar, e não cabe num
   * botão de "trazer". */
  termosNovos: { termo: string; definicao: string }[];
}

/**
 * A proposta, campo a campo — função pura, no pacote de aplicação.
 *
 * A tela precisa saber quantas decisões existem para dizer o número no botão, e
 * o caso de uso precisa saber quais são. Duas leituras da mesma pergunta
 * divergem na primeira mudança (§263).
 */
export function propostaDeArquitetura(
  externa: ArquiteturaDeNegocioExterna | undefined,
  produto: Pick<Produto, CampoDaArquitetura | "glossario">
): PropostaDeArquitetura {
  if (!externa) return { campos: [], termosNovos: [] };

  const campos: CampoProposto[] = [];
  for (const campo of CAMPOS_DA_ARQUITETURA) {
    const proposto = (externa[campo] ?? "").trim();
    if (!proposto) continue;
    const atual = (produto[campo] ?? "").trim();
    campos.push({ campo, atual, proposto, situacao: !atual ? "novo" : atual === proposto ? "igual" : "diverge" });
  }

  const jaTem = new Set(produto.glossario.map((t) => t.termo.trim().toLowerCase()));
  const termosNovos = (externa.glossario ?? [])
    .map((t) => ({ termo: (t.termo ?? "").trim(), definicao: (t.definicao ?? "").trim() }))
    .filter((t) => t.termo && t.definicao && !jaTem.has(t.termo.toLowerCase()));

  return { campos, termosNovos };
}

/** Quantas decisões a proposta pede. `igual` não conta: não há o que decidir. */
export function decisoesNaProposta(proposta: PropostaDeArquitetura): number {
  return proposta.campos.filter((c) => c.situacao !== "igual").length + proposta.termosNovos.length;
}
