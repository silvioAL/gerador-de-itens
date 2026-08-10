import { and, eq } from "drizzle-orm";
import {
  resumirCredencialIa,
  type CredencialIa,
  type RepositorioDeCredenciais,
} from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { credenciaisIa } from "../db/schema.js";

/**
 * SPEC-31 Fase 4 — adaptador Postgres da porta de Credenciais, escopado por
 * organização. A `organizacaoId` entra na construção, não em cada chamada: o
 * repositório de uma organização não deve nem conseguir formular a pergunta
 * "qual a chave da outra".
 */
export function criarRepositorioDeCredenciaisEmPostgres(
  db: BancoDeDados,
  organizacaoId: string
): RepositorioDeCredenciais {
  async function buscar(provedorId: string): Promise<CredencialIa | null> {
    const [linha] = await db
      .select()
      .from(credenciaisIa)
      .where(and(eq(credenciaisIa.organizacaoId, organizacaoId), eq(credenciaisIa.provedorId, provedorId)));
    if (!linha) return null;
    return {
      baseUrl: linha.baseUrl ?? undefined,
      chave: linha.chave ?? undefined,
      modelo: linha.modelo ?? undefined,
      cabecalhos: linha.cabecalhos ?? undefined,
      formatoJson: linha.formatoJson ?? undefined,
      // SPEC-30: sem estes dois aqui, o valor era gravado e lido como
      // `undefined` — o botão de anexar imagem nunca aparecia, e só o teste de
      // NAVEGADOR pegou (a suíte de unidade passava inteira).
      baseUrlTranscricao: linha.baseUrlTranscricao ?? undefined,
      visao: linha.visao ?? undefined,
    };
  }

  return {
    obter: buscar,

    async salvar(provedorId, credencial) {
      const valores = {
        organizacaoId,
        provedorId,
        baseUrl: credencial.baseUrl ?? null,
        chave: credencial.chave ?? null,
        modelo: credencial.modelo ?? null,
        cabecalhos: credencial.cabecalhos ?? null,
        formatoJson: credencial.formatoJson ?? null,
        baseUrlTranscricao: credencial.baseUrlTranscricao ?? null,
        visao: credencial.visao ?? false,
      };
      await db
        .insert(credenciaisIa)
        .values(valores)
        .onConflictDoUpdate({
          target: [credenciaisIa.organizacaoId, credenciaisIa.provedorId],
          set: { ...valores, atualizadoEm: new Date() },
        });
    },

    async resumir(provedorId) {
      return resumirCredencialIa(await buscar(provedorId));
    },
  };
}
