import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { BancoDeDados } from "./db/client.js";
import { registrarRotasQuebras } from "./routes/quebras.js";
import { registrarRotasPerfisTime } from "./routes/perfisTime.js";
import { registrarRotasCamposNo } from "./routes/camposNo.js";
import { registrarRotasEspecificacaoTemplate } from "./routes/especificacaoTemplate.js";
import { registrarRotasConfig } from "./routes/config.js";
import { registrarRotasIa } from "./routes/ia.js";
import { registrarRotasCamposAresta } from "./routes/camposAresta.js";
import { registrarRotasAuth } from "./routes/auth.js";
import { registrarRotasTimes } from "./routes/times.js";
import { registrarRotasAcessos } from "./routes/acessos.js";

export interface OpcoesApp {
  db: BancoDeDados;
  /** Diretório de onde ler config/{app,diagrama,regras}.json — mesmo contrato do CLI (packages/cli/src/commands/derive.ts). */
  diretorioConfig: string;
  /** Origem liberada por CORS — o próprio packages/web. `undefined` libera geral (só em teste). */
  origemPermitida?: string;
}

/** Fábrica testável: supertest chama isso direto, sem subir porta de verdade
 * (server.ts é a única coisa que efetivamente faz `listen`). */
export async function buildApp(opcoes: OpcoesApp): Promise<FastifyInstance> {
  const producao = process.env.NODE_ENV === "production";
  if (producao && !opcoes.origemPermitida) {
    // Falha alto no boot, não silenciosamente aberto pra qualquer origem —
    // mesma régua de "não roda com config quebrada" do resto do projeto (SPEC-10 §3).
    throw new Error("origemPermitida é obrigatório quando NODE_ENV=production (CORS nunca pode ficar '*' em produção).");
  }

  // trustProxy só em produção, atrás do Caddy da Fase D — sem isso, o rate
  // limit por IP (abaixo) enxergaria o IP do proxy pra todo mundo, não o IP
  // real de quem está batendo. Em dev/E2E, sem proxy, isso ficaria errado do
  // jeito oposto (confiaria em X-Forwarded-For vindo direto do cliente).
  /**
   * ACHADO REAL, caçando "Unexpected end of JSON input" no modo hospedado:
   * isto era `logger: false`, e por isso TODO `app.log.error` do projeto era
   * um no-op silencioso. O `catch` de `executarPedido` fazia exatamente a coisa
   * certa — capturava o erro do gateway e o registrava — e a linha ia para
   * lugar nenhum. `docker logs` mostrava só a linha de inicialização, mesmo com
   * a rota falhando a cada chamada.
   *
   * O efeito era pior que não ter tratamento: havia um tratamento, ele parecia
   * suficiente ao ler o código, e não produzia nada. Diagnosticar virou
   * adivinhação.
   *
   * `LOG_NIVEL=silent` continua disponível para quem quiser o silêncio de
   * volta; o padrão passa a ser falar.
   */
  const app = Fastify({
    logger: { level: process.env.LOG_NIVEL ?? "info" },
    trustProxy: producao,
  });

  await app.register(cors, {
    origin: opcoes.origemPermitida ?? true,
    // Sessão viaja em cookie httpOnly (ver auth/sessao.ts) — sem credentials:true
    // o browser nunca envia/aceita o cookie em requisição cross-origin (web em
    // :5173/:8080, server em :4000).
    credentials: true,
  });
  await app.register(cookie);
  await app.register(helmet);
  // Default frouxo (escrita normal não deveria esbarrar nisso em uso real);
  // /auth/login e /auth/callback pedem um limite bem mais apertado por rota
  // (ver routes/auth.ts) — é ali que abuso de verdade (força bruta) importa.
  // Configurável por env var pelo mesmo motivo do limite de login: um E2E com
  // vários workers em paralelo, todos batendo no mesmo processo de servidor,
  // gera tráfego muito acima de qualquer uso real de uma pessoa só.
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 100),
    timeWindow: "1 minute",
  });

  app.get("/health", async () => ({ status: "ok" }));

  await registrarRotasAuth(app, opcoes);
  await registrarRotasQuebras(app, opcoes);
  await registrarRotasPerfisTime(app, opcoes);
  await registrarRotasCamposNo(app, opcoes);
  await registrarRotasEspecificacaoTemplate(app, opcoes);
  await registrarRotasConfig(app, opcoes);
  await registrarRotasIa(app, opcoes);
  await registrarRotasCamposAresta(app, opcoes);
  await registrarRotasTimes(app, opcoes);
  await registrarRotasAcessos(app, opcoes);

  return app;
}
