import { eq, or } from "drizzle-orm";
import {
  CAMPO_GLOBAL,
  type CampoNo,
  type DadosCampoNo,
  type ItemSpecCampo,
  type RepositorioDeCamposNo,
  type TipoCampoNo,
} from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { camposNo } from "../db/schema.js";

/**
 * SPEC-31 Fase 2 — adaptador Postgres da porta de Campos por tipo de nó.
 *
 * O `salvar` é `onConflictDoUpdate` na chave natural. A rota antiga fazia
 * `insert` puro contra uma tabela que tem `campos_no_chave_unica` em
 * (time_id, tipo_no, key): regravar o mesmo campo violava a restrição e virava
 * **HTTP 500**, sem mensagem que ajudasse ninguém. O modo local, no mesmo
 * gesto, tratava a regravação como correção. Verificado contra o banco real —
 * o segundo insert falha e a tabela fica com uma linha só.
 */
type LinhaCampoNo = typeof camposNo.$inferSelect;

function comoCampoNo(linha: LinhaCampoNo): CampoNo {
  return {
    id: linha.id,
    timeId: linha.timeId,
    tipoNo: linha.tipoNo,
    key: linha.key,
    label: linha.label,
    type: linha.type as TipoCampoNo,
    required: linha.required,
    valorPadrao: linha.valorPadrao ?? null,
    opcoes: linha.opcoes ?? null,
    ajuda: linha.ajuda ?? null,
    permiteNA: linha.permiteNA,
    ordem: linha.ordem,
    itemSpec: (linha.itemSpec ?? null) as ItemSpecCampo[] | null,
  };
}

/** Id fora do formato uuid faz o Postgres reclamar em vez de responder "não
 * achei" — e ausência é resposta, não exceção (contrato da porta). */
function pareceUuid(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export function criarRepositorioDeCamposNoEmPostgres(db: BancoDeDados): RepositorioDeCamposNo {
  return {
    async listar(timeId) {
      const linhas = timeId
        ? await db
            .select()
            .from(camposNo)
            .where(or(eq(camposNo.timeId, CAMPO_GLOBAL), eq(camposNo.timeId, timeId)))
        : await db.select().from(camposNo).where(eq(camposNo.timeId, CAMPO_GLOBAL));
      return linhas.map(comoCampoNo);
    },

    async obter(id) {
      if (!pareceUuid(id)) return null;
      const [linha] = await db.select().from(camposNo).where(eq(camposNo.id, id));
      return linha ? comoCampoNo(linha) : null;
    },

    async salvar(dados: DadosCampoNo) {
      const [salvo] = await db
        .insert(camposNo)
        .values(dados)
        .onConflictDoUpdate({
          target: [camposNo.timeId, camposNo.tipoNo, camposNo.key],
          set: {
            label: dados.label,
            type: dados.type,
            required: dados.required,
            valorPadrao: dados.valorPadrao,
            opcoes: dados.opcoes,
            ajuda: dados.ajuda,
            permiteNA: dados.permiteNA,
            ordem: dados.ordem,
            itemSpec: dados.itemSpec,
            atualizadoEm: new Date(),
          },
        })
        .returning();
      return comoCampoNo(salvo);
    },

    async atualizar(id, parcial) {
      if (!pareceUuid(id)) return null;
      const [atualizado] = await db
        .update(camposNo)
        .set({ ...parcial, atualizadoEm: new Date() })
        .where(eq(camposNo.id, id))
        .returning();
      return atualizado ? comoCampoNo(atualizado) : null;
    },

    async excluir(id) {
      if (!pareceUuid(id)) return false;
      const [excluido] = await db.delete(camposNo).where(eq(camposNo.id, id)).returning();
      return Boolean(excluido);
    },
  };
}
