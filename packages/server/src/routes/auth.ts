import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { generators } from "openid-client";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { assinarSessao, COOKIE_SESSAO, verificarSessao } from "../auth/sessao.js";
import { trocarCodigoPorEmail, urlDeLogin } from "../auth/oidc.js";
import { usuarioTime } from "../db/schema.js";

// Só e-mail — o login não é o lugar de escolher time (achado real: a versão
// anterior pedia um `timeId` na própria tela de login, mas não tem como saber
// de antemão a quais times um e-mail pertence, e um e-mail pode pertencer a
// mais de um). O server já sabe todos os times de um e-mail (`usuario_time`);
// qual deles fica ativo é decisão de depois do login (App.tsx: um time só ->
// direto, mais de um -> tela de escolha, ver EscolherTimeScreen.tsx).
const corpoLoginDev = z.object({
  email: z.string().email(),
});

const COOKIE_OIDC_ESTADO = "gerador_oidc_estado";

/** Bem mais apertado que o default global (100/min, ver app.ts) — é o alvo
 * óbvio de força bruta/abuso, e é o único lugar onde isso importa de verdade
 * antes de saber quem é a pessoa (SPEC-10 §2.1). Configurável por env var (não
 * só uma constante) porque um teste que builda a própria instância de app
 * precisa conseguir apertar esse número pra validar o 429 sem esperar 5 min
 * nem fazer 10 requisições de verdade; o app "de produção" nunca muda isso.
 */
function limiteLogin() {
  return {
    config: {
      rateLimit: {
        max: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 10),
        timeWindow: process.env.RATE_LIMIT_LOGIN_JANELA ?? "5 minutes",
      },
    },
  };
}

/**
 * Dois modos, mesma sessão no final (`AUTH_MODE`, default `dev`): `dev` aceita
 * `{ email, timeId }` direto (sem handshake), `oidc` faz o fluxo padrão via
 * `openid-client`. Não existe IdP corporativo acessível neste ambiente — `dev`
 * é o que roda local/E2E/CI; `oidc` é o caminho de produção, nunca exercido
 * aqui mas pronto pra apontar pra qualquer provedor via variável de ambiente.
 */
export async function registrarRotasAuth(app: FastifyInstance, { db }: OpcoesApp) {
  const modoOidc = process.env.AUTH_MODE === "oidc";

  // Achado real: o backend sempre soube dos dois modos, mas `LoginScreen.tsx`
  // não tinha como saber qual está ativo no servidor — sempre renderizava o
  // formulário de e-mail do modo dev, mesmo com AUTH_MODE=oidc rodando de
  // verdade. Rota pública (não vaza nada sensível, só "que UI mostrar").
  app.get("/auth/modo", async () => ({ modo: modoOidc ? "oidc" : "dev" }) as const);

  app.get("/auth/me", async (req, reply) => {
    const token = req.cookies?.[COOKIE_SESSAO];
    const claims = token ? await verificarSessao(token) : null;
    if (!claims) return reply.code(401).send({ erro: "sem sessão" });
    return claims;
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE_SESSAO, { path: "/" });
    return { ok: true };
  });

  // Sessão vale mesmo com `timeIds` vazio — pertencer a um time é checado por
  // `exigirTime` quando importa, não na hora de logar. Não checar isso aqui
  // permitiria só provar quem você é sem checar time nenhum, o que é
  // exatamente o que o fluxo de convite (SPEC-09 §3) precisa: alguém novo
  // primeiro consegue uma sessão, só depois entra num time aceitando o convite.
  // Só seta o cookie e devolve os claims — não manda a resposta. Achado real:
  // antes mandava (`reply.send`) incondicionalmente, o que é certo pro POST
  // /auth/login (dev, o `fetch()` do cliente quer o JSON), mas errado pro
  // GET /auth/callback (oidc) — o reply já ia embora aqui, e o `reply.redirect`
  // seguinte nunca executava; o navegador ficava preso mostrando o JSON cru
  // na própria URL de callback em vez de voltar pro app.
  async function emitirSessaoParaEmail(
    email: string,
    reply: FastifyReply
  ): Promise<{ email: string; timeIds: string[] }> {
    const linhas = await db.select().from(usuarioTime).where(eq(usuarioTime.email, email));
    const timeIds = linhas.map((l) => l.timeId);
    const token = await assinarSessao({ email, timeIds });
    reply.setCookie(COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: "lax",
      // Só true em produção — atrás de Caddy/HTTPS (SPEC-15); em dev (HTTP
      // puro) o browser recusaria um cookie "secure" numa conexão sem TLS.
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return { email, timeIds };
  }

  if (!modoOidc) {
    app.post("/auth/login", limiteLogin(), async (req, reply) => {
      const corpo = corpoLoginDev.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const sessao = await emitirSessaoParaEmail(corpo.data.email, reply);
      reply.send(sessao);
    });
    return;
  }

  app.get("/auth/login", async (_req, reply) => {
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    reply.setCookie(COOKIE_OIDC_ESTADO, JSON.stringify({ state, nonce, codeVerifier }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    const url = await urlDeLogin(state, nonce, codeVerifier);
    reply.redirect(url);
  });

  app.get("/auth/callback", limiteLogin(), async (req, reply) => {
    const bruto = req.cookies?.[COOKIE_OIDC_ESTADO];
    if (!bruto) return reply.code(400).send({ erro: "estado OIDC ausente ou expirado" });
    reply.clearCookie(COOKIE_OIDC_ESTADO, { path: "/" });

    const { state, nonce, codeVerifier } = JSON.parse(bruto) as {
      state: string;
      nonce: string;
      codeVerifier: string;
    };

    let email: string;
    try {
      email = await trocarCodigoPorEmail({
        callbackParams: req.query as Record<string, string>,
        state,
        nonce,
        codeVerifier,
      });
    } catch {
      // Motivo real (email_verified, domínio, troca de code inválida...) fica
      // só no servidor — devolver o detalhe pro cliente ajudaria alguém tentando
      // adivinhar credencial/domínio válido mais do que ajudaria um usuário legítimo.
      return reply.code(403).send({ erro: "não foi possível autenticar com o provedor" });
    }
    await emitirSessaoParaEmail(email, reply);
    reply.redirect(process.env.ORIGEM_WEB ?? "/");
  });
}
