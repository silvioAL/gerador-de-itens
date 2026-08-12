import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type {
  PerfilDeTime,
  PerfilStack,
  PerfisDeTimes,
  RepositorioDePerfisStack,
} from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { perfilStackValores, perfisStack, times } from "../db/schema.js";

/**
 * SPEC-38 Fase 2 — o adaptador Postgres de perfis de stack. A projeção
 * `PerfisDeTimes` que a web sempre consumiu agora é DERIVADA: cada time com
 * ponteiro projeta os valores do perfil apontado. Trocar o ponteiro troca a
 * projeção inteira do time — é o "trocar de tecnologia é trocar o ponteiro".
 */
export function criarRepositorioDePerfisStackEmPostgres(db: BancoDeDados): RepositorioDePerfisStack {
  function aninhar(linhas: { tipoNo: string; campo: string; valor: string }[]): PerfilDeTime {
    const perfil: PerfilDeTime = {};
    for (const { tipoNo, campo, valor } of linhas) {
      (perfil[tipoNo] ??= {})[campo] = valor;
    }
    return perfil;
  }

  async function valoresDe(perfilIds: string[]): Promise<Record<string, PerfilDeTime>> {
    if (perfilIds.length === 0) return {};
    const linhas = await db
      .select()
      .from(perfilStackValores)
      .where(inArray(perfilStackValores.perfilId, perfilIds));
    const porPerfil: Record<string, PerfilDeTime> = {};
    for (const l of linhas) {
      ((porPerfil[l.perfilId] ??= {})[l.tipoNo] ??= {})[l.campo] = l.valor;
    }
    return porPerfil;
  }

  async function apontadoPor(timeId: string): Promise<string | null> {
    const [time] = await db
      .select({ perfilStackId: times.perfilStackId })
      .from(times)
      .where(eq(times.id, timeId))
      .limit(1);
    return time?.perfilStackId ?? null;
  }

  return {
    async projecaoPorTime() {
      const comPonteiro = await db
        .select({ timeId: times.id, perfilId: times.perfilStackId })
        .from(times)
        .where(isNotNull(times.perfilStackId));
      const porPerfil = await valoresDe([...new Set(comPonteiro.map((t) => t.perfilId!))]);
      const projecao: PerfisDeTimes = {};
      for (const { timeId, perfilId } of comPonteiro) {
        const valores = porPerfil[perfilId!];
        if (valores && Object.keys(valores).length > 0) projecao[timeId] = valores;
      }
      return projecao;
    },

    async perfilDoTime(timeId) {
      const perfilId = await apontadoPor(timeId);
      if (!perfilId) return {};
      const linhas = await db
        .select()
        .from(perfilStackValores)
        .where(eq(perfilStackValores.perfilId, perfilId));
      return aninhar(linhas);
    },

    async catalogo() {
      const perfis = await db.select().from(perfisStack);
      const porPerfil = await valoresDe(perfis.map((p) => p.id));
      return perfis.map<PerfilStack>((p) => ({
        id: p.id,
        nome: p.nome,
        criadoPor: p.criadoPor,
        valores: porPerfil[p.id] ?? {},
      }));
    },

    async ponteiros() {
      const comPonteiro = await db
        .select({ timeId: times.id, perfilId: times.perfilStackId })
        .from(times)
        .where(isNotNull(times.perfilStackId));
      return Object.fromEntries(comPonteiro.map((t) => [t.timeId, t.perfilId!]));
    },

    async criar(organizacaoId, nome, criadoPor) {
      const [perfil] = await db
        .insert(perfisStack)
        .values({ organizacaoId, nome, criadoPor })
        .returning();
      return { id: perfil.id, nome: perfil.nome, criadoPor: perfil.criadoPor, valores: {} };
    },

    async definirValores(perfilId, tipoNo, valores) {
      for (const [campo, valor] of Object.entries(valores)) {
        await db
          .insert(perfilStackValores)
          .values({ perfilId, tipoNo, campo, valor })
          .onConflictDoUpdate({
            target: [perfilStackValores.perfilId, perfilStackValores.tipoNo, perfilStackValores.campo],
            set: { valor, atualizadoEm: sql`now()` },
          });
      }
      const linhas = await db
        .select()
        .from(perfilStackValores)
        .where(and(eq(perfilStackValores.perfilId, perfilId), eq(perfilStackValores.tipoNo, tipoNo)));
      return Object.fromEntries(linhas.map((l) => [l.campo, l.valor]));
    },

    async apontar(timeId, perfilId) {
      await db.update(times).set({ perfilStackId: perfilId }).where(eq(times.id, timeId));
    },

    async capturar(organizacaoId, timeId, tipoNo, valores, criadoPor) {
      let perfilId = await apontadoPor(timeId);
      if (!perfilId) {
        // O botão do painel continua um clique só: sem ponteiro, nasce um
        // perfil com o nome do time e o ponteiro junto.
        const [perfil] = await db
          .insert(perfisStack)
          .values({ organizacaoId, nome: `stack de ${timeId}`, criadoPor })
          .returning();
        perfilId = perfil.id;
        await db.update(times).set({ perfilStackId: perfilId }).where(eq(times.id, timeId));
      }
      return this.definirValores(perfilId, tipoNo, valores);
    },
  };
}
