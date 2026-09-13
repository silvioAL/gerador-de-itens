import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { exigirSessao, exigirTime } from "../auth/middleware.js";
import { exigirPermissao, organizacaoPadraoDe } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";
import { assinarSessao, COOKIE_SESSAO } from "../auth/sessao.js";
import { NIVEIS, nivelCobre, nivelNoTime, type Nivel } from "../auth/niveis.js";
import { convitesTime, organizacoes, times, usuarioTime } from "../db/schema.js";

const DURACAO_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

const corpoAdicionarMembro = z.object({ email: z.string().email(), nivel: z.enum(NIVEIS).default("operar") });
const corpoNivel = z.object({ nivel: z.enum(NIVEIS) });
const corpoConvite = z.object({ nivel: z.enum(NIVEIS).default("operar") });

/**
 * **O id do time DERIVA do nome — quem cria não precisa saber o formato.**
 *
 * Relato real: a pessoa digitou "Consignado Público" no campo que pedia "nome
 * do time" e levou um 400 mudo. A régua do servidor estava certa (o id vira
 * chave em URL, cookie de sessão e nome de documento de config), mas exigi-la
 * de quem digita um NOME é pedir conhecimento de implementação — e o exemplo no
 * placeholder ("time-pagamentos") mostrava um id fingindo ser nome.
 *
 * A derivação é a mesma que o canvas já usa para criar fluxo (§263): minúsculas,
 * acento fora, o que não é letra/número vira hífen.
 */
export function idDeTimeAPartirDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const corpoCriarTime = z.object({
  /**
   * O NOME que a pessoa escreveu. `timeId` continua aceito para quem já
   * mandava o id pronto (o E2E e quem automatiza) — os dois caminhos existem,
   * mas só um deles é o da tela.
   */
  nome: z.string().trim().min(1).max(80).optional(),
  /**
   * O caminho de COMPATIBILIDADE mantém a régua estrita — e essa linha nasceu
   * de um teste que já existia me acusando: ao aceitar `timeId` sem validar,
   * "Time Com Espaço E Maiúscula" viraria id de verdade no banco, quebrando
   * URL e chave de configuração. Derivar é para quem manda NOME; quem manda o
   * id pronto está afirmando que já o formatou, e precisa provar.
   */
  timeId: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "o endereço aceita letras minúsculas, números e hífen (ex.: time-pagamentos)")
    .optional(),
});

/**
 * Convite de time (SPEC-09 §3) e administração de membros (SPEC-09 §4/SPEC-38).
 * A régua antiga ("qualquer membro administra") morreu na SPEC-38 Fase 1:
 * adicionar/remover/mudar nível é ato de OWNER (ou de quem recebeu a permissão
 * "membros" — o `exigirPermissao` já embute os dois eixos). Convidar continua
 * aberto a qualquer membro, mas com TETO: ninguém convida acima do próprio nível.
 */
export async function registrarRotasTimes(app: FastifyInstance, { db }: OpcoesApp) {
  /** SPEC-28 Fase 1b + SPEC-38: owner do time OU permissão delegada em "membros".
   * Camada de cima de `exigirTime`: continuar sendo do time segue necessário.
   *
   * O `GET` de membros fica aberto de propósito — mesma régua de campos-no e
   * perfis-time, onde só a escrita é restrita. */
  const podeAdministrarMembros = (resolverTimeId: Parameters<typeof exigirPermissao>[4]) =>
    exigirPermissao(db, organizacaoPadraoDe(db), "membros", "editar", resolverTimeId);

  /** Rebaixar/remover o último owner deixaria o time sem quem o administre —
   * checado ANTES de qualquer escrita que possa tirar um owner de cena. */
  async function ehUltimoOwner(timeId: string, email: string): Promise<boolean> {
    const owners = await db
      .select({ email: usuarioTime.email })
      .from(usuarioTime)
      .where(and(eq(usuarioTime.timeId, timeId), eq(usuarioTime.nivel, "owner")));
    return owners.length === 1 && owners[0].email === email;
  }

  // Correção pós-uso do SPEC-09 §3.3 — a versão original só permitia entrar
  // num time por convite, sempre exigindo que alguém já estivesse lá antes
  // (bootstrap era sempre uma linha manual em `usuario_time`, achado real: a
  // primeira sessão logada via Google de verdade caiu exatamente nesse
  // buraco). Qualquer sessão pode criar um time novo, dentro da organização
  // única deste deploy (SPEC-13) — só não pode reaproveitar um nome que já
  // existe (aí sim precisa de convite de quem já é membro), preservando a
  // mesma barreira de namespace que já existia.
  app.post("/times", { preHandler: exigirSessao }, async (req, reply) => {
    const corpo = corpoCriarTime.safeParse(req.body);
    // A recusa é uma FRASE, não um dump do validador: o cliente não tem como
    // mostrar um `flatten()` a quem está usando o app, e caía num genérico
    // ("Não foi possível completar a operação") que não ajuda ninguém.
    if (!corpo.success) {
      // A frase do validador quando houver (o `timeId` mal formatado tem uma);
      // senão, a genérica sobre o nome. Nunca o `flatten()` cru: o cliente não
      // tem como mostrá-lo, e caía no "Não foi possível completar a operação".
      const doValidador = corpo.error.issues.find((i) => i.message && !i.message.startsWith("Invalid"))?.message;
      return reply.code(400).send({ erro: doValidador ?? "informe o nome do time (de 1 a 80 caracteres)" });
    }

    const nomeDigitado = corpo.data.nome?.trim() ?? corpo.data.timeId?.trim() ?? "";
    if (!nomeDigitado) return reply.code(400).send({ erro: "informe o nome do time" });
    const timeId = corpo.data.timeId?.trim() || idDeTimeAPartirDoNome(nomeDigitado);
    /**
     * Um nome que não sobra NADA depois da derivação ("###", "🙂") precisa de
     * recusa própria: sem ela o id viria vazio e o erro apareceria lá adiante,
     * como violação de chave, longe da causa.
     */
    if (timeId.length < 3) {
      return reply
        .code(400)
        .send({ erro: `"${nomeDigitado}" não vira um endereço válido — use ao menos três letras ou números` });
    }
    const existente = await db.select().from(times).where(eq(times.id, timeId)).limit(1);
    if (existente.length > 0) {
      /**
       * A frase fala do ENDEREÇO, não do nome: depois que o id passou a ser
       * derivado, dois nomes diferentes ("Já Existe" e "já existe") colidem no
       * mesmo endereço — e dizer "já existe um time com esse nome" mandaria a
       * pessoa procurar um nome idêntico que não existe.
       */
      return reply
        .code(409)
        .send({ erro: `já existe um time no endereço "${timeId}" — escolha outro nome` });
    }

    const [organizacao] = await db.select().from(organizacoes).limit(1);
    const email = req.usuario!.email;
    // O NOME que a pessoa escreveu fica como ela escreveu — acento e maiúscula
    // inclusos. O id é o endereço; o nome é o rótulo, e o rótulo ecoa quem o
    // cadastrou.
    await db.insert(times).values({ id: timeId, organizacaoId: organizacao.id, nome: nomeDigitado });
    // Quem cria o time é o primeiro owner dele — sem isso o time nasceria sem
    // ninguém capaz de configurá-lo (SPEC-38).
    await db.insert(usuarioTime).values({ email, timeId, nivel: "owner" });
    registrarAuditoria(db, { email, acao: "criar", recurso: "times", recursoId: timeId });

    // Mesmo raciocínio do aceite de convite abaixo — a sessão (JWT) não se
    // atualiza sozinha, precisa reemitir o cookie já com o time novo dentro.
    const linhas = await db.select().from(usuarioTime).where(eq(usuarioTime.email, email));
    const novoTokenSessao = await assinarSessao({ email, timeIds: linhas.map((l) => l.timeId) });
    reply.setCookie(COOKIE_SESSAO, novoTokenSessao, {
      httpOnly: true,
      sameSite: "lax",
      // Só true em produção — atrás de Caddy/HTTPS (SPEC-15); em dev (HTTP
      // puro) o browser recusaria um cookie "secure" numa conexão sem TLS.
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return reply.code(201).send({ timeId });
  });

  // SPEC-38 — convidar deixou de exigir a permissão de administrar membros:
  // qualquer membro convida, mas com TETO ("convidar mais users de no máximo
  // mesmo nível"). O teto é 403, não clamp silencioso: um convite rebaixado
  // sem aviso seria surpresa pra quem convidou E pra quem aceitou.
  app.post(
    "/times/:timeId/convites",
    { preHandler: exigirTime((req) => (req.params as { timeId: string }).timeId) },
    async (req, reply) => {
      const { timeId } = req.params as { timeId: string };
      const corpo = corpoConvite.safeParse(req.body ?? {});
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const meuNivel = await nivelNoTime(db, req.usuario!.email, timeId);
      if (!nivelCobre(meuNivel, corpo.data.nivel)) {
        return reply.code(403).send({
          erro: `seu nível neste time é "${meuNivel ?? "nenhum"}" — não dá pra convidar alguém como "${corpo.data.nivel}"`,
        });
      }

      const expiraEm = new Date(Date.now() + DURACAO_CONVITE_MS);
      const [convite] = await db
        .insert(convitesTime)
        .values({ timeId, nivel: corpo.data.nivel, criadoPor: req.usuario!.email, expiraEm })
        .returning();
      registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "convites_time", recursoId: convite.token });
      return reply.code(201).send({
        token: convite.token,
        timeId: convite.timeId,
        nivel: convite.nivel,
        expiraEm: convite.expiraEm,
        url: `${process.env.ORIGEM_WEB ?? ""}/?convite=${convite.token}`,
      });
    }
  );

  app.post(
    "/convites/:token/aceitar",
    { preHandler: exigirSessao },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const [convite] = await db.select().from(convitesTime).where(eq(convitesTime.token, token));
      if (!convite) return reply.code(404).send({ erro: "convite não encontrado" });
      if (convite.usadoEm || convite.expiraEm < new Date()) {
        return reply.code(410).send({ erro: "convite expirado ou já usado" });
      }

      const email = req.usuario!.email;
      // O aceite entra com o nível do CONVITE (SPEC-38) — quem já é membro não
      // muda de nível por aceitar outro convite (onConflictDoNothing).
      await db
        .insert(usuarioTime)
        .values({ email, timeId: convite.timeId, nivel: convite.nivel })
        .onConflictDoNothing();
      await db
        .update(convitesTime)
        .set({ usadoPor: email, usadoEm: new Date() })
        .where(eq(convitesTime.token, token));
      registrarAuditoria(db, { email, acao: "aceitar", recurso: "convites_time", recursoId: token });

      // A sessão é um JWT assinado no login (SPEC-08 §2.2) — não se atualiza
      // sozinha. Sem reemitir o cookie aqui, `timeIds` na sessão em uso
      // continuaria com o valor de antes de aceitar, mesmo com o banco já
      // certo (achado real: só apareceu testando o fluxo de ponta a ponta
      // contra o container de verdade, não nos testes unitários com mocks de rota).
      const linhas = await db.select().from(usuarioTime).where(eq(usuarioTime.email, email));
      const novoTokenSessao = await assinarSessao({ email, timeIds: linhas.map((l) => l.timeId) });
      reply.setCookie(COOKIE_SESSAO, novoTokenSessao, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });

      return { timeId: convite.timeId };
    }
  );

  app.get(
    "/times/:timeId/membros",
    { preHandler: exigirTime((req) => (req.params as { timeId: string }).timeId) },
    async (req) => {
      const { timeId } = req.params as { timeId: string };
      const linhas = await db.select().from(usuarioTime).where(eq(usuarioTime.timeId, timeId));
      // SPEC-38 — a lista carrega o nível de cada participação (antes era só
      // o e-mail; a UI agora mostra e edita níveis).
      return linhas.map((l) => ({ email: l.email, nivel: l.nivel }));
    }
  );

  app.post(
    "/times/:timeId/membros",
    {
      preHandler: [
        exigirTime((req) => (req.params as { timeId: string }).timeId),
        podeAdministrarMembros((req) => (req.params as { timeId: string }).timeId),
      ],
    },
    async (req, reply) => {
      const { timeId } = req.params as { timeId: string };
      const corpo = corpoAdicionarMembro.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      await db
        .insert(usuarioTime)
        .values({ email: corpo.data.email, timeId, nivel: corpo.data.nivel })
        .onConflictDoNothing();
      registrarAuditoria(db, {
        email: req.usuario!.email,
        acao: "adicionar",
        recurso: "usuario_time",
        recursoId: `${timeId}:${corpo.data.email}`,
      });
      return reply.code(201).send({ email: corpo.data.email, timeId, nivel: corpo.data.nivel });
    }
  );

  app.delete(
    "/times/:timeId/membros/:email",
    {
      preHandler: [
        exigirTime((req) => (req.params as { timeId: string }).timeId),
        podeAdministrarMembros((req) => (req.params as { timeId: string }).timeId),
      ],
    },
    async (req, reply) => {
      const { timeId, email } = req.params as { timeId: string; email: string };
      const membros = await db.select().from(usuarioTime).where(eq(usuarioTime.timeId, timeId));
      if (membros.length <= 1) {
        return reply.code(400).send({ erro: "não é possível remover o último membro do time" });
      }
      if (await ehUltimoOwner(timeId, email)) {
        return reply.code(400).send({ erro: "não é possível remover o último owner do time — promova outro membro antes" });
      }

      await db.delete(usuarioTime).where(and(eq(usuarioTime.timeId, timeId), eq(usuarioTime.email, email)));
      registrarAuditoria(db, {
        email: req.usuario!.email,
        acao: "remover",
        recurso: "usuario_time",
        recursoId: `${timeId}:${email}`,
      });
      return reply.code(204).send();
    }
  );

  // SPEC-38 — mudar o nível de um membro é ato de owner (ou de quem recebeu a
  // permissão "membros"). Rebaixar o último owner é 400, não 403: a requisição
  // é legítima, o estado que ela produziria é que é inválido.
  app.put(
    "/times/:timeId/membros/:email/nivel",
    {
      preHandler: [
        exigirTime((req) => (req.params as { timeId: string }).timeId),
        podeAdministrarMembros((req) => (req.params as { timeId: string }).timeId),
      ],
    },
    async (req, reply) => {
      const { timeId, email } = req.params as { timeId: string; email: string };
      const corpo = corpoNivel.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const nivel: Nivel = corpo.data.nivel;
      const [membro] = await db
        .select()
        .from(usuarioTime)
        .where(and(eq(usuarioTime.timeId, timeId), eq(usuarioTime.email, email)))
        .limit(1);
      if (!membro) return reply.code(404).send({ erro: `"${email}" não é membro de "${timeId}"` });
      if (nivel !== "owner" && (await ehUltimoOwner(timeId, email))) {
        return reply.code(400).send({ erro: "não é possível rebaixar o último owner do time — promova outro membro antes" });
      }

      await db
        .update(usuarioTime)
        .set({ nivel })
        .where(and(eq(usuarioTime.timeId, timeId), eq(usuarioTime.email, email)));
      registrarAuditoria(db, {
        email: req.usuario!.email,
        acao: "alterar-nivel",
        recurso: "usuario_time",
        recursoId: `${timeId}:${email}:${nivel}`,
      });
      return { email, timeId, nivel };
    }
  );
}
