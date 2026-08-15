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
import {
  criarCasosDeUsoDeQuebras,
  criarCasosDeUsoDeItensGerados,
  criarCasosDeUsoDeConfig,
  normalizarExportador,
} from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeQuebrasEmPostgres } from "../adaptadores/quebrasEmPostgres.js";
import { criarRepositorioDeItensGeradosEmPostgres } from "../adaptadores/itensGeradosEmPostgres.js";
import { criarExportadorViaAgente } from "../adaptadores/exportadorViaAgente.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { registrarAuditoria } from "../auditoria.js";
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
  especificacao: z.string().nullish(),
  /** SPEC-53 — o vínculo com o produto. */
  produtoId: z.string().uuid().nullish(),
  /** SPEC-57 fatia A — o propósito da demanda. `optional` e não `nullish`:
   * quebra sem necessidade nenhuma é lista vazia, não `null` (a ausência já
   * significa "não declarou", e dois jeitos de dizer nada é como o campo
   * morre em silêncio na borda). */
  necessidades: z
    .array(
      z.object({
        id: z.string().min(1),
        texto: z.string().min(1),
        prioridade: z.enum(["alta", "media", "baixa"]).optional(),
        origem: z.enum(["manual", "extraido", "inferido", "sugerido"]),
        confirmado: z.boolean().optional(),
        atendidaPor: z.array(z.string()),
      })
    )
    .optional(),
  /** §242 — a válvula: violar o padrão é permitido, e fica registrado. `motivo`
   * e `autor` com `min(1)` porque exceção sem os dois é só o vermelho
   * desligado — que é exatamente o que a regra 3 existe para impedir. */
  excecoes: z
    .array(
      z.object({
        noId: z.string().min(1),
        campo: z.string().min(1),
        motivo: z.string().min(1),
        autor: z.string().min(1),
        em: z.string().min(1),
      })
    )
    .optional(),
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

  // SPEC-41 Parte B — os itens de trabalho materializados. Quem CALCULA é o
  // engine no cliente (mesmo material do documento de especificação); aqui só
  // se persiste e lê o conjunto. Regenerar substitui — a chave estável
  // preserva o rastro de exportação (Fase 2).
  const itens = criarCasosDeUsoDeItensGerados(criarRepositorioDeItensGeradosEmPostgres(db));

  const corpoItens = z.object({
    itens: z.array(
      z.object({
        chave: z.string().min(1),
        titulo: z.string().min(1),
        tipo: z.string().min(1),
        tamanho: z.string().min(1),
        dependencias: z.array(z.string()),
        corpoMarkdown: z.string(),
        pendencias: z.number().int().min(0),
        sugestoes: z.number().int().min(0),
      })
    ),
  });

  app.get("/quebras/:id/itens", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await casos.obter(id))) return reply.code(404).send({ erro: "quebra não encontrada" });
    return itens.listarDaQuebra(id);
  });

  /**
   * SPEC-49 — o *Act* do ciclo de itens: mandar pro tracker. Exporta só os
   * PRONTOS (a régua da SPEC-44/47), item a item, e devolve o que subiu, o
   * que falhou (com motivo) e o que ficou de fora por ter pendência.
   */
  app.post("/quebras/:id/itens/exportar", { preHandler: podeOperarNaQuebra }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await casos.obter(id))) return reply.code(404).send({ erro: "quebra não encontrada" });

    const config = normalizarExportador(
      (await criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db)).obter("exportador", { endpoint: "", rotulo: "", cabecalhos: {} }))
        .documento
    );
    if (!config.endpoint) {
      // Sem destino configurado a resposta DIZ o que fazer, em vez de um erro
      // genérico que manda a pessoa adivinhar onde configurar.
      return reply.code(409).send({
        erro: "nenhum destino de exportação configurado — cadastre o endereço do agente em Configurações → Exportação",
      });
    }

    const resultado = await itens.exportarDaQuebra(id, criarExportadorViaAgente(config));
    registrarAuditoria(db, {
      email: req.usuario!.email,
      acao: "exportar",
      recurso: "itens_gerados",
      recursoId: id,
    });
    return { ...resultado, destino: config.rotulo || config.endpoint };
  });

  app.put("/quebras/:id/itens", { preHandler: podeOperarNaQuebra }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await casos.obter(id))) return reply.code(404).send({ erro: "quebra não encontrada" });
    const corpo = corpoItens.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    return itens.regerarDaQuebra(id, corpo.data.itens);
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
