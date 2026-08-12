/**
 * SPEC-43 — a porta de Stacks conhecidas. Uma stack é um conjunto nomeado de
 * valores de UM componente ("Java + Spring Boot" do Serviço, "Camunda 7" do
 * Processo) num catálogo global da organização. Sem vínculo por time: todo
 * valor do catálogo vira sugestão pra todo mundo (decisão do usuário, §190 —
 * a SPEC-38 F2 tinha perfis heterogêneos apontados por time, e o nome
 * mentia). Filtrar por time volta como refinamento aditivo se precisar.
 */

export interface Stack {
  id: string;
  /** O componente dono da stack (`tipo_no`) — o escopo que mantém o nome honesto. */
  tipoNo: string;
  nome: string;
  criadoPor: string;
  valores: Record<string, string>;
}

/** `tipoNo → campo → valores conhecidos` — o agregado que vira os chips de
 * sugestão nos campos de nós novos (todas as stacks, sem filtro). */
export type SugestoesDeStack = Record<string, Record<string, string[]>>;

export interface RepositorioDeStacks {
  catalogo(): Promise<Stack[]>;
  criar(organizacaoId: string, tipoNo: string, nome: string, criadoPor: string): Promise<Stack>;
  /** Mescla `valores` na stack — mescla, não substitui: a UI salva um campo
   * por vez. Devolve como os valores ficaram. */
  definirValores(stackId: string, valores: Record<string, string>): Promise<Record<string, string>>;
}
