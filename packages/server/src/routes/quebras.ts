import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  derivar,
  resolverDependencias,
  validateConfig,
  type AppConfig,
  type Diagrama,
  type DiagramaConfig,
} from "@gerador/engine";
import { criarCasosDeUsoDeQuebras } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeQuebrasEmPostgres } from "../adaptadores/quebrasEmPostgres.js";
import { exigirNivel } from "../auth/niveis.js";

/**
 * SPEC-31 Fase 1: o corpo passou a aceitar os NOVE campos da porta. Antes eram
 * três, e `respostasItens`/`demandInfo`/`anexosContexto` morriam aqui — o Zod
 * descartava, sem erro, o trabalho da esteira e o contexto do épico.
 */
const corpoQuebra = z.object({
  titulo: z.string().nullish(),
  time: z.string().nullish(),
  diagrama: z.object({ nodes: z.array(z.record(z.unknown())), edges: z.array(z.record(z.unknown())) }),
  respostasItens: z.record(z.record(z.unknown())).optional(),
  demandInfo: z.string().optional(),
  anexosContexto: z.array(z.string()).optional(),
});

/** Mesmo fallback de `.example.json` de `packages/web/vite.config.ts` (servirConfigEmDev)
 * e do Dockerfile raiz — este repositório só tem os templates de exemplo na raiz
 * (nunca um "projeto real"), então o nome puro cai pro `.example.json` se não existir. */
async function lerJsonDeConfig<T>(diretorioConfig: string, nomeArquivo: string): Promise<T> {
  const candidatos = [resolve(diretorioConfig, nomeArquivo), resolve(diretorioConfig, nomeArquivo.replace(/\.json$/, ".example.json"))];
  for (const candidato of candidatos) {
    try {
      return JSON.parse(await readFile(candidato, "utf-8")) as T;
    } catch {
      // tenta o próximo candidato
    }
  }
  throw new Error(`Não foi possível ler "${nomeArquivo}" (nem .example.json) em ${diretorioConfig}`);
}

export async function registrarRotasQuebras(app: FastifyInstance, { db, diretorioConfig }: OpcoesApp) {
  // A rota virou borda: traduz HTTP e delega. Persistência é do adaptador,
  // regra é do engine — e o mesmo caso de uso roda no modo local (SPEC-31 §7).
  const casos = criarCasosDeUsoDeQuebras(criarRepositorioDeQuebrasEmPostgres(db));

  app.get("/quebras", () => casos.listar());

  app.get("/quebras/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const quebra = await casos.obter(id);
    if (!quebra) return reply.code(404).send({ erro: "quebra não encontrada" });
    return quebra;
  });

  // SPEC-38 Fase 1 — escrita de quebra é trabalho do dia a dia: exige nível
  // `operar` (visualizar lê, não grava). O escopo é o time da PRÓPRIA quebra
  // quando ela declara um; sem time, vale o maior nível da pessoa — quem é
  // visualizar em tudo não opera em lugar nenhum. (Uma quebra pode referenciar
  // serviços de vários times no diagrama; o gate é sobre quem grava, não sobre
  // o que o desenho menciona.)
  const podeOperarNaQuebra = exigirNivel(db, "operar", (req) => {
    const time = (req.body as { time?: string | null } | null)?.time;
    return typeof time === "string" && time.trim() ? time : null;
  });

  app.post("/quebras", { preHandler: podeOperarNaQuebra }, async (req, reply) => {
    const corpo = corpoQuebra.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    return reply.code(201).send(await casos.criar(corpo.data as never));
  });

  app.put("/quebras/:id", { preHandler: podeOperarNaQuebra }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const corpo = corpoQuebra.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const atualizada = await casos.atualizar(id, corpo.data as never);
    if (!atualizada) return reply.code(404).send({ erro: "quebra não encontrada" });
    return atualizada;
  });

  // Mesmo mecanismo do `gerador derive` (packages/cli/src/commands/derive.ts) e do
  // botão "Derivar Quebra" do app web — a mesma função `derivar` do engine, só que
  // lendo a quebra do banco em vez de arquivo local.
  app.post("/quebras/:id/derivar", async (req, reply) => {
    const { id } = req.params as { id: string };
    const quebra = await casos.obter(id);
    if (!quebra) return reply.code(404).send({ erro: "quebra não encontrada" });

    const [appConfig, diagramaConfig] = await Promise.all([
      lerJsonDeConfig<AppConfig>(diretorioConfig, "app.json"),
      lerJsonDeConfig<DiagramaConfig>(diretorioConfig, "diagrama.json"),
    ]);

    const errosConfig = validateConfig(diagramaConfig, appConfig);
    if (errosConfig.length > 0) {
      return reply.code(422).send({ erro: "config/diagrama.json inválida", detalhes: errosConfig });
    }

    const atividades = derivar(quebra.diagrama as Diagrama, diagramaConfig, {
      time: quebra.time ?? undefined,
    });
    return resolverDependencias(atividades);
  });
}
