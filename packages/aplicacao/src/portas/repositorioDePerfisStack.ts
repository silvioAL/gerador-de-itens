/**
 * SPEC-38 Fase 2 — a porta de Perfis de STACK.
 *
 * A stack deixou de ser atributo do time: vive num catálogo de perfis
 * nomeados ("Java + Spring Boot") e o time APONTA um deles. A projeção
 * `PerfisDeTimes` (a forma que a web sempre consumiu para sugestões) continua
 * existindo — só que agora é derivada: time → perfil apontado → valores.
 */

/** `Record<tipoNo, Record<campo, valor>>` — os valores de UM perfil. */
export type PerfilDeTime = Record<string, Record<string, string>>;

/** `Record<timeId, PerfilDeTime>` — a projeção que as sugestões consomem
 * (mesma forma do `PerfisConfig` do engine). */
export type PerfisDeTimes = Record<string, PerfilDeTime>;

export interface PerfilStack {
  id: string;
  nome: string;
  criadoPor: string;
  valores: PerfilDeTime;
}

export interface RepositorioDePerfisStack {
  /** A projeção por time (só times com ponteiro aparecem). */
  projecaoPorTime(): Promise<PerfisDeTimes>;
  /** Os valores do perfil apontado por este time ({} sem ponteiro). */
  perfilDoTime(timeId: string): Promise<PerfilDeTime>;
  catalogo(): Promise<PerfilStack[]>;
  /** Qual perfil cada time aponta (times sem ponteiro ficam de fora). */
  ponteiros(): Promise<Record<string, string>>;
  criar(organizacaoId: string, nome: string, criadoPor: string): Promise<PerfilStack>;
  /** Mescla `valores` em (perfil, tipoNo) — mescla, não substitui: a UI salva
   * um campo por vez. Devolve como ficou o tipoNo. */
  definirValores(perfilId: string, tipoNo: string, valores: Record<string, string>): Promise<Record<string, string>>;
  apontar(timeId: string, perfilId: string | null): Promise<void>;
  /**
   * A captura ("salvar estes valores como padrão do time"): grava no perfil
   * apontado; sem ponteiro, cria um perfil `stack de {timeId}` e aponta —
   * o botão do painel continua funcionando com um clique só.
   */
  capturar(
    organizacaoId: string,
    timeId: string,
    tipoNo: string,
    valores: Record<string, string>,
    criadoPor: string
  ): Promise<Record<string, string>>;
}
