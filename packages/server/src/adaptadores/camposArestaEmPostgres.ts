import { eq, or } from "drizzle-orm";
import {
  CAMPO_GLOBAL,
  type CampoAresta,
  type DadosCampoAresta,
  type RepositorioDeCamposAresta,
  type TipoCampoAresta,
} from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { camposAresta } from "../db/schema.js";

/**
 * #303 — adaptador Postgres da porta de Campos por tipo de conexão. O SQL que
 * morava dentro de `routes/camposAresta.ts` agora mora aqui, respondendo ao
 * contrato (`contratoDeCamposAresta.ts`) — mesma estrutura de camposNo.
 */
type LinhaCampoAresta = typeof camposAresta.$inferSelect;

function comoCampoAresta(linha: LinhaCampoAresta): CampoAresta {
  return {
    id: linha.id,
    timeId: linha.timeId,
    tipoAresta: linha.tipoAresta,
    key: linha.key,
    label: linha.label,
    type: linha.type as TipoCampoAresta,
    required: linha.required,
    valorPadrao: linha.valorPadrao ?? null,
    opcoes: linha.opcoes ?? null,
    ajuda: linha.ajuda ?? null,
    ordem: linha.ordem,
  };
}

/** Id fora do formato uuid faz o Postgres reclamar em vez de responder "não
 * achei" — e ausência é resposta, não exceção (contrato da porta). */
function pareceUuid(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export function criarRepositorioDeCamposArestaEmPostgres(db: BancoDeDados): RepositorioDeCamposAresta {
  return {
    async listar(timeId) {
      const linhas = timeId
        ? await db
            .select()
            .from(camposAresta)
            .where(or(eq(camposAresta.timeId, CAMPO_GLOBAL), eq(camposAresta.timeId, timeId)))
        : await db.select().from(camposAresta).where(eq(camposAresta.timeId, CAMPO_GLOBAL));
      return linhas.map(comoCampoAresta);
    },

    async obter(id) {
      if (!pareceUuid(id)) return null;
      const [linha] = await db.select().from(camposAresta).where(eq(camposAresta.id, id));
      return linha ? comoCampoAresta(linha) : null;
    },

    async salvar(dados: DadosCampoAresta) {
      const [salvo] = await db
        .insert(camposAresta)
        .values(dados)
        .onConflictDoUpdate({
          target: [camposAresta.timeId, camposAresta.tipoAresta, camposAresta.key],
          set: {
            label: dados.label,
            type: dados.type,
            required: dados.required,
            valorPadrao: dados.valorPadrao,
            opcoes: dados.opcoes,
            ajuda: dados.ajuda,
            ordem: dados.ordem,
            atualizadoEm: new Date(),
          },
        })
        .returning();
      return comoCampoAresta(salvo);
    },

    async atualizar(id, parcial) {
      if (!pareceUuid(id)) return null;
      const [atualizado] = await db
        .update(camposAresta)
        .set({ ...parcial, atualizadoEm: new Date() })
        .where(eq(camposAresta.id, id))
        .returning();
      return atualizado ? comoCampoAresta(atualizado) : null;
    },

    async excluir(id) {
      if (!pareceUuid(id)) return false;
      const [excluido] = await db.delete(camposAresta).where(eq(camposAresta.id, id)).returning();
      return Boolean(excluido);
    },
  };
}
