import type {
  PerfilDeTime,
  PerfisDeTimes,
  RepositorioDePerfisTime,
} from "../portas/repositorioDePerfisTime.js";

/**
 * SPEC-31 Fase 2 — perfis de time. Fino de propósito: aqui não há regra além
 * de "mescla, não substitui", e essa mora no contrato da porta porque os dois
 * adaptadores a implementam de formas legitimamente diferentes (`onConflict`
 * no Postgres, spread no JSON).
 */
export interface CasosDeUsoDePerfisTime {
  listarTodos(): Promise<PerfisDeTimes>;
  obter(timeId: string): Promise<PerfilDeTime>;
  definir(timeId: string, tipoNo: string, valores: Record<string, string>): Promise<Record<string, string>>;
}

export function criarCasosDeUsoDePerfisTime(repo: RepositorioDePerfisTime): CasosDeUsoDePerfisTime {
  return {
    listarTodos: () => repo.listarTodos(),
    obter: (timeId) => repo.obter(timeId),
    definir: (timeId, tipoNo, valores) => repo.definir(timeId, tipoNo, valores),
  };
}
