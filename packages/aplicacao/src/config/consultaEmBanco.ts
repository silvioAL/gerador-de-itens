import { ConfigInvalida } from "./normalizacao.js";

/**
 * SPEC-110 fatia D (D6) — **o banco de dados como componente do fluxo.**
 *
 * A queixa que abriu a SPEC: *"sinto falta de componente do banco de dados por
 * exemplo e de configurações para essas coisas"*. Um low-code que não lê dado
 * de fora é um encanamento entre agentes.
 *
 * O v1 é deliberadamente estreito (D6): **Postgres, SOMENTE CONSULTA**, com
 * transação read-only, timeout, LIMIT forçado e parâmetros nomeados. Escrita e
 * Mongo têm desenho próprio (SPEC-108) — oferecer meia escrita agora seria a
 * meia-integração que o §346 pagou para aprender.
 *
 * ## Por que parâmetros nomeados, e nunca interpolação
 *
 * `:cliente` vira `$1` na borda, e o VALOR viaja separado do texto do SQL. Não
 * é preferência de estilo: interpolar é injeção, e um fluxo é um lugar onde
 * gente não-técnica escreve. A tradução mora aqui, pura e testável, para que a
 * única forma de mandar SQL ao banco seja esta.
 */

/** O que uma consulta declara — o pedaço `banco` de um conector. */
export interface ConsultaEmBanco {
  motor: "postgres";
  /** A chave da connection string NO COFRE. Nunca no documento (D18). */
  segredoDaConexao: string;
  sql: string;
  /** O teto de linhas. Ausente = 100 — nenhuma consulta volta sem teto. */
  limite?: number;
}

export const LIMITE_PADRAO_DA_CONSULTA = 100;
/** O teto do teto: uma consulta de fluxo alimenta um agente ou uma
 * transformação, não um relatório. */
export const LIMITE_MAXIMO_DA_CONSULTA = 1000;

/**
 * Os parâmetros nomeados que o SQL usa, na ordem da PRIMEIRA aparição.
 *
 * `:nome` fora de literal e fora de `::cast` — o `::` do Postgres é o caso que
 * uma regex ingênua confunde com um parâmetro chamado `:int`.
 */
export function parametrosDoSql(sql: string): string[] {
  const semLiterais = sql
    // Literais e identificadores citados saem antes: `':cliente'` é texto, não
    // parâmetro, e quem escreve isso está falando do caractere.
    .replace(/'([^']|'')*'/g, "''")
    .replace(/"([^"]|"")*"/g, '""')
    // Comentários também: um `-- :param` é uma nota, não um pedido.
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const achados: string[] = [];
  // O `(?<!:)` descarta o segundo `:` de um cast `::text`; o `(?!:)` descarta
  // o primeiro.
  for (const m of semLiterais.matchAll(/(?<![:\w]):([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
    if (!achados.includes(m[1])) achados.push(m[1]);
  }
  return achados;
}

/**
 * A tradução para o driver: `:nome` → `$n`, com os valores na ordem. É o
 * ÚNICO caminho até o banco — o texto do SQL nunca recebe valor nenhum.
 *
 * Parâmetro declarado no SQL e ausente nas entradas é RECUSA, não `null`:
 * `null` viraria uma consulta que devolve o conjunto errado em silêncio, que é
 * pior que falhar (§9.3 — ausente não vira default).
 */
export function traduzirConsulta(
  sql: string,
  entradas: Record<string, unknown>
): { texto: string; valores: unknown[] } {
  const nomes = parametrosDoSql(sql);
  const valores: unknown[] = [];
  for (const nome of nomes) {
    if (!(nome in entradas) || entradas[nome] === undefined) {
      throw new Error(`a consulta usa ":${nome}" e nada chegou nesse campo — ausente não vira default (§9.3)`);
    }
    valores.push(entradas[nome]);
  }
  // A substituição usa a MESMA varredura da extração, para não haver duas
  // ideias de "o que é um parâmetro" (§263).
  let i = 0;
  const texto = sql.replace(/('([^']|'')*')|("([^"]|"")*")|(--[^\n]*)|(\/\*[\s\S]*?\*\/)|((?<![:\w]):([a-zA-Z_][a-zA-Z0-9_]*))/g, (m, ...g) => {
    const nome = g[7] as string | undefined;
    if (nome === undefined) return m; // literal, identificador ou comentário
    return `$${nomes.indexOf(nome) + 1}`;
  });
  void i;
  return { texto, valores };
}

/**
 * **O LIMIT forçado.** Uma consulta sem teto trava o fluxo com uma tabela
 * inteira na memória — e quem escreveu o SQL raramente pensou no dia em que a
 * tabela cresceu. Se o SQL já tem `limit`, respeitamos o que a pessoa
 * escreveu: ela declarou a intenção, e sobrescrever seria mentir sobre o que
 * roda.
 */
export function comLimite(sql: string, limite?: number): string {
  const semLiterais = sql.replace(/'([^']|'')*'/g, "''").replace(/--[^\n]*/g, "");
  if (/\blimit\b/i.test(semLiterais)) return sql;
  const teto = Math.min(Math.max(1, Math.floor(limite ?? LIMITE_PADRAO_DA_CONSULTA)), LIMITE_MAXIMO_DA_CONSULTA);
  return `${sql.trimEnd().replace(/;\s*$/, "")} LIMIT ${teto}`;
}

/**
 * A régua do "só consulta", **honesta sobre o que é**: uma heurística de
 * texto, não um parser de SQL. Ela recusa o que claramente escreve, e a
 * garantia de verdade é a transação READ ONLY do executor — o cinto e a
 * suspensória, porque nenhum dos dois sozinho basta.
 *
 * Documentar o limite é o ponto: quem lê isto sabe que a segunda linha de
 * defesa existe, e não confia só nesta.
 */
const VERBOS_QUE_ESCREVEM =
  /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|copy|vacuum|call|do|refresh|reindex|comment|lock)\b/i;

export function problemaNaConsulta(consulta: Partial<ConsultaEmBanco>, ondeEle: string): string | null {
  const sql = typeof consulta.sql === "string" ? consulta.sql.trim() : "";
  if (!sql) return `${ondeEle} está sem SQL — um conector de banco sem consulta não tem o que fazer`;
  if (!consulta.segredoDaConexao || !String(consulta.segredoDaConexao).trim()) {
    return `${ondeEle} está sem o segredo da conexão — a connection string mora no COFRE, nunca no documento`;
  }
  if (consulta.motor !== undefined && consulta.motor !== "postgres") {
    return `${ondeEle} usa o motor "${String(consulta.motor)}", e o v1 só fala postgres (Mongo é a SPEC-108)`;
  }
  const semComentarios = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!/^\s*(select|with)\b/i.test(semComentarios)) {
    return `${ondeEle} precisa começar por SELECT ou WITH — o v1 só consulta (escrita é a SPEC-108)`;
  }
  if (VERBOS_QUE_ESCREVEM.test(semComentarios.replace(/'([^']|'')*'/g, "''"))) {
    return `${ondeEle} tem um verbo de escrita no SQL — o v1 só consulta (escrita é a SPEC-108)`;
  }
  if (consulta.limite !== undefined) {
    const n = Number(consulta.limite);
    if (!Number.isFinite(n) || n < 1 || n > LIMITE_MAXIMO_DA_CONSULTA) {
      return `${ondeEle} tem limite "${String(consulta.limite)}" — use um número entre 1 e ${LIMITE_MAXIMO_DA_CONSULTA}`;
    }
  }
  return null;
}

/**
 * **Os parâmetros declarados e os usados têm que bater, nos dois sentidos.**
 *
 * Declarado que não aparece no SQL é um campo que a tela pede e ninguém usa;
 * usado que não foi declarado é uma consulta que falha na execução, com o
 * fluxo na mão. Os dois são silêncio — e a escrita os nomeia (SPEC-35).
 */
export function problemaNosParametros(sql: string, declarados: string[], ondeEle: string): string | null {
  const usados = parametrosDoSql(sql);
  const semUso = declarados.filter((d) => !usados.includes(d));
  if (semUso.length > 0) {
    return `${ondeEle} declara ${semUso.map((p) => `"${p}"`).join(", ")} que o SQL não usa — campo que ninguém lê é pergunta sem propósito`;
  }
  const semDeclaracao = usados.filter((u) => !declarados.includes(u));
  if (semDeclaracao.length > 0) {
    return `${ondeEle} usa ${semDeclaracao.map((p) => `":${p}"`).join(", ")} no SQL sem declarar como entrada — a consulta falharia só na execução`;
  }
  return null;
}

/** A recusa como exceção, para a validação de escrita da config. */
export function exigirConsultaValida(consulta: Partial<ConsultaEmBanco>, declarados: string[], ondeEle: string): void {
  const problema = problemaNaConsulta(consulta, ondeEle) ?? problemaNosParametros(String(consulta.sql ?? ""), declarados, ondeEle);
  if (problema) throw new ConfigInvalida(problema);
}
