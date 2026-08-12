import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { OpcoesApp } from "../app.js";
import { usuarioTime } from "../db/schema.js";
import { exigirSessao } from "./middleware.js";

/**
 * SPEC-38 Fase 1 — níveis de participação num time.
 *
 * A lista é FECHADA e ordenada (mesma disciplina de RECURSOS/ACOES da
 * SPEC-28): `visualizar` lê quebras; `operar` faz o dia a dia (criar quebra,
 * derivar, refinar); `owner` lida com as configurações, membros e níveis
 * (D2 do debate: administrar significa lidar com as configs).
 */
export const NIVEIS = ["visualizar", "operar", "owner"] as const;
export type Nivel = (typeof NIVEIS)[number];

const ORDEM: Record<Nivel, number> = { visualizar: 0, operar: 1, owner: 2 };

export function ehNivel(valor: string): valor is Nivel {
  return (NIVEIS as readonly string[]).includes(valor);
}

/** `a` cobre `minimo`? (`owner` cobre tudo; `null` — não é membro — não cobre nada.) */
export function nivelCobre(a: Nivel | null, minimo: Nivel): boolean {
  return a !== null && ORDEM[a] >= ORDEM[minimo];
}

/** O nível desta pessoa NESTE time — `null` quando não é membro. */
export async function nivelNoTime(
  db: OpcoesApp["db"],
  email: string,
  timeId: string
): Promise<Nivel | null> {
  const [linha] = await db
    .select({ nivel: usuarioTime.nivel })
    .from(usuarioTime)
    .where(and(eq(usuarioTime.email, email), eq(usuarioTime.timeId, timeId)))
    .limit(1);
  return linha && ehNivel(linha.nivel) ? linha.nivel : null;
}

/**
 * O maior nível entre TODOS os times da pessoa — o escopo de quem age sobre
 * um recurso sem dono de time (quebra sem `time`, configuração global).
 * Quem é `visualizar` em tudo não opera em lugar nenhum.
 */
export async function maiorNivel(db: OpcoesApp["db"], email: string): Promise<Nivel | null> {
  const linhas = await db
    .select({ nivel: usuarioTime.nivel })
    .from(usuarioTime)
    .where(eq(usuarioTime.email, email));
  let maior: Nivel | null = null;
  for (const { nivel } of linhas) {
    if (ehNivel(nivel) && (maior === null || ORDEM[nivel] > ORDEM[maior])) maior = nivel;
  }
  return maior;
}

/**
 * `preHandler` que exige sessão E nível mínimo. `resolverTimeId` devolvendo
 * `null` significa "recurso sem dono de time" — aí vale o MAIOR nível da
 * pessoa (diferente do `exigirTime`, onde null relaxa a checagem: nível é
 * sobre o que a pessoa PODE, não sobre onde o recurso mora).
 */
export function exigirNivel(
  db: OpcoesApp["db"],
  minimo: Nivel,
  resolverTimeId?: (req: FastifyRequest) => string | null | Promise<string | null>
) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await exigirSessao(req, reply);
    if (reply.sent) return;

    const email = req.usuario!.email;
    const timeId = resolverTimeId ? await resolverTimeId(req) : null;
    const nivel = timeId ? await nivelNoTime(db, email, timeId) : await maiorNivel(db, email);
    if (!nivelCobre(nivel, minimo)) {
      reply.code(403).send({
        erro: `esta ação exige nível "${minimo}"${timeId ? ` no time "${timeId}"` : ""} — seu nível é "${nivel ?? "nenhum"}"`,
        nivelExigido: minimo,
        nivelAtual: nivel,
      });
    }
  };
}
