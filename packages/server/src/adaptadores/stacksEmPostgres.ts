import { and, eq, inArray, sql } from "drizzle-orm";
import type { RepositorioDeStacks, Stack } from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { stackValores, stacks } from "../db/schema.js";

/** SPEC-43 — o adaptador Postgres do catálogo global de stacks. Só guarda e
 * devolve; agregação de sugestões e nome derivado são do caso de uso. */
export function criarRepositorioDeStacksEmPostgres(db: BancoDeDados): RepositorioDeStacks {
  async function valoresDe(stackIds: string[]): Promise<Record<string, Record<string, string>>> {
    if (stackIds.length === 0) return {};
    const linhas = await db.select().from(stackValores).where(inArray(stackValores.stackId, stackIds));
    const porStack: Record<string, Record<string, string>> = {};
    for (const l of linhas) {
      (porStack[l.stackId] ??= {})[l.campo] = l.valor;
    }
    return porStack;
  }

  return {
    async catalogo() {
      const linhas = await db.select().from(stacks);
      const porStack = await valoresDe(linhas.map((s) => s.id));
      return linhas.map<Stack>((s) => ({
        id: s.id,
        tipoNo: s.tipoNo,
        nome: s.nome,
        criadoPor: s.criadoPor,
        valores: porStack[s.id] ?? {},
      }));
    },

    async criar(organizacaoId, tipoNo, nome, criadoPor) {
      const [stack] = await db.insert(stacks).values({ organizacaoId, tipoNo, nome, criadoPor }).returning();
      return { id: stack.id, tipoNo: stack.tipoNo, nome: stack.nome, criadoPor: stack.criadoPor, valores: {} };
    },

    async definirValores(stackId, valores) {
      for (const [campo, valor] of Object.entries(valores)) {
        await db
          .insert(stackValores)
          .values({ stackId, campo, valor })
          .onConflictDoUpdate({
            target: [stackValores.stackId, stackValores.campo],
            set: { valor, atualizadoEm: sql`now()` },
          });
      }
      const linhas = await db.select().from(stackValores).where(and(eq(stackValores.stackId, stackId)));
      return Object.fromEntries(linhas.map((l) => [l.campo, l.valor]));
    },
  };
}
