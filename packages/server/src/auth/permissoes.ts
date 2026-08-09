import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { OpcoesApp } from "../app.js";
import { papeisAcesso, papelPermissao, usuarioPapel } from "../db/schema.js";
import { exigirSessao } from "./middleware.js";

/**
 * SPEC-28 Fase 1 — quem pode editar o quê.
 *
 * Três eixos: **recurso** (a área de configuração) × **ação** × **escopo**
 * (organização inteira ou um time). O terceiro é o que faz o mesmo papel
 * "Agilidade" valer na empresa inteira numa instalação e só num time noutra —
 * sem código diferente, que era o pedido original.
 */

/**
 * Lista FECHADA. Recurso fora daqui é rejeitado na criação do papel, e o
 * motivo é duro: permissão sobre recurso que nenhuma rota checa é permissão
 * que falha ABERTA e em silêncio — o pior modo de falha possível numa camada
 * de autorização. Com enum, um recurso novo obriga a decidir a permissão dele
 * no mesmo commit em que nasce.
 *
 * `regras` aparece quebrado em quatro de propósito (SPEC-28 §4.2): o pedido
 * era Agilidade no checklist de PROCESSO e Arquitetura no TÉCNICO. Um recurso
 * `regras` único não conseguiria expressar isso.
 */
export const RECURSOS = [
  "perfis-time",
  "campos-no",
  "campos-aresta",
  "regras.checklistTecnico",
  "regras.checklistProcesso",
  "regras.testes",
  "regras.volumetria",
  "especificacao-template",
  "prompt-unico-template",
  "pipeline-agentes",
  "modelo-ia",
  "credenciais-ia",
  "retrospectivas",
  "quebras",
  "membros",
  "acessos",
] as const;

export type Recurso = (typeof RECURSOS)[number];

/**
 * `aprovar` já existe no modelo, mas na Fase 1 nenhuma rota a exige: o fluxo
 * de proposta→aprovação é a Fase 3 (SPEC-28 §4.5). Guardar a permissão desde
 * já é barato; prometer aprovação e aplicar direto seria mentira.
 */
export const ACOES = ["ler", "editar", "aprovar"] as const;
export type Acao = (typeof ACOES)[number];

export function ehRecurso(valor: string): valor is Recurso {
  return (RECURSOS as readonly string[]).includes(valor);
}
export function ehAcao(valor: string): valor is Acao {
  return (ACOES as readonly string[]).includes(valor);
}

export interface PermissoesDoUsuario {
  /** `false` quando a organização ainda não criou papel nenhum — nesse caso
   * tudo é permitido (§4.3) e a UI não deve esconder nada. */
  rbacAtivo: boolean;
  /** `recurso` → ações permitidas, já unindo todos os papéis aplicáveis. */
  porRecurso: Partial<Record<Recurso, Acao[]>>;
}

/**
 * Resolve o que `email` pode fazer, opcionalmente no contexto de um time.
 *
 * Regras que valem a pena estarem juntas num lugar só:
 * - Organização sem papel nenhum → `rbacAtivo: false`, permite tudo (§4.3).
 * - Papel de escopo organizacional (`escopoTimeId` nulo) cobre QUALQUER time.
 * - Papel de escopo de time cobre só aquele time.
 * - `editar` **não** implica `ler`: as duas são concedidas explicitamente.
 *   "Pode editar mas não pode ver" é bug, e o jeito de garantir que ele não
 *   apareça é não deixar a implicação escondida no código (§6).
 */
export async function resolverPermissoes(
  db: OpcoesApp["db"],
  organizacaoId: string,
  email: string,
  timeId?: string | null
): Promise<PermissoesDoUsuario> {
  const papeisDaOrg = await db
    .select({ id: papeisAcesso.id })
    .from(papeisAcesso)
    .where(eq(papeisAcesso.organizacaoId, organizacaoId));

  if (papeisDaOrg.length === 0) return { rbacAtivo: false, porRecurso: {} };

  const idsDaOrg = papeisDaOrg.map((p) => p.id);
  const atribuicoes = await db
    .select({ papelId: usuarioPapel.papelId, escopoTimeId: usuarioPapel.escopoTimeId })
    .from(usuarioPapel)
    .where(
      and(
        eq(usuarioPapel.email, email),
        inArray(usuarioPapel.papelId, idsDaOrg),
        // Escopo organizacional vale sempre; escopo de time só pro time pedido.
        timeId ? or(isNull(usuarioPapel.escopoTimeId), eq(usuarioPapel.escopoTimeId, timeId)) : isNull(usuarioPapel.escopoTimeId)
      )
    );

  const porRecurso: Partial<Record<Recurso, Acao[]>> = {};
  if (atribuicoes.length === 0) return { rbacAtivo: true, porRecurso };

  const permissoes = await db
    .select({ recurso: papelPermissao.recurso, acao: papelPermissao.acao })
    .from(papelPermissao)
    .where(inArray(papelPermissao.papelId, [...new Set(atribuicoes.map((a) => a.papelId))]));

  for (const { recurso, acao } of permissoes) {
    if (!ehRecurso(recurso) || !ehAcao(acao)) continue;
    const atual = porRecurso[recurso] ?? [];
    if (!atual.includes(acao)) porRecurso[recurso] = [...atual, acao];
  }
  return { rbacAtivo: true, porRecurso };
}

/**
 * `preHandler` que exige sessão E a permissão pedida. Convive com
 * `exigirTime`: pertencer ao time continua necessário onde já era; a
 * permissão é a camada de cima, não a substituta.
 *
 * O 403 diz QUAL recurso e QUAL ação faltaram — erro de permissão que não diz
 * o que falta vira chamado de suporte, não correção.
 */
export function exigirPermissao(
  db: OpcoesApp["db"],
  organizacaoId: () => Promise<string | null>,
  recurso: Recurso,
  acao: Acao,
  resolverTimeId?: (req: FastifyRequest) => string | null | Promise<string | null>
) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await exigirSessao(req, reply);
    if (reply.sent) return;

    const orgId = await organizacaoId();
    // Sem organização (instalação recém-criada) não há papel possível: cai no
    // modo aberto em vez de travar tudo — mesma escolha do §4.3.
    if (!orgId) return;

    const timeId = resolverTimeId ? await resolverTimeId(req) : null;
    const { rbacAtivo, porRecurso } = await resolverPermissoes(db, orgId, req.usuario!.email, timeId);
    if (!rbacAtivo) return;

    if (!porRecurso[recurso]?.includes(acao)) {
      reply.code(403).send({
        erro: `sem permissão para "${acao}" em "${recurso}"${timeId ? ` no time "${timeId}"` : ""}`,
        recurso,
        acao,
      });
    }
  };
}
