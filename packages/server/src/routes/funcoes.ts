import type { FastifyInstance } from "fastify";
import { FUNCOES_DO_SISTEMA } from "@gerador/aplicacao";

/**
 * SPEC-107 fatia A — **o catálogo de FUNÇÕES em vigor.**
 *
 * Como `GET /conectores`: leitura aberta (a função é vocabulário do
 * maquinário, não dado de ninguém) e resolvida no servidor — a paleta do
 * fluxo, o validador e o executor leem o MESMO registro (§263). O registro é
 * fechado e mora no código (`FUNCOES_DO_SISTEMA`); esta rota só o serve, com
 * o contrato e a governança como dado.
 */
export async function registrarRotasFuncoes(app: FastifyInstance) {
  app.get("/funcoes", async () => ({ funcoes: FUNCOES_DO_SISTEMA }));
}
