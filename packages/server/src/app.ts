import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { BancoDeDados } from "./db/client.js";
import { registrarRotasQuebras } from "./routes/quebras.js";
import { registrarRotasStacks } from "./routes/stacks.js";
import { registrarRotasProdutos } from "./routes/produtos.js";
import { registrarRotasPdca } from "./routes/pdca.js";
import { registrarRotasCamposNo } from "./routes/camposNo.js";
import { registrarRotasEspecificacaoTemplate } from "./routes/especificacaoTemplate.js";
import { registrarRotasConfig } from "./routes/config.js";
import { registrarRotasIa } from "./routes/ia.js";
import { registrarRotasCamposAresta } from "./routes/camposAresta.js";
import { registrarRotasAuth } from "./routes/auth.js";
import { registrarRotasTimes } from "./routes/times.js";
import { registrarRotasAcessos } from "./routes/acessos.js";
import { registrarRotasConectores } from "./routes/conectores.js";
import { registrarRotasFluxos } from "./routes/fluxos.js";

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
    /**
     * SPEC-72 fatia A — ACHADO ao escrever o teto de anexo: o teto já existia,
     * e era o pior possível.
     *
     * O default do Fastify é **1 MB**, e ele responde `413` sem uma palavra.
     * Ou seja: o produto já recusava anexo grande, num limite que ninguém
     * declarou, com a mensagem que a SPEC §3.1 recusa em voz alta ("recusados
     * na borda com a frase que diz o número — não um 413 seco").
     *
     * Ninguém tinha percebido porque, até a SPEC-71, anexo NENHUM salvava: a
     * borda rejeitava a forma antes de o tamanho importar. Corrigida a forma,
     * o limite mudo apareceu.
     *
     * Este número fica ACIMA do teto declarado (4 MB de anexos + o resto da
     * quebra + o inchaço do JSON) de propósito: quem recusa tem que ser a regra
     * que sabe explicar, não a que só sabe cortar.
     */
    bodyLimit: 8_000_000,
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
  await registrarRotasStacks(app, opcoes);
  await registrarRotasProdutos(app, opcoes);
  await registrarRotasPdca(app, opcoes);
  await registrarRotasCamposNo(app, opcoes);
  await registrarRotasEspecificacaoTemplate(app, opcoes);
  await registrarRotasConfig(app, opcoes);
  await registrarRotasIa(app, opcoes);
  await registrarRotasCamposAresta(app, opcoes);
  await registrarRotasTimes(app, opcoes);
  await registrarRotasAcessos(app, opcoes);
  await registrarRotasConectores(app, opcoes);
  await registrarRotasFluxos(app, opcoes);

  return app;
}
