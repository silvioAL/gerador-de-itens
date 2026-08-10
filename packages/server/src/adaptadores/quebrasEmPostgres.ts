import { desc, eq } from "drizzle-orm";
import type {
  DadosQuebra,
  QuebraSalva,
  RepositorioDeQuebras,
  ResumoQuebra,
} from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { quebras } from "../db/schema.js";

/**
 * SPEC-31 Fase 1 — adaptador Postgres da porta de Quebras.
 *
 * Só traduz forma: `Date` do driver vira ISO-8601 (o formato que atravessa
 * HTTP e que o adaptador de arquivo já devolvia), `null` de coluna vira o
 * default do contrato. Nenhuma regra aqui — regra mora no engine, orquestração
 * no caso de uso.
 *
 * As três colunas de `respostas_itens`, `demand_info` e `anexos_contexto` são
 * da migração 0011: antes dela a tabela tinha seis colunas e a suíte de
 * contrato reprovava este adaptador — que é exatamente o que ela existe para
 * fazer.
 */
type LinhaQuebra = typeof quebras.$inferSelect;

function comoQuebraSalva(linha: LinhaQuebra): QuebraSalva {
  return {
    id: linha.id,
    titulo: linha.titulo ?? null,
    time: linha.time ?? null,
    diagrama: linha.diagrama as QuebraSalva["diagrama"],
    respostasItens: (linha.respostasItens ?? {}) as QuebraSalva["respostasItens"],
    demandInfo: linha.demandInfo ?? "",
    anexosContexto: (linha.anexosContexto ?? []) as string[],
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

export function criarRepositorioDeQuebrasEmPostgres(db: BancoDeDados): RepositorioDeQuebras {
  return {
    async listar(): Promise<ResumoQuebra[]> {
      const linhas = await db
        .select({
          id: quebras.id,
          titulo: quebras.titulo,
          time: quebras.time,
          criadoEm: quebras.criadoEm,
          atualizadoEm: quebras.atualizadoEm,
        })
        .from(quebras)
        .orderBy(desc(quebras.atualizadoEm));
      return linhas.map((l) => ({
        id: l.id,
        titulo: l.titulo ?? null,
        time: l.time ?? null,
        criadoEm: l.criadoEm.toISOString(),
        atualizadoEm: l.atualizadoEm.toISOString(),
      }));
    },

    async obter(id: string): Promise<QuebraSalva | null> {
      // Id fora do formato uuid faz o Postgres reclamar em vez de responder
      // "não achei" — e ausência é resposta, não exceção (contrato da porta).
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const [linha] = await db.select().from(quebras).where(eq(quebras.id, id));
      return linha ? comoQuebraSalva(linha) : null;
    },

    async criar(dados: DadosQuebra): Promise<QuebraSalva> {
      const [criada] = await db
        .insert(quebras)
        .values({
          titulo: dados.titulo,
          time: dados.time,
          diagrama: dados.diagrama,
          respostasItens: dados.respostasItens,
          demandInfo: dados.demandInfo,
          anexosContexto: dados.anexosContexto,
        })
        .returning();
      return comoQuebraSalva(criada);
    },

    async atualizar(id: string, dados: DadosQuebra): Promise<QuebraSalva | null> {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const [atualizada] = await db
        .update(quebras)
        .set({
          titulo: dados.titulo,
          time: dados.time,
          diagrama: dados.diagrama,
          respostasItens: dados.respostasItens,
          demandInfo: dados.demandInfo,
          anexosContexto: dados.anexosContexto,
          atualizadoEm: new Date(),
        })
        .where(eq(quebras.id, id))
        .returning();
      return atualizada ? comoQuebraSalva(atualizada) : null;
    },
  };
}
