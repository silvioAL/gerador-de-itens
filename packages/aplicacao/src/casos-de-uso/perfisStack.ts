import type {
  PerfilDeTime,
  PerfilStack,
  PerfisDeTimes,
  RepositorioDePerfisStack,
} from "../portas/repositorioDePerfisStack.js";

/**
 * SPEC-38 Fase 2 — perfis de stack. Fino como o antecessor (perfisTime): a
 * regra de "mescla, não substitui" mora no contrato da porta; a regra de
 * curadoria (quem PODE criar/editar o catálogo) mora na borda HTTP, porque é
 * autorização, não domínio.
 */
export interface CasosDeUsoDePerfisStack {
  projecaoPorTime(): Promise<PerfisDeTimes>;
  perfilDoTime(timeId: string): Promise<PerfilDeTime>;
  catalogo(): Promise<PerfilStack[]>;
  ponteiros(): Promise<Record<string, string>>;
  criar(organizacaoId: string, nome: string, criadoPor: string): Promise<PerfilStack>;
  definirValores(perfilId: string, tipoNo: string, valores: Record<string, string>): Promise<Record<string, string>>;
  apontar(timeId: string, perfilId: string | null): Promise<void>;
  capturar(
    organizacaoId: string,
    timeId: string,
    tipoNo: string,
    valores: Record<string, string>,
    criadoPor: string
  ): Promise<Record<string, string>>;
}

export function criarCasosDeUsoDePerfisStack(repo: RepositorioDePerfisStack): CasosDeUsoDePerfisStack {
  return {
    projecaoPorTime: () => repo.projecaoPorTime(),
    perfilDoTime: (timeId) => repo.perfilDoTime(timeId),
    catalogo: () => repo.catalogo(),
    ponteiros: () => repo.ponteiros(),
    criar: (organizacaoId, nome, criadoPor) => repo.criar(organizacaoId, nome, criadoPor),
    definirValores: (perfilId, tipoNo, valores) => repo.definirValores(perfilId, tipoNo, valores),
    apontar: (timeId, perfilId) => repo.apontar(timeId, perfilId),
    capturar: (organizacaoId, timeId, tipoNo, valores, criadoPor) =>
      repo.capturar(organizacaoId, timeId, tipoNo, valores, criadoPor),
  };
}
