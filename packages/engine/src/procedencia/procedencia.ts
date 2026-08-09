import type { Atividade, Diagrama, ValorSpec } from "../model/types.js";
import { nosDeOrigem } from "../especificacao/gerarEspecificacaoEntrega.js";

/**
 * SPEC-26 Bloco 1 — procedência de insumos e detecção de obsolescência.
 *
 * A dor que isto ataca, nas palavras do usuário: *"mudou especificação na
 * história X, aí preciso atualizar tudo manualmente depois"*. O caro não é
 * reescrever — é **lembrar o que ficou para trás**. Enquanto a ferramenta não
 * souber dizer quais respostas nasceram de um desenho que já mudou, propagar
 * mudança é chutar escopo.
 *
 * Tudo aqui é determinístico e roda sem modelo nenhum: é a razão de este bloco
 * vir antes da propagação (SPEC-26 §5) — vale sozinho, mesmo sem IA instalada.
 */

/** Um insumo que entrou na resposta: de onde veio (rótulo navegável) e o
 * estado dele no momento em que a resposta foi escrita (hash). */
export interface InsumoDoItem {
  /** Identificação legível e estável — vira o texto do aviso na tela
   * ("o campo `timeout` do nó `srv-fidelidade` mudou"). */
  rotulo: string;
  valor: string;
}

/**
 * Hash curto e estável de um texto (FNV-1a 32 bits, em base 36).
 *
 * Deliberadamente NÃO usa `node:crypto`: o engine é puro e roda no browser
 * também (a mesma função precisa dar o mesmo resultado nos dois lados, senão
 * toda resposta pareceria desatualizada ao trocar de ambiente). Não é
 * criptográfico e não precisa ser — o que se detecta aqui é mudança acidental
 * de conteúdo, não adulteração.
 */
export function hashCurto(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    // Multiplicação FNV por 16777619 sem estourar 32 bits.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function comoTexto(valor: unknown): string {
  if (valor === undefined || valor === null) return "";
  return typeof valor === "string" ? valor : JSON.stringify(valor);
}

/**
 * Os insumos de que as respostas de um item dependem.
 *
 * **Escopo desta v1, deliberado**: a spec dos nós de origem + o contexto do
 * épico. As respostas encadeadas dos papéis anteriores (SPEC-26 §Bloco 1) NÃO
 * entram ainda — pra isso o cálculo precisaria saber a ORDEM dos papéis, que
 * mora na configuração do pipeline e não no engine; incluí-las sem essa ordem
 * marcaria como desatualizada toda resposta assim que o papel seguinte
 * escrevesse, que é ruído, não sinal.
 *
 * Isso já cobre o caso que doeu de verdade: mudar o desenho depois que os
 * itens foram escritos.
 */
export function insumosDoItem(atividade: Atividade, diagrama: Diagrama, contextoEpico?: string): InsumoDoItem[] {
  const insumos: InsumoDoItem[] = [];

  for (const no of nosDeOrigem(atividade, diagrama)) {
    const nome = no.label || no.id;
    for (const [chave, valorSpec] of Object.entries(no.spec ?? {})) {
      const texto = comoTexto((valorSpec as ValorSpec | undefined)?.valor);
      // Campo em branco não é insumo: entrar como "" faria a resposta virar
      // obsoleta no instante em que alguém preenchesse um campo que não tinha
      // relação com ela.
      if (!texto) continue;
      insumos.push({ rotulo: `${nome}.${chave}`, valor: texto });
    }
  }

  // Item derivado de uma CONEXÃO depende também da spec dela (timeout, chave
  // de roteamento, autenticação — SPEC-21): mudar o timeout da chamada tem que
  // marcar como desatualizada a resposta que falava dele.
  const aresta = atividade.origem.edgeId
    ? diagrama.edges.find((e) => e.id === atividade.origem.edgeId)
    : undefined;
  if (aresta) {
    for (const [chave, valorSpec] of Object.entries(aresta.spec ?? {})) {
      const texto = comoTexto((valorSpec as ValorSpec | undefined)?.valor);
      if (!texto) continue;
      insumos.push({ rotulo: `conexão ${aresta.type ?? ""}.${chave}`.trim(), valor: texto });
    }
  }

  if (contextoEpico?.trim()) insumos.push({ rotulo: "contexto do épico", valor: contextoEpico.trim() });

  // Ordem estável: o hash não pode depender da ordem em que os nós vieram.
  return insumos.sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}

/**
 * O carimbo gravado junto com a resposta: rótulo → hash do valor.
 *
 * Guarda o hash de CADA insumo, não um hash só do conjunto, porque isso é o
 * que permite dizer QUAL insumo mudou — e um hash único diria apenas "algo
 * mudou". Não guarda o valor antigo: SPEC-26 §6 tira versionamento de escopo
 * de propósito ("o rastro aqui é de procedência, não de versões"), então a
 * tela mostra o que mudou e o valor ATUAL, nunca o par antes/depois.
 */
export type CarimboProcedencia = Record<string, string>;

export function carimbarInsumos(insumos: InsumoDoItem[]): CarimboProcedencia {
  return Object.fromEntries(insumos.map((i) => [i.rotulo, hashCurto(i.valor)]));
}

export interface InsumoDivergente {
  rotulo: string;
  /** `alterado` = existia e mudou; `novo` = insumo que não existia quando a
   * resposta foi escrita; `removido` = sumiu do desenho. Os três merecem
   * atenção, mas a UI pode querer distingui-los. */
  tipo: "alterado" | "novo" | "removido";
}

/**
 * O que mudou entre o carimbo de uma resposta e o estado atual dos insumos.
 * Lista vazia = a resposta continua alinhada com o desenho.
 */
export function insumosDivergentes(
  carimbo: CarimboProcedencia | undefined,
  insumosAtuais: InsumoDoItem[]
): InsumoDivergente[] {
  // Resposta sem carimbo é resposta antiga (escrita antes deste bloco existir).
  // Tratar como desatualizada encheria a tela de âmbar no primeiro uso, o que
  // seria alarme falso — sem carimbo não há o que comparar, então não há
  // afirmação a fazer.
  if (!carimbo) return [];

  const atual = carimbarInsumos(insumosAtuais);
  const divergentes: InsumoDivergente[] = [];

  for (const [rotulo, hash] of Object.entries(carimbo)) {
    if (!(rotulo in atual)) divergentes.push({ rotulo, tipo: "removido" });
    else if (atual[rotulo] !== hash) divergentes.push({ rotulo, tipo: "alterado" });
  }
  for (const rotulo of Object.keys(atual)) {
    if (!(rotulo in carimbo)) divergentes.push({ rotulo, tipo: "novo" });
  }

  return divergentes.sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}

/** Atalho pra UI: a resposta nasceu de um desenho que já mudou? */
export function respostaDesatualizada(resposta: ValorSpec, insumosAtuais: InsumoDoItem[]): boolean {
  return insumosDivergentes(resposta.baseadoEm, insumosAtuais).length > 0;
}
