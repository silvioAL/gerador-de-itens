import { asc, eq, inArray, sql } from "drizzle-orm";
import type { DadosDoProduto, Produto, RepositorioDeProdutos } from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { produtoGlossario, produtoTime, produtos } from "../db/schema.js";

/**
 * SPEC-53 Fase 1 — o adaptador Postgres do produto. Só guarda e devolve: quem
 * decide o que um time enxerga e como o contexto vira texto é o caso de uso.
 */
export function criarRepositorioDeProdutosEmPostgres(db: BancoDeDados): RepositorioDeProdutos {
  /** Glossário e times de vários produtos de uma vez — sem isso, listar N
   * produtos viraria 2N consultas. */
  async function acessorios(ids: string[]) {
    if (ids.length === 0) return { glossarioPorProduto: {}, timesPorProduto: {} };
    const [termos, vinculos] = await Promise.all([
      db.select().from(produtoGlossario).where(inArray(produtoGlossario.produtoId, ids)).orderBy(asc(produtoGlossario.ordem)),
      db.select().from(produtoTime).where(inArray(produtoTime.produtoId, ids)),
    ]);
    const glossarioPorProduto: Record<string, Produto["glossario"]> = {};
    for (const t of termos) {
      (glossarioPorProduto[t.produtoId] ??= []).push({
        id: t.id,
        termo: t.termo,
        definicao: t.definicao,
        ordem: t.ordem,
      });
    }
    const timesPorProduto: Record<string, string[]> = {};
    for (const v of vinculos) (timesPorProduto[v.produtoId] ??= []).push(v.timeId);
    return { glossarioPorProduto, timesPorProduto };
  }

  type LinhaProduto = typeof produtos.$inferSelect;

  function montar(
    linha: LinhaProduto,
    glossario: Produto["glossario"] = [],
    timeIds: string[] = []
  ): Produto {
    return {
      id: linha.id,
      organizacaoId: linha.organizacaoId,
      nome: linha.nome,
      objetivo: linha.objetivo,
      quemUsa: linha.quemUsa,
      regrasDeNegocio: linha.regrasDeNegocio,
      sistemas: linha.sistemas,
      restricoes: linha.restricoes,
      glossario,
      timeIds,
      criadoPor: linha.criadoPor,
      atualizadoEm: linha.atualizadoEm.toISOString(),
    };
  }

  async function comAcessorios(linha: LinhaProduto): Promise<Produto> {
    const { glossarioPorProduto, timesPorProduto } = await acessorios([linha.id]);
    return montar(linha, glossarioPorProduto[linha.id] ?? [], timesPorProduto[linha.id] ?? []);
  }

  return {
    async listar(organizacaoId) {
      const linhas = await db
        .select()
        .from(produtos)
        .where(eq(produtos.organizacaoId, organizacaoId))
        .orderBy(asc(produtos.nome));
      const { glossarioPorProduto, timesPorProduto } = await acessorios(linhas.map((l) => l.id));
      return linhas.map((l) => montar(l, glossarioPorProduto[l.id] ?? [], timesPorProduto[l.id] ?? []));
    },

    async obter(id) {
      const [linha] = await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
      return linha ? comAcessorios(linha) : null;
    },

    async criar(organizacaoId, nome, criadoPor) {
      const [linha] = await db.insert(produtos).values({ organizacaoId, nome, criadoPor }).returning();
      return montar(linha);
    },

    async atualizar(id, dados: Partial<DadosDoProduto>) {
      // Sem campo nenhum, um UPDATE vazio explodiria no drizzle — e "não mudar
      // nada" é pedido válido (a tela salva o formulário inteiro).
      const [linha] = Object.keys(dados).length
        ? await db
            .update(produtos)
            .set({ ...dados, atualizadoEm: sql`now()` })
            .where(eq(produtos.id, id))
            .returning()
        : await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
      return linha ? comAcessorios(linha) : null;
    },

    async excluir(id) {
      return (await db.delete(produtos).where(eq(produtos.id, id)).returning()).length > 0;
    },

    async definirTimes(id, timeIds) {
      const [linha] = await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
      if (!linha) return null;
      // Conjunto, não sequência: apaga e regrava. Diferença incremental aqui
      // seria mais código para o mesmo resultado, com a chance de divergir.
      await db.delete(produtoTime).where(eq(produtoTime.produtoId, id));
      if (timeIds.length > 0) {
        await db.insert(produtoTime).values(timeIds.map((timeId) => ({ produtoId: id, timeId })));
      }
      return comAcessorios(linha);
    },

    async salvarTermo(produtoId, termo, definicao) {
      // Upsert pela chave natural (produto, termo): salvar o mesmo termo duas
      // vezes é correção, não duplicata — e duas linhas do mesmo termo
      // tornariam o glossário ambíguo para quem lê e para o prompt.
      const [linha] = await db
        .insert(produtoGlossario)
        .values({ produtoId, termo, definicao })
        .onConflictDoUpdate({
          target: [produtoGlossario.produtoId, produtoGlossario.termo],
          set: { definicao },
        })
        .returning();
      return { id: linha.id, termo: linha.termo, definicao: linha.definicao, ordem: linha.ordem };
    },

    async excluirTermo(termoId) {
      return (await db.delete(produtoGlossario).where(eq(produtoGlossario.id, termoId)).returning()).length > 0;
    },
  };
}
