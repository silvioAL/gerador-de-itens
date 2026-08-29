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
  comoDecisao,
  destinosDaOperacao,
  lacunasDaDecisaoImportada,
  normalizarExportador,
} from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeQuebrasEmPostgres } from "../adaptadores/quebrasEmPostgres.js";
import { criarRepositorioDeItensGeradosEmPostgres } from "../adaptadores/itensGeradosEmPostgres.js";
import { criarExportadorViaAgente } from "../adaptadores/exportadorViaAgente.js";
import { criarLeitorDeAdrViaGateway, criarPublicadorDeDocumentoViaGateway } from "../adaptadores/gatewayDoTime.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { registrarAuditoria } from "../auditoria.js";
import { exigirNivel } from "../auth/niveis.js";

/**
 * SPEC-31 Fase 1: o corpo passou a aceitar os NOVE campos da porta. Antes eram
 * três, e `respostasItens`/`demandInfo`/`anexosContexto` morriam aqui — o Zod
 * descartava, sem erro, o trabalho da esteira e o contexto do épico.
 */
/**
 * SPEC-72 fatia A — o TETO dos anexos, declarado.
 *
 * ## Por que existe, e por que não é otimização
 *
 * A SPEC-72 mediu e **recusou** otimizar: 848 kB de tabela inteira, 27 quebras,
 * maior contexto com 1 692 caracteres. Não há número que doa. O que a medição
 * revelou foi outra coisa — `anexosContexto` guarda o conteúdo INTEIRO de cada
 * arquivo dentro da linha da quebra, e **não havia limite em lugar nenhum**:
 * nem no cliente, nem aqui, nem na coluna. Um `.md` de 20 MB colado entraria
 * por completo, a cada 2 s de digitação.
 *
 * Isto não é sobre economizar bytes. É sobre **ter teto** — sem ele, o primeiro
 * anexo grande vira um incidente que ninguém consegue diagnosticar pela tela.
 *
 * ## Por que a mensagem diz o número
 *
 * Um 413 seco (ou um "payload too large" do proxy) manda a pessoa adivinhar o
 * que fazer. A frase diz o tamanho do arquivo, o limite e a saída — é a mesma
 * disciplina do §57: dizer "falta preencher" sem dizer onde transfere a busca
 * para quem já não sabia o que procurar.
 *
 * ## Os números, e o que eles são
 *
 * Generosos de propósito (§6.1 da SPEC): o teto existe para dar diagnóstico,
 * não para apertar. Quem esbarrar é o caso que ainda não existe — e é ele que
 * vai justificar a conversa sobre storage separado, que a SPEC recusa **até**
 * alguém esbarrar aqui.
 */
const LIMITE_POR_ANEXO = 1_000_000;
const LIMITE_TOTAL_ANEXOS = 4_000_000;

/** Em MB com uma casa, que é como uma pessoa lê tamanho de arquivo. */
function emMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`;
}

/**
 * SPEC-71 fatia C — EXPORTADO para o teste de borda.
 *
 * `corpoQuebra.shape` é a única forma de perguntar, em runtime, quais chaves a
 * borda conhece. O outro lado da pergunta — quais chaves o tipo `Quebra` tem —
 * não existe em runtime, e por isso o teste cruza este `shape` com um
 * inventário que o COMPILADOR verifica. Ver `quebras.borda.test.ts`.
 */
/**
 * SPEC-81 fatia B — o corpo da publicação de documento.
 *
 * `markdown` vem do cliente porque é lá que ele é montado (ver a rota).
 * `desatualizado` também: o web já calcula o estado do documento em relação ao
 * desenho, e recalcular aqui seria uma segunda implementação da mesma pergunta.
 */
const corpoPublicarDocumento = z.object({
  markdown: z.string().min(1, "markdown vazio — não há documento para publicar"),
  desatualizado: z.boolean().default(false),
  /** Qual destino, quando há mais de um configurado para documento. */
  destinoId: z.string().optional(),
});

export const corpoQuebra = z.object({
  titulo: z.string().nullish(),
  time: z.string().nullish(),
  diagrama: z.object({ nodes: z.array(z.record(z.unknown())), edges: z.array(z.record(z.unknown())) }),
  respostasItens: z.record(z.record(z.unknown())).optional(),
  demandInfo: z.string().optional(),
  /**
   * SPEC-71 §4 — `{ nome, conteudo }`, e não `string`.
   *
   * Era `z.array(z.string())` desde a 0011 enquanto o modelo dizia objeto, e
   * `z.string()` recebendo objeto **não descarta em silêncio: falha**. A rota
   * respondia 400, e por isso qualquer demanda com um anexo não salvava nada —
   * nem o anexo, nem o diagrama, nem o resto. Medido contra o servidor real.
   */
  anexosContexto: z
    .array(z.object({ nome: z.string(), conteudo: z.string() }))
    .optional()
    .superRefine((anexos, ctx) => {
      if (!anexos) return;
      let total = 0;
      for (const anexo of anexos) {
        const bytes = Buffer.byteLength(anexo.conteudo, "utf8");
        total += bytes;
        if (bytes > LIMITE_POR_ANEXO) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `O anexo "${anexo.nome}" tem ${emMB(bytes)} e o limite por anexo é ${emMB(LIMITE_POR_ANEXO)}. Anexe só a parte que importa, ou cole o trecho no contexto da demanda.`,
          });
        }
      }
      if (total > LIMITE_TOTAL_ANEXOS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Os anexos desta demanda somam ${emMB(total)} e o limite é ${emMB(LIMITE_TOTAL_ANEXOS)}. Remova algum antes de salvar.`,
        });
      }
    }),
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
        /** SPEC-69 fatia A — o prazo que o NEGÓCIO exige. */
        limiteMs: z.number().optional(),
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
        /** SPEC-63 — vazio quando a exceção é de FORMA (quem identifica é `regraId`). */
        campo: z.string(),
        regraId: z.string().optional(),
        /** §307 — a terceira chave: a contradição de resiliência aceita. */
        contradicao: z.enum(["insistencia", "saturacao"]).optional(),
        motivo: z.string().min(1),
        autor: z.string().min(1),
        em: z.string().min(1),
      })
    )
    .optional(),
  /** SPEC-57 fatia C — a escolha entre alternativas. `porque` aceita vazio de
   * propósito: exigir aqui faria a pessoa escrever "porque sim" para conseguir
   * salvar, e um porquê fingido é pior que um porquê ausente — o ausente pelo
   * menos aparece no placar (`semPorque`) e continua cobrando. */
  decisoes: z
    .array(
      z.object({
        id: z.string().min(1),
        noId: z.string().optional(),
        arestaId: z.string().optional(),
        titulo: z.string().min(1),
        contexto: z.string().optional(),
        alternativas: z.array(z.object({ titulo: z.string().min(1), consequencia: z.string().optional() })),
        escolhida: z.string(),
        porque: z.string(),
        status: z.enum(["proposta", "aceita", "substituida"]),
        substituidaPor: z.string().optional(),
        origem: z.enum(["manual", "extraido", "inferido", "sugerido"]),
        autor: z.string().min(1),
        em: z.string().min(1),
        /** SPEC-69 fatia D — os ensaios que são a EVIDÊNCIA desta decisão.
         * Sem eles a evidência para de viajar ao item. */
        ensaioIds: z.array(z.string()).optional(),
        /**
         * SPEC-81 fatia C — de onde veio o ADR importado.
         *
         * **Sem esta linha, a régua central da SPEC-81 não valia**: o campo
         * morria aqui, e um ADR trazido do repositório da casa voltava do banco
         * indistinguível de uma decisão tomada aqui dentro. `origem: "extraido"`
         * sobreviveria sozinho e diria "veio de algum lugar" sem dizer de onde.
         *
         * O guarda do §310 não pegaria: ele cruza `keyof Quebra` com a borda, e
         * este campo mora dentro de `Decisao`. Foi a varredura de pontas soltas
         * do §322 que o encontrou.
         */
        importadoDe: z.string().optional(),
      })
    )
    .optional(),
  /** SPEC-57 fatia E — os caminhos confirmados. Só a DECISÃO ("este caminho
   * importa") atravessa a borda; a inferência roda a cada abertura, é pura, e
   * guardá-la faria o caminho salvo descolar do desenho na primeira aresta que
   * alguém mexesse. */
  percursos: z
    .array(
      z.object({
        id: z.string().min(1),
        rotulo: z.string(),
        nos: z.array(z.string()).min(2),
        origem: z.enum(["manual", "extraido", "inferido", "sugerido"]),
        confirmado: z.boolean().optional(),
      })
    )
    .optional(),
  /** SPEC-58 fatia 2 — o que a PESSOA escreveu. Chaves fixas: seção arbitrária
   * viraria um editor de documento, e aí o template configurável (SPEC-47) e o
   * texto solto disputariam quem manda na estrutura. */
  /**
   * SPEC-80 fatia A — um conjunto de seções POR artefato.
   *
   * Cada tipo declara as SUAS chaves. `z.object` sem `passthrough` continua
   * derrubando chave desconhecida em silêncio, que é o comportamento certo
   * aqui: seção que não foi declarada não é seção, é lixo — e o §310 existe
   * porque campo que a borda não conhece morre calado.
   */
  artefatosEscritos: z
    .object({
      documento: z
        .object({
          /** SPEC-73 fatia B — a visão geral deixou de ser string do motor. */
          visaoGeral: z.string().optional(),
          tradeOffs: z.string().optional(),
          riscos: z.string().optional(),
        })
        .optional(),
      spec: z
        .object({
          origem: z.string().optional(),
          recusas: z.string().optional(),
          fatias: z.string().optional(),
          /** SPEC-80 fatia C — as `Atividade.chave` que esta spec cobre. */
          itensCobertos: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  /** SPEC-58 fatia 3 — o estado. `nullish` e não `optional`: quebra nunca
   * gerada tem `null`, e distinguir isso de "não mandou o campo" é o que
   * permite o PUT não apagar um status por omissão. */
  documentoStatus: z.enum(["rascunho", "em-revisao", "aprovado", "implementado"]).nullish(),
  /**
   * SPEC-70 — o volume que a demanda atende, dito UMA vez e distribuído pelo
   * motor. Sem esta linha o número sumia na borda, e a saturação voltava a
   * calar (a Lei de Little não se faz sem λ).
   */
  volumetria: z.object({ quantidade: z.number(), por: z.enum(["segundo", "minuto", "hora", "dia"]) }).optional(),
  /** SPEC-65 fatia D — as leituras caladas neste desenho. Só a DECISÃO
   * atravessa a borda, como nos percursos: a leitura em si é pura e roda a cada
   * render. `tipo` é string livre de propósito — leitura nova não deveria
   * exigir migração de schema para poder ser calada. */
  leiturasDispensadas: z
    .array(
      z.object({
        noId: z.string().min(1),
        tipo: z.string().min(1),
        autor: z.string().optional(),
        em: z.string().optional(),
      })
    )
    .optional(),
  /** SPEC-66 — os ensaios de lentidão. Só a DEFINIÇÃO atravessa a borda:
   * nenhum tempo calculado é guardado, senão a tabela mostraria o número de um
   * desenho que já mudou. */
  cenariosDeLentidao: z
    .array(
      z.object({
        id: z.string().min(1),
        nome: z.string().min(1),
        origem: z.enum(["manual", "sugerido"]),
        porque: z.string().optional(),
        /**
         * SPEC-69 — o estado do ensaio e o débito assumido.
         *
         * Esta forma estava congelada na SPEC-66, e o tipo do modelo também: o
         * Zod não ficou para trás sozinho, ficou **em sincronia com a cópia
         * morta** que morava em `types.ts` (`CenarioDeLentidaoGuardado`).
         * Enquanto isso a UI escrevia a forma viva. Por isso o ensaio inteiro
         * sumia no salvamento sem nada acusar — e por isso a cópia morreu
         * nesta rodada.
         */
        estado: z.enum(["por-avaliar", "em-revisao", "aceito"]).optional(),
        debito: z
          .object({ motivo: z.string().min(1), autor: z.string().optional(), em: z.string().optional() })
          .optional(),
        /** SPEC-70 §5 — "neste ensaio o volume da demanda é N× o normal". */
        fatorDeVolume: z.number().positive().optional(),
        /** @deprecated SPEC-69 — só para quebra gravada antes do estado existir. */
        aceito: z.boolean().optional(),
        ajustes: z.array(
          z.object({
            tipo: z.enum(["no", "aresta"]),
            id: z.string().min(1),
            fator: z.number().positive().optional(),
            ms: z.number().nonnegative().optional(),
            /** SPEC-68 — as condições que NÃO são lentidão: insistência, pico
             * e disjuntor. Sem elas, as três somem no salvamento. */
            tentativas: z.number().nonnegative().optional(),
            disjuntor: z.boolean().optional(),
            taxaRps: z.number().nonnegative().optional(),
          })
        ),
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

  /**
   * SPEC-81 fatia B — **publicar o documento de desenho na base de conhecimento.**
   *
   * ## Por que rota própria, e não um parâmetro da exportação de itens
   *
   * As duas diferem em ciclo de vida (issue nasce uma vez; página é viva),
   * idempotência (exportar duas vezes duplica; publicar duas vezes atualiza no
   * lugar), modo de falhar (parcial por item × publica ou não) e permissão (quem
   * abre issue não é quem escreve na wiki). Um parâmetro a mais faria a rota
   * mentir sobre os quatro.
   *
   * ## O que vai no corpo, e por que o markdown vem do cliente
   *
   * O documento é montado no web a partir do template, da config e da quebra —
   * é lá que a mesma string que a pessoa vê e baixa existe. Remontá-lo aqui
   * seria uma segunda implementação da geração, e as duas divergiriam na
   * primeira mudança (§263). O servidor guarda a fronteira e o carimbo; o texto
   * é do cliente.
   */
  app.post("/quebras/:id/documento/publicar", { preHandler: podeOperarNaQuebra }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const quebra = await casos.obter(id);
    if (!quebra) return reply.code(404).send({ erro: "quebra não encontrada" });

    const corpo = corpoPublicarDocumento.safeParse(req.body);
    if (!corpo.success) {
      return reply.code(400).send({ erro: "corpo inválido", detalhes: corpo.error.issues });
    }

    const config = normalizarExportador(
      (await criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db)).obter("exportador", { endpoint: "", rotulo: "", cabecalhos: {} }))
        .documento
    );
    const destinos = destinosDaOperacao(config, "documento");
    if (destinos.length === 0) {
      return reply.code(409).send({
        erro: "nenhum destino de documento configurado — cadastre o endereço em Configurações → Exportação, em “Outros destinos”",
      });
    }
    /**
     * Com mais de um destino, quem escolhe é a tela — e enquanto ela não
     * escolher, o servidor **não escolhe por ela**. Publicar no primeiro
     * silenciosamente colocaria a página no espaço errado, que é o pior desfecho
     * de uma publicação.
     */
    const escolhido = corpo.data.destinoId
      ? destinos.find((d) => d.id === corpo.data.destinoId)
      : destinos.length === 1
        ? destinos[0]
        : undefined;
    if (!escolhido) {
      return reply.code(409).send({
        erro: "há mais de um destino de documento — diga em qual publicar",
        destinos: destinos.map((d) => ({ id: d.id, rotulo: d.rotulo || d.endpoint })),
      });
    }

    try {
      const publicado = await criarPublicadorDeDocumentoViaGateway(escolhido).publicar({
        demandaId: id,
        demandaTitulo: quebra.titulo ?? "(sem título)",
        markdown: corpo.data.markdown,
        geradoEm: new Date().toISOString(),
        demandaAtualizadaEm: quebra.atualizadoEm,
        desatualizado: corpo.data.desatualizado,
      });
      registrarAuditoria(db, {
        email: req.usuario!.email,
        acao: "publicar-documento",
        recurso: "quebras",
        recursoId: id,
      });
      return { ...publicado, destino: escolhido.rotulo || escolhido.endpoint };
    } catch (erro) {
      // 502 e não 500: a falha é de quem está do outro lado, e a distinção muda
      // onde a pessoa vai procurar o problema.
      return reply.code(502).send({ erro: erro instanceof Error ? erro.message : String(erro) });
    }
  });

  /**
   * SPEC-81 fatia C — **traz os ADRs da casa, marcados.**
   *
   * ## O que ela NÃO faz
   *
   * Não grava. Devolve as decisões já convertidas e marcadas
   * (`origem: "extraido"` + `importadoDe`), e quem escolhe o que entra é a
   * pessoa — o `PUT /quebras/:id` de sempre leva as escolhidas junto do resto.
   *
   * Escrever aqui pareceria conveniente e criaria o problema que a fatia inteira
   * existe para evitar: decisão de terceiro entrando na demanda sem ninguém ter
   * lido. **Importar não é aceitar.**
   *
   * ## As lacunas viajam junto
   *
   * ADR pobre é o caso comum, e a tela precisa poder dizer *"esta decisão vem
   * sem o porquê"* antes de a pessoa aceitá-la. Calcular isso aqui evita que a
   * tela reimplemente a mesma conta (§263).
   */
  app.post("/quebras/:id/adr/importar", { preHandler: podeOperarNaQuebra }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const quebra = await casos.obter(id);
    if (!quebra) return reply.code(404).send({ erro: "quebra não encontrada" });

    const config = normalizarExportador(
      (await criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db)).obter("exportador", { endpoint: "", rotulo: "", cabecalhos: {} }))
        .documento
    );
    const destinos = destinosDaOperacao(config, "adr");
    if (destinos.length === 0) {
      return reply.code(409).send({
        erro: "nenhum destino de ADR configurado — cadastre o endereço em Configurações → Exportação, em “Outros destinos”",
      });
    }

    const agora = new Date().toISOString();
    const jaTem = new Set((quebra.decisoes ?? []).map((d) => d.importadoDe).filter(Boolean));
    const decisoes = (await criarLeitorDeAdrViaGateway(destinos[0]).listar())
      .map((adr) => comoDecisao(adr, agora))
      // O que já foi importado não volta na lista: reimportar criaria uma
      // segunda cópia da mesma decisão da casa, com outro id, e a partir daí
      // ninguém sabe qual é a original.
      .filter((d) => !jaTem.has(d.importadoDe))
      .map((d) => ({ decisao: d, lacunas: lacunasDaDecisaoImportada(d) }));

    return { decisoes, origem: destinos[0].rotulo || destinos[0].endpoint };
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
