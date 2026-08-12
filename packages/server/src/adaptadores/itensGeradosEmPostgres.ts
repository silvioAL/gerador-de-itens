import { asc, eq } from "drizzle-orm";
import type { DadosItemGerado, ItemGeradoSalvo, RepositorioDeItensGerados } from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { itensGerados } from "../db/schema.js";

/**
 * SPEC-41 Parte B — adaptador Postgres da porta de itens gerados. Substituir
 * é transacional: apagar + inserir na mesma transação, preservando
 * `estado`/`linkExterno` de quem já foi exportado (a mesma `chave` religa o
 * rastro externo ao material regenerado).
 */
type LinhaItem = typeof itensGerados.$inferSelect;

function comoItemSalvo(linha: LinhaItem): ItemGeradoSalvo {
  return {
    id: linha.id,
    quebraId: linha.quebraId,
    chave: linha.chave,
    titulo: linha.titulo,
    tipo: linha.tipo,
    tamanho: linha.tamanho,
    dependencias: (linha.dependencias ?? []) as string[],
    corpoMarkdown: linha.corpoMarkdown,
    pendencias: linha.pendencias,
    sugestoes: linha.sugestoes,
    estado: linha.estado as ItemGeradoSalvo["estado"],
    linkExterno: linha.linkExterno ?? null,
    criadoEm: linha.criadoEm.toISOString(),
  };
}

export function criarRepositorioDeItensGeradosEmPostgres(db: BancoDeDados): RepositorioDeItensGerados {
  return {
    async listarDaQuebra(quebraId: string): Promise<ItemGeradoSalvo[]> {
      if (!/^[0-9a-f-]{36}$/i.test(quebraId)) return [];
      const linhas = await db
        .select()
        .from(itensGerados)
        .where(eq(itensGerados.quebraId, quebraId))
        .orderBy(asc(itensGerados.ordem));
      return linhas.map(comoItemSalvo);
    },

    async substituirDaQuebra(quebraId: string, itens: DadosItemGerado[]): Promise<ItemGeradoSalvo[]> {
      return db.transaction(async (tx) => {
        const anteriores = await tx.select().from(itensGerados).where(eq(itensGerados.quebraId, quebraId));
        const exportadosPorChave = new Map(
          anteriores.filter((a) => a.estado === "exportado").map((a) => [a.chave, a])
        );

        await tx.delete(itensGerados).where(eq(itensGerados.quebraId, quebraId));
        if (itens.length === 0) return [];

        const inseridos = await tx
          .insert(itensGerados)
          .values(
            itens.map((item, ordem) => {
              const exportado = exportadosPorChave.get(item.chave);
              return {
                quebraId,
                ordem,
                chave: item.chave,
                titulo: item.titulo,
                tipo: item.tipo,
                tamanho: item.tamanho,
                dependencias: item.dependencias,
                corpoMarkdown: item.corpoMarkdown,
                pendencias: item.pendencias,
                sugestoes: item.sugestoes,
                estado: exportado ? "exportado" : "gerado",
                linkExterno: exportado?.linkExterno ?? null,
              };
            })
          )
          .returning();
        return inseridos.sort((a, b) => a.ordem - b.ordem).map(comoItemSalvo);
      });
    },
  };
}
