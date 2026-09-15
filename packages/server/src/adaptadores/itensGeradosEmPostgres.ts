import { and, asc, eq, inArray } from "drizzle-orm";
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
    specAnexada: linha.specAnexada,
    specEnviadaEm: linha.specEnviadaEm?.toISOString() ?? null,
    specErro: linha.specErro ?? null,
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

    async marcarExportado(quebraId, chave, linkExterno) {
      const [linha] = await db
        .update(itensGerados)
        .set({ estado: "exportado", linkExterno })
        .where(and(eq(itensGerados.quebraId, quebraId), eq(itensGerados.chave, chave)))
        .returning();
      return linha ? comoItemSalvo(linha) : null;
    },

    async marcarSpecAnexada(quebraId, chave) {
      const [linha] = await db
        .update(itensGerados)
        // SPEC-115 — chegou: sai do "indo" e perde a cicatriz da tentativa
        // anterior. Deixar `specEnviadaEm` preenchido faria a tela mostrar o
        // item anexado E anexando ao mesmo tempo.
        .set({ specAnexada: true, specEnviadaEm: null, specErro: null })
        .where(and(eq(itensGerados.quebraId, quebraId), eq(itensGerados.chave, chave)))
        .returning();
      return linha ? comoItemSalvo(linha) : null;
    },

    async marcarSpecEnviando(quebraId, chaves) {
      if (chaves.length === 0) return;
      await db
        .update(itensGerados)
        .set({ specEnviadaEm: new Date(), specErro: null })
        .where(and(eq(itensGerados.quebraId, quebraId), inArray(itensGerados.chave, chaves)));
    },

    async marcarFalhaDeSpec(quebraId, chave, erro) {
      const [linha] = await db
        .update(itensGerados)
        .set({ specEnviadaEm: null, specErro: erro })
        .where(and(eq(itensGerados.quebraId, quebraId), eq(itensGerados.chave, chave)))
        .returning();
      return linha ? comoItemSalvo(linha) : null;
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
                specAnexada: exportado?.specAnexada ?? false,
                // SPEC-115 — o envio em curso viaja junto pela mesma `chave`
                // que já religa o rastro externo. Perdê-lo aqui faria uma
                // regeneração no meio de um envio apagar o "indo" e a tela
                // voltaria a dizer "na fila" para algo que está a caminho.
                specEnviadaEm: exportado?.specEnviadaEm ?? null,
                specErro: exportado?.specErro ?? null,
              };
            })
          )
          .returning();
        return inseridos.sort((a, b) => a.ordem - b.ordem).map(comoItemSalvo);
      });
    },
  };
}
