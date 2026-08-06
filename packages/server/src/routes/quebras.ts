import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
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
import type { OpcoesApp } from "../app.js";
import { exigirSessao } from "../auth/middleware.js";
import { quebras } from "../db/schema.js";

const corpoQuebra = z.object({
  time: z.string().optional(),
  diagrama: z.object({ nodes: z.array(z.record(z.unknown())), edges: z.array(z.record(z.unknown())) }),
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
  app.get("/quebras", async () => {
    const linhas = await db
      .select({ id: quebras.id, time: quebras.time, atualizadoEm: quebras.atualizadoEm })
      .from(quebras);
    return linhas;
  });

  app.get("/quebras/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [linha] = await db.select().from(quebras).where(eq(quebras.id, id));
    if (!linha) return reply.code(404).send({ erro: "quebra não encontrada" });
    return linha;
  });

  // Escrita exige só sessão válida (não é restrita a um time — uma quebra pode
  // referenciar serviços de vários times no mesmo diagrama).
  app.post("/quebras", { preHandler: exigirSessao }, async (req, reply) => {
    const corpo = corpoQuebra.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const [criada] = await db
      .insert(quebras)
      .values({ time: corpo.data.time, diagrama: corpo.data.diagrama })
      .returning();
    return reply.code(201).send(criada);
  });

  app.put("/quebras/:id", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const corpo = corpoQuebra.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const [atualizada] = await db
      .update(quebras)
      .set({
        time: corpo.data.time,
        diagrama: corpo.data.diagrama,
        atualizadoEm: new Date(),
      })
      .where(eq(quebras.id, id))
      .returning();
    if (!atualizada) return reply.code(404).send({ erro: "quebra não encontrada" });
    return atualizada;
  });

  // Mesmo mecanismo do `gerador derive` (packages/cli/src/commands/derive.ts) e do
  // botão "Derivar Quebra" do app web — a mesma função `derivar` do engine, só que
  // lendo a quebra do banco em vez de arquivo local.
  app.post("/quebras/:id/derivar", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [linha] = await db.select().from(quebras).where(eq(quebras.id, id));
    if (!linha) return reply.code(404).send({ erro: "quebra não encontrada" });

    const [appConfig, diagramaConfig] = await Promise.all([
      lerJsonDeConfig<AppConfig>(diretorioConfig, "app.json"),
      lerJsonDeConfig<DiagramaConfig>(diretorioConfig, "diagrama.json"),
    ]);

    const errosConfig = validateConfig(diagramaConfig, appConfig);
    if (errosConfig.length > 0) {
      return reply.code(422).send({ erro: "config/diagrama.json inválida", detalhes: errosConfig });
    }

    const atividades = derivar(linha.diagrama as Diagrama, diagramaConfig, {
      time: linha.time ?? undefined,
    });
    return resolverDependencias(atividades);
  });
}
