import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { OpcoesApp } from "../app.js";
import type { ChaveConfig } from "@gerador/aplicacao";
import { organizacoes, papeisAcesso, papelPermissao, timePapel, usuarioPapel, usuarioTime } from "../db/schema.js";
import { exigirSessao } from "./middleware.js";
import { maiorNivel, nivelNoTime } from "./niveis.js";

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
  "perfis-stack",
  "campos-no",
  "campos-aresta",
  "regras.checklistTecnico",
  "regras.checklistProcesso",
  "regras.testes",
  "regras.volumetria",
  // SPEC-63 — a régua sobre a FORMA do desenho tem dono próprio: quem decide
  // que "toda fila tem consumidor" não é quem cuida do checklist de uma tech.
  "regras.topologia",
  /**
   * SPEC-102 fatia D — o VOCABULÁRIO DE CONEXÃO: qual tipo de aresta nasce ao
   * ligar dois componentes, e quais são aceitos.
   *
   * Recurso próprio e não `pipeline-agentes` (onde as outras chaves sem dono
   * caem hoje) porque quem decide que *"chamar o motor de regras não atravessa
   * a rede"* é arquitetura, não quem cuida da esteira de agentes. Era o dono
   * errado que faria a delegação mentir.
   */
  "conexoes",
  /**
   * SPEC-105 fatia A — o CATÁLOGO DE CONECTORES: que endereços a organização
   * sabe chamar, com entrada/saída declaradas.
   *
   * Recurso próprio pelo mesmo argumento de `conexoes`: quem decide "a empresa
   * fala com este gateway" é infraestrutura, não quem cuida da esteira. E é
   * catálogo — cadastrar conector é curadoria (§9.1), não trabalho do dia;
   * executar (nível `operar`) é outra coisa, e tem outro portão.
   */
  "conectores",
  "especificacao-template",
  // SPEC-53 — o contexto do produto tem dono próprio: quem responde pelo
  // vocabulário e pelas regras de negócio não é quem cuida de stack nem de
  // pipeline.
  "produtos",
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
 * §354 — **de quem é cada chave de configuração.** Mapa, não `if`.
 *
 * Isto nasceu como um ternário na rota (`chave === "conexoes" ? … : …`), e o
 * usuário apontou o defeito: a relação chave→dono **é dado**, e escondê-la num
 * ramo faz duas coisas ruins. A cada chave nova alguém precisa lembrar de
 * acrescentar o ramo — e esquecer é silencioso, porque cai no `else`, que
 * concede a permissão de outra área.
 *
 * `Record<ChaveConfig, …>` é exaustivo: chave nova **não compila** sem declarar
 * o dono. É a mesma disciplina de `RECURSOS` ser lista fechada.
 *
 * `regras` é `null` porque é a exceção real: as quatro seções dela viajam no
 * mesmo documento e o dono depende do que MUDOU (`secoesDeRegrasAlteradas`) —
 * não dá para saber antes de ler o corpo.
 *
 * `exportador` e `tokens` apontam para `pipeline-agentes` porque é onde elas
 * caíam pelo `else` — e isso está **errado**: nenhuma das duas é da esteira.
 * Preservado de propósito: trocar o recurso de uma chave já concedida tiraria
 * acesso de quem tem hoje. Fica declarado em vez de implícito, que é o que
 * permite corrigi-lo de propósito na SPEC-97.
 */
export const RECURSO_DA_CHAVE_DE_CONFIG = {
  regras: null,
  "pipeline-agentes": "pipeline-agentes",
  exportador: "pipeline-agentes",
  tokens: "pipeline-agentes",
  conexoes: "conexoes",
  conectores: "conectores",
} as const satisfies Record<ChaveConfig, Recurso | null>;

/**
 * Recursos que NENHUMA rota exige, **de propósito**.
 *
 * Existe porque a alternativa é pior. O comentário acima diz que permissão sem
 * rota "falha ABERTA e em silêncio" — e por várias versões foi exatamente o que
 * aconteceu com 14 dos 16 recursos, sem que nada apontasse. O teste-guarda em
 * `permissoes.cobertura.test.ts` agora exige que todo recurso esteja coberto ou
 * esteja aqui, com motivo escrito. A falha continua aberta, mas deixa de ser
 * silenciosa: passa a ser uma decisão assinada.
 *
 * - `quebras`: o motivo é o propósito da feature. O RBAC existe para **delegar
 *   a gestão de padrões** (campos, checklists, pipeline) a setores da empresa —
 *   não para racionar o trabalho do dia a dia. Exigir permissão aqui teria um
 *   efeito perverso: no instante em que a empresa criasse o primeiro papel para
 *   delegar checklist, todo mundo sem papel pararia de conseguir criar quebra.
 *   Quem quer isolar quebra já tem o escopo por time, que é o eixo certo para
 *   trabalho.
 * - `retrospectivas`: a ingestão foi construída (SPEC-34 Fase 2) e REMOVIDA a
 *   pedido do usuário na mesma semana — a seção de anotações não convenceu na
 *   prática. O recurso volta a esperar no enum; se a feature voltar, que seja
 *   por decisão nova, não por resto de código.
 * - `modelo-ia`: no modo hospedado a escolha do modelo viaja **junto com a
 *   credencial** (`PUT /ia/credencial`), que já é protegida por
 *   `credenciais-ia`. Não existe rota separada para gatear; deixar as duas
 *   permissões na mesma rota faria uma delas ser decorativa.
 */
export const RECURSOS_SEM_ROTA: readonly Recurso[] = ["quebras", "retrospectivas", "modelo-ia"];

/** Uma organização por instalação, hoje. Repetido em cada arquivo de rota antes
 * de virar isto. */
export function organizacaoPadraoDe(db: OpcoesApp["db"]): () => Promise<string | null> {
  return async () => {
    const [org] = await db.select({ id: organizacoes.id }).from(organizacoes).limit(1);
    return org?.id ?? null;
  };
}

/** As quatro seções de `regras` que viram recursos separados, e a chave de cada
 * uma dentro de `RegrasPorTech`. Ver `secoesDeRegrasAlteradas`. */
export const SECOES_DE_REGRAS = {
  checklistTecnico: "regras.checklistTecnico",
  checklistProcesso: "regras.checklistProcesso",
  testes: "regras.testes",
  volumetria: "regras.volumetria",
  topologia: "regras.topologia",
} as const satisfies Record<string, Recurso>;

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

  // SPEC-38 Fase 3 — papéis PORTADOS POR TIME: herdam os membros OWNER do
  // time portador, com escopo organizacional. É o que faz "o time de
  // arquitetura edita o pipeline" acompanhar a composição do time em vez de
  // dessincronizar em atribuições e-mail a e-mail.
  const herdados = await db
    .select({ papelId: timePapel.papelId })
    .from(timePapel)
    .innerJoin(
      usuarioTime,
      and(eq(usuarioTime.timeId, timePapel.timeId), eq(usuarioTime.email, email), eq(usuarioTime.nivel, "owner"))
    )
    .where(inArray(timePapel.papelId, idsDaOrg));

  const papelIds = [...new Set([...atribuicoes.map((a) => a.papelId), ...herdados.map((h) => h.papelId)])];
  const porRecurso: Partial<Record<Recurso, Acao[]>> = {};
  if (papelIds.length === 0) return { rbacAtivo: true, porRecurso };

  const permissoes = await db
    .select({ recurso: papelPermissao.recurso, acao: papelPermissao.acao })
    .from(papelPermissao)
    .where(inArray(papelPermissao.papelId, papelIds));

  for (const { recurso, acao } of permissoes) {
    if (!ehRecurso(recurso) || !ehAcao(acao)) continue;
    const atual = porRecurso[recurso] ?? [];
    if (!atual.includes(acao)) porRecurso[recurso] = [...atual, acao];
  }
  return { rbacAtivo: true, porRecurso };
}

/** Comparação estável: `JSON.stringify` depende da ordem das chaves, e o mesmo
 * conteúdo devolvido pela UI com as chaves noutra ordem viraria "mudou" — um
 * 403 em cima de uma edição que não aconteceu. */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const chaves = Object.keys(valor as Record<string, unknown>).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonico((valor as Record<string, unknown>)[k])}`).join(",")}}`;
}

function porTechDe(documento: unknown): Record<string, Record<string, unknown>> {
  const porTech = (documento as { porTech?: unknown } | null | undefined)?.porTech;
  if (!porTech || typeof porTech !== "object") return {};
  return porTech as Record<string, Record<string, unknown>>;
}

/**
 * Quais dos quatro recursos `regras.*` uma edição de `regras` toca.
 *
 * Isto existe por um descompasso que só aparece quando a delegação é o
 * objetivo: a SPEC-28 §4.2 quebrou `regras` em quatro recursos porque o pedido
 * era Agilidade no checklist de PROCESSO e Arquitetura no TÉCNICO — mas a
 * persistência é **um documento só**, salvo inteiro por `PUT /config/regras`.
 * Um `preHandler` não alcança isso: ele decide antes de olhar o corpo, e o
 * corpo traz as quatro seções juntas, mudadas ou não.
 *
 * Então a permissão é conferida por **diferença**: compara-se o que veio com o
 * que está gravado, e só as seções que de fato mudaram exigem permissão. Quem
 * só pode mexer em processo continua podendo mandar o documento inteiro de
 * volta — desde que as outras três seções voltem iguais.
 *
 * `tipos`/`tamanhos` são a taxonomia compartilhada, não pertencem a nenhuma das
 * quatro; mudá-las exige as quatro permissões, porque afeta todas.
 */
export function secoesDeRegrasAlteradas(antes: unknown, depois: unknown): Recurso[] {
  const alteradas = new Set<Recurso>();
  const a = porTechDe(antes);
  const d = porTechDe(depois);

  for (const tech of new Set([...Object.keys(a), ...Object.keys(d)])) {
    for (const [chave, recurso] of Object.entries(SECOES_DE_REGRAS)) {
      if (canonico(a[tech]?.[chave]) !== canonico(d[tech]?.[chave])) alteradas.add(recurso);
    }
  }

  // SPEC-63 — 	opologia mora no TOPO do documento, não dentro de porTech:
  // uma regra de forma atravessa techs por definição. Por isso ela não entra no
  // laço acima, e sim aqui.
  const forma = (doc: unknown) => canonico((doc as { topologia?: unknown } | null | undefined)?.topologia ?? null);
  if (forma(antes) !== forma(depois)) alteradas.add("regras.topologia");

  const taxonomia = (doc: unknown) => {
    const d = doc as { tipos?: unknown; tamanhos?: unknown } | null | undefined;
    return canonico([d?.tipos ?? null, d?.tamanhos ?? null]);
  };
  if (taxonomia(antes) !== taxonomia(depois)) {
    for (const recurso of Object.values(SECOES_DE_REGRAS)) alteradas.add(recurso);
  }

  return [...alteradas];
}

/**
 * A checagem sem o `preHandler`, para quem precisa decidir depois de ler o
 * corpo (ver `secoesDeRegrasAlteradas`). Devolve o primeiro recurso negado, ou
 * `undefined` se está tudo liberado.
 *
 * SPEC-38 (D3) — mesmos dois eixos do `exigirPermissao` na escrita: owner do
 * escopo sempre pode; quem não é owner precisa de grant RBAC explícito. Todos
 * os chamadores são de escrita ("editar"), então o eixo de nível vale aqui
 * sem exceção de `ler`.
 */
export async function primeiroRecursoNegado(
  db: OpcoesApp["db"],
  organizacaoId: string | null,
  email: string,
  recursos: Recurso[],
  acao: Acao,
  timeId?: string | null
): Promise<Recurso | undefined> {
  if (!organizacaoId || recursos.length === 0) return undefined;
  const nivel = timeId ? await nivelNoTime(db, email, timeId) : await maiorNivel(db, email);
  if (nivel === "owner") return undefined;
  const { rbacAtivo, porRecurso } = await resolverPermissoes(db, organizacaoId, email, timeId);
  if (!rbacAtivo) return recursos[0];
  return recursos.find((recurso) => !porRecurso[recurso]?.includes(acao));
}

/**
 * Os recursos cuja CURADORIA está ligada nesta organização — isto é, aqueles
 * que ALGUM papel carrega. É a condição exata que `exigirEdicaoCurada` testa,
 * extraída para poder ser contada à tela.
 *
 * Existe por causa de um defeito real (§220): o `pode()` da web reimplementava
 * a autorização só pelo eixo RBAC e ignorava o eixo de nível, então um **owner
 * sem grant nenhum via cadeado em tudo** no instante em que a organização
 * ganhava o primeiro papel — enquanto o servidor aceitava a escrita (owner
 * bypass). Para a tela espelhar a regra inteira ela precisa saber os dois
 * eixos, e este é o pedaço que ela não tinha como deduzir: `porRecurso` diz o
 * que EU tenho, nunca se OUTRO papel carrega o recurso.
 */
export async function recursosCurados(
  db: OpcoesApp["db"],
  organizacaoId: string
): Promise<Recurso[]> {
  const linhas = await db
    .select({ recurso: papelPermissao.recurso })
    .from(papelPermissao)
    .innerJoin(papeisAcesso, eq(papelPermissao.papelId, papeisAcesso.id))
    .where(eq(papeisAcesso.organizacaoId, organizacaoId));
  return [...new Set(linhas.map((l) => l.recurso as Recurso))];
}

/**
 * SPEC-38 Fase 2 (D1) — o gate de CURADORIA, a exceção deliberada ao
 * owner-bypass do `exigirPermissao`:
 *
 * - Nenhum papel da organização tem o recurso → catálogo ABERTO: qualquer
 *   owner de time edita ("o owner do time pode criar").
 * - Existe papel com o recurso → curadoria LIGADA: só o grant explícito
 *   edita — inclusive por cima de owners ("o admin define se haverá
 *   curadoria e por qual papel"). É diferente do exigirPermissao de
 *   propósito: lá o owner sempre pode; aqui a curadoria manda.
 */
export function exigirEdicaoCurada(
  db: OpcoesApp["db"],
  organizacaoId: () => Promise<string | null>,
  recurso: Recurso,
  resolverTimeId?: (req: FastifyRequest) => string | null | Promise<string | null>
) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await exigirSessao(req, reply);
    if (reply.sent) return;

    const orgId = await organizacaoId();
    if (!orgId) return;

    const email = req.usuario!.email;
    const timeId = resolverTimeId ? await resolverTimeId(req) : null;

    const [papelCurador] = await db
      .select({ papelId: papelPermissao.papelId })
      .from(papelPermissao)
      .innerJoin(papeisAcesso, eq(papelPermissao.papelId, papeisAcesso.id))
      .where(and(eq(papeisAcesso.organizacaoId, orgId), eq(papelPermissao.recurso, recurso)))
      .limit(1);

    if (papelCurador) {
      const { porRecurso } = await resolverPermissoes(db, orgId, email, timeId);
      if (porRecurso[recurso]?.includes("editar")) return;
      reply.code(403).send({
        erro: `a curadoria de "${recurso}" está ligada — a edição é de quem tem o papel curador`,
        recurso,
        acao: "editar",
      });
      return;
    }

    const nivel = timeId ? await nivelNoTime(db, email, timeId) : await maiorNivel(db, email);
    if (nivel !== "owner") {
      reply.code(403).send({
        erro: `"editar" em "${recurso}" exige nível owner (catálogo aberto) ou o papel curador`,
        recurso,
        acao: "editar",
      });
    }
  };
}

/**
 * `preHandler` que exige sessão E a permissão pedida. Convive com
 * `exigirTime`: pertencer ao time continua necessário onde já era; a
 * permissão é a camada de cima, não a substituta.
 *
 * SPEC-38 Fase 1 (D3) — para ações de ESCRITA, dois eixos:
 * - **nível**: `owner` no time-alvo (ou, em recurso sem dono de time, owner
 *   de algum time) sempre pode — configuração é ato de owner;
 * - **delegação**: quem não é owner precisa de permissão RBAC EXPLÍCITA no
 *   recurso — é a "permissão dada por owner" da D3.
 * A falha-aberta da SPEC-28 §4.3 (organização sem papel nenhum) continua
 * valendo só para o eixo RBAC; o eixo de nível é sempre exigido na escrita.
 * `ler` fica como era: só o eixo RBAC, aberto quando não configurado.
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

    const email = req.usuario!.email;
    const timeId = resolverTimeId ? await resolverTimeId(req) : null;

    if (acao !== "ler") {
      const nivel = timeId ? await nivelNoTime(db, email, timeId) : await maiorNivel(db, email);
      if (nivel === "owner") return;

      const { rbacAtivo, porRecurso } = await resolverPermissoes(db, orgId, email, timeId);
      if (rbacAtivo && porRecurso[recurso]?.includes(acao)) return;
      reply.code(403).send({
        erro: `"${acao}" em "${recurso}"${timeId ? ` no time "${timeId}"` : ""} exige nível owner ou permissão delegada`,
        recurso,
        acao,
      });
      return;
    }

    const { rbacAtivo, porRecurso } = await resolverPermissoes(db, orgId, email, timeId);
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
