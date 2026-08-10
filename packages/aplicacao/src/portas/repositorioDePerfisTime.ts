/**
 * SPEC-31 Fase 2 — a porta de Perfis de time.
 *
 * "Qual é a stack padrão deste time para um nó deste tipo": o valor que o
 * `PropertiesPanel` oferece pronto quando alguém arrasta um Serviço para o
 * canvas. O modo hospedado guarda isso em linhas `(time, tipoNo, campo, valor)`
 * e o local num JSON aninhado — a forma que a `packages/web` consome é a
 * aninhada nos dois casos, então é ela que a porta fala.
 */

/** `Record<tipoNo, Record<campo, valor>>` — o perfil de UM time. */
export type PerfilDeTime = Record<string, Record<string, string>>;

/** `Record<timeId, PerfilDeTime>` — a mesma forma do `PerfisConfig` do engine. */
export type PerfisDeTimes = Record<string, PerfilDeTime>;

export interface RepositorioDePerfisTime {
  listarTodos(): Promise<PerfisDeTimes>;
  obter(timeId: string): Promise<PerfilDeTime>;
  /**
   * Mescla `valores` no perfil de (`timeId`, `tipoNo`) e devolve como ficou.
   * Mescla, não substitui: a UI salva um campo por vez, e substituir apagaria
   * os outros valores da mesma stack a cada gravação.
   */
  definir(timeId: string, tipoNo: string, valores: Record<string, string>): Promise<Record<string, string>>;
}
