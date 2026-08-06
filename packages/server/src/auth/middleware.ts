import type { FastifyReply, FastifyRequest } from "fastify";
import { COOKIE_SESSAO, verificarSessao, type ClaimsSessao } from "./sessao.js";

declare module "fastify" {
  interface FastifyRequest {
    usuario?: ClaimsSessao;
  }
}

/** `preHandler` que exige qualquer sessão válida (não checa time nenhum). */
export async function exigirSessao(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies?.[COOKIE_SESSAO];
  const claims = token ? await verificarSessao(token) : null;
  if (!claims) {
    reply.code(401).send({ erro: "sessão inválida ou ausente" });
    return;
  }
  req.usuario = claims;
}

/**
 * `preHandler` que exige sessão válida E que o time do recurso esteja entre os
 * `timeIds` da sessão. `resolverTimeId` devolve `null` quando o recurso não tem
 * dono de time (ex.: referência global, campo `__global__`) — nesse caso só a
 * sessão é exigida, sem checar time nenhum (mesma régua para todo mundo logado).
 */
export function exigirTime(
  resolverTimeId: (req: FastifyRequest) => string | null | Promise<string | null>
) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await exigirSessao(req, reply);
    if (reply.sent) return;

    const timeId = await resolverTimeId(req);
    if (timeId !== null && !req.usuario!.timeIds.includes(timeId)) {
      reply.code(403).send({ erro: `sessão não pertence ao time "${timeId}"` });
    }
  };
}
