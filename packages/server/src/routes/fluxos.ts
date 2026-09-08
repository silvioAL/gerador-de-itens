import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import {
  CAMPO_GLOBAL,
  aplicarRespostasNaDemanda,
  contextoDoProdutoEmTexto,
  contextoEpicoCompleto,
  correrPapelPelaFila,
  criarCasosDeUsoDeConfig,
  criarCasosDeUsoDeItensGerados,
  criarCasosDeUsoDeQuebras,
  demandaAtiva,
  erroSemDemanda,
  executarFluxo,
  executarFuncao,
  filaDaEsteiraDaDemanda,
  fluxosEmVigor,
  mensagemDeCiclo,
  normalizarExportador,
  normalizarPipelineAgentes,
  preambuloDoPapel,
  problemaNaSaidaDaTela,
  telasEmVigor,
  type TelaEmVigor,
  resultadoDaExportacao,
  saidaDoProjeto,
  sanearCamposDaTransformacao,
  transformarEntradas,
  varianteProposta,
  type ContextoDasFuncoes,
  type Fluxo,
  type ItemDaFilaDaEsteira,
  type RastroDoNo,
} from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { criarRepositorioDeItensGeradosEmPostgres } from "../adaptadores/itensGeradosEmPostgres.js";
import { criarRepositorioDeProdutosEmPostgres } from "../adaptadores/produtosEmPostgres.js";
import { criarRepositorioDeQuebrasEmPostgres } from "../adaptadores/quebrasEmPostgres.js";
import { executarConector } from "../adaptadores/executorDeConector.js";
// SPEC-110 fatia D — o executor do conector de BANCO (pg, read-only).
import { executarConsulta } from "../adaptadores/executorDeConsulta.js";
import { criarCofreInfisical, opcoesDoAmbiente } from "../adaptadores/cofreInfisical.js";
import { exigirNivel, maiorNivel, nivelNoTime } from "../auth/niveis.js";
import { organizacaoPadraoDe, recursosCurados, resolverPermissoes } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";
import { catalogoDeConectores } from "../config/catalogoDeConectores.js";
import { contextoDasFuncoes } from "../config/contextoDasFuncoes.js";
import { templateDaVersao } from "../config/templateDaVersao.js";
import { criarResolvedorDeProvedor } from "../ia/provedorDaOrganizacao.js";
import { fluxoExecucoes, quebras } from "../db/schema.js";
// SPEC-110 fatia E — o relogio: sincronizar o desenho e reservar os vencidos.
import { desativarAgendamento, reservarVencidos, sincronizarAgendamentos } from "../fluxos/agendamentos.js";
import { exigirSessao } from "../auth/middleware.js";

/**
 * SPEC-105 fatia D — **a execução do fluxo, do lado que tem rede.**
 *
 * A ordem, o mapeamento e a política de falha (§9.3) são da aplicação
 * (`executarFluxo`); aqui mora o que só o servidor tem: o catálogo resolvido,
 * a credencial de IA e o rastro no banco. **O executor é do servidor** (§7) —
 * o `cabecalhos` de um conector nunca chega ao navegador.
 *
 * ## O portão (§9.1)
 *
 * Executar age no mundo. O portão base é nível `operar` — o mesmo de
 * exportar/publicar, que também agem no mundo. Por cima, o recurso
 * `"fluxos.executar"`: quando ALGUM papel da organização o carrega, só o
 * grant dispara — a inversão da curadoria (`exigirEdicaoCurada`), aplicada a
 * execução. Sem papel nenhum com o recurso, o nível basta: racionar o
 * trabalho do dia é o efeito perverso que `RECURSOS_SEM_ROTA` documenta em
 * `quebras`.
 */
export async function registrarRotasFluxos(app: FastifyInstance, { db, diretorioConfig }: OpcoesApp) {
  const casos = criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db));
  const organizacaoPadrao = organizacaoPadraoDe(db);
  /**
   * SPEC-110 fatia D — o cofre, UMA instância (ele cacheia o token de acesso,
   * como em `provedorDaOrganizacao`). Ausente quando a instalação não tem
   * cofre: o conector de banco então falha NOMEANDO, em vez de tentar ler uma
   * connection string que não existe.
   */
  const opcoesDoCofre = opcoesDoAmbiente();
  const cofre = opcoesDoCofre ? criarCofreInfisical(opcoesDoCofre) : null;
  const resolverProvedor = criarResolvedorDeProvedor(db);

  /**
   * SPEC-110 fatia E — quem o histórico registra quando quem dispara é o
   * RELÓGIO. Um e-mail reconhecível e não uma string vazia: a auditoria
   * pergunta "quem fez?", e "ninguém" não é resposta.
   */
  const EMAIL_DO_RELOGIO = "agendamento@gerador.local";

  const timeDoCorpo = (req: FastifyRequest) => ((req.body ?? {}) as { timeId?: string }).timeId ?? null;

  /** JSON com chaves ordenadas — o hash não pode mudar porque a UI serializou
   * o mesmo fluxo noutra ordem (mesma razão do `canonico` das permissões). */
  function canonico(valor: unknown): string {
    if (valor === null || typeof valor !== "object") return JSON.stringify(valor ?? null);
    if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
    const chaves = Object.keys(valor as Record<string, unknown>).sort();
    return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonico((valor as Record<string, unknown>)[k])}`).join(",")}}`;
  }

  /** §9.5 — a impressão digital do fluxo que rodou. 16 hex bastam para
   * distinguir edições; não é segurança, é identidade. */
  const hashDoFluxo = (fluxo: Fluxo) => createHash("sha256").update(canonico(fluxo)).digest("hex").slice(0, 16);

  /** Os fluxos EM VIGOR do time: declarados + as derivadas (a esteira, dos
   * papéis; a exportação, do destino de itens — SPEC-107 G1). Resolvido AQUI
   * (§263): a tela, o mapa e o executor leem a mesma soma. */
  async function emVigor(timeId?: string) {
    const [fluxosDoc, pipelineDoc, exportadorDoc, telasDoc] = await Promise.all([
      casos.obter("fluxos", await templateDaVersao("fluxos", diretorioConfig), timeId),
      casos.obter("pipeline-agentes", await templateDaVersao("pipeline-agentes", diretorioConfig), timeId),
      casos.obter("exportador", await templateDaVersao("exportador", diretorioConfig)),
      // SPEC-110 fatia C — as telas DO TIME entram no mesmo em-vigor: quem
      // resolve uma tela não pergunta se ela é do sistema ou do time.
      casos.obter("telas", await templateDaVersao("telas", diretorioConfig), timeId),
    ]);
    const { papeis } = normalizarPipelineAgentes(pipelineDoc.documento);
    return {
      fluxos: fluxosEmVigor(papeis, fluxosDoc.documento, normalizarExportador(exportadorDoc.documento)),
      papeis,
      telas: telasEmVigor(telasDoc.documento),
    };
  }

  // Leitura aberta, como `GET /conectores`: a fiação é vocabulário do
  // maquinário — e é aqui que a tela vê a esteira derivada sem ninguém copiar.
  app.get("/fluxos", async (req) => {
    const { timeId } = req.query as { timeId?: string };
    return { fluxos: (await emVigor(timeId)).fluxos };
  });

  /**
   * SPEC-106 fatia E — a última execução de cada fluxo, MOLDADA para o mapa:
   * só estados (nunca o erro inteiro nem saídas), pela mesma régua de
   * `/ia/execucoes` — aberta porque responde "o maquinário está de pé?".
   */
  app.get("/fluxos/execucoes/ultimas", async () => {
    const linhas = await db
      .selectDistinctOn([fluxoExecucoes.fluxoId])
      .from(fluxoExecucoes)
      .orderBy(fluxoExecucoes.fluxoId, desc(fluxoExecucoes.em));
    return {
      ultimas: linhas.map((linha) => {
        const nos = linha.nos as RastroDoNo[];
        const comFalha = nos.find((n) => n.estado === "falhou");
        return {
          fluxoId: linha.fluxoId,
          em: linha.em,
          ok: !comFalha && nos.every((n) => n.estado === "sucesso"),
          ...(comFalha ? { noComFalha: comFalha.noId } : {}),
        };
      }),
    };
  });

  /** A camada de curadoria da execução (ver o comentário do arquivo) — a
   * mesma para disparar E para continuar: continuar é disparar o resto. */
  async function execucaoRestritaPara(email: string, timeId?: string): Promise<boolean> {
    const orgId = await organizacaoPadrao();
    if (!orgId || !(await recursosCurados(db, orgId)).includes("fluxos.executar")) return false;
    const { porRecurso } = await resolverPermissoes(db, orgId, email, timeId ?? null);
    return !porRecurso["fluxos.executar"]?.includes("editar");
  }

  /**
   * Os executores de um fluxo, num lugar só (§263): o Executar e o Continuar
   * (fatia C) rodam pelos MESMOS — dois mapas divergiriam no primeiro nó novo.
   */
  function criarExecutores(opcoes: {
    fluxo: Fluxo;
    papeis: ReturnType<typeof normalizarPipelineAgentes>["papeis"];
    catalogo: Awaited<ReturnType<typeof catalogoDeConectores>>;
    provedor: Awaited<ReturnType<ReturnType<typeof criarResolvedorDeProvedor>>>;
    timeId: string | undefined;
    email: string;
    /** SPEC-107 fatia D — o texto do agente streamando, POR NÓ (§2.4-9). */
    aoVivo?: { texto(noId: string, pedaco: string): void };
  }) {
    const { fluxo, papeis, catalogo, provedor, timeId, email, aoVivo } = opcoes;
    // O vocabulário do time (diagrama + campos + regras + tokens) só é montado
    // se o fluxo TEM nó de função — e uma vez por execução: montar por nó
    // abriria a porta para dois nós derivarem com vocabulários diferentes.
    let contextoFuncoes: ContextoDasFuncoes | null = null;
    const contextoDeFuncao = async () =>
      (contextoFuncoes ??= await contextoDasFuncoes(db, diretorioConfig, timeId));

    return {
        conector: async (no, parametros) => {
          const conector = catalogo.find((c) => c.id === no.refId);
          if (!conector) throw new Error(`não conheço o conector "${no.refId}" — veja GET /conectores`);
          /**
           * SPEC-110 fatia D — o TRANSPORTE decide o executor: HTTP fala rede,
           * banco fala driver. O contrato do nó (entrada/saída declaradas) é o
           * mesmo nos dois — quem fia não precisa saber qual é qual.
           */
          const { saida, ausentes } =
            conector.tipo === "banco"
              ? await executarConsulta(conector, parametros, cofre)
              : await executarConector(conector, parametros);
          if (ausentes.length > 0) {
            // §9.3 — o que o próximo nó receberia como "vazio plausível" para
            // aqui, com o nome do que faltou.
            throw new Error(`a resposta não trouxe ${ausentes.map((a) => `"${a}"`).join(", ")} — obrigatório ausente não vira default`);
          }
          return saida;
        },
        agente: async (no, entradas) => {
          const papel = papeis.find((p) => p.id === no.refId);
          if (!papel) throw new Error(`não conheço o papel "${no.refId}" na esteira deste time`);
          if (!provedor) throw new Error("IA não configurada — cadastre a credencial do gateway");
          if (Object.keys(entradas).length === 0) {
            throw new Error("nenhuma entrada chegou a este agente — entrada ausente não vira default (§9.3)");
          }
          /**
           * SPEC-107 G5 — **o modo PIPELINE**: quando a FILA de itens chega
           * pela aresta, o agente corre o papel dele como a revisão sempre
           * correu — lotes de 5, o pedido do `montarPedidoPipeline`, o
           * esquema item→campo — pelo MESMO funil (`completarEstruturado`)
           * da rota `/ia/pipeline/:papel`. É o que torna a prova da
           * SPEC-105 F ("resultado idêntico item a item") possível: o dublê
           * semeia pela letra do prompt, e a letra é uma só (§263).
           *
           * A fila segue adiante com as acumuladas; `respostasItens` agrega
           * o que os papéis anteriores já escreveram nesta execução.
           */
          if (entradas.fila !== undefined) {
            const fila = entradas.fila as ItemDaFilaDaEsteira[];
            const ativos = papeis.filter((p) => p.ativo);
            const corrida = await correrPapelPelaFila({
              papel,
              papeisAtivos: ativos,
              fila,
              contextoEpico: entradas.contextoEpico as string | undefined,
              contextoDoProduto: entradas.contextoDoProduto as string | undefined,
              completarEstruturado: (prompt, esquema) =>
                provedor.completarEstruturado(prompt, esquema as never, {
                  onTexto: (pedaco: string) => aoVivo?.texto(no.id, pedaco),
                }),
            });
            // Falha TOTAL derruba o nó com o motivo; falha parcial segue,
            // nomeada no rastro — a mesma régua da esteira (§193).
            if (corrida.falhas.length > 0 && Object.keys(corrida.respostasPorItem).length === 0) {
              throw new Error(`o papel "${papel.nome}" falhou em todos os lotes: ${corrida.falhas[0].mensagem}`);
            }
            const anteriores = (entradas.respostasItens ?? {}) as Record<string, Record<string, string>>;
            const respostasItens: Record<string, Record<string, string>> = { ...anteriores };
            for (const [item, campos] of Object.entries(corrida.respostasPorItem)) {
              respostasItens[item] = { ...(respostasItens[item] ?? {}), ...campos };
            }
            return {
              fila: corrida.fila,
              respostasItens,
              ...(entradas.contextoEpico !== undefined ? { contextoEpico: entradas.contextoEpico } : {}),
              ...(entradas.contextoDoProduto !== undefined ? { contextoDoProduto: entradas.contextoDoProduto } : {}),
              ...(corrida.falhas.length > 0 ? { falhas: corrida.falhas } : {}),
            };
          }
          const prompt = [
            preambuloDoPapel(no.refId, papeis),
            "",
            "O que chegou dos passos anteriores deste fluxo:",
            ...Object.entries(entradas).map(([chave, valor]) =>
              `- ${chave}: ${typeof valor === "string" ? valor : JSON.stringify(valor)}`.slice(0, 4000)
            ),
            "",
            "Produza o artefato que o seu papel pede a partir dessas entradas. Responda só com o artefato, sem comentários.",
          ].join("\n");
          // O `onTexto` é a técnica do `executarPedido` (routes/ia.ts), por
          // nó: quem assiste ao fluxo vê o agente ESCREVENDO, como na revisão.
          const texto = await provedor.completar(prompt, {
            onTexto: (pedaco) => aoVivo?.texto(no.id, pedaco),
          });
          return { texto };
        },
        funcao: async (no, entradas) => executarFuncao(no.refId, entradas, await contextoDeFuncao()),
        /**
         * SPEC-107 fatia B — a demanda como capacidade, nas duas direções.
         * Sem `desenho` mapeado é FONTE; com, é DESTINO — e a escrita vira
         * VARIANTE (proposta), nunca o diagrama da demanda (§2.4-14).
         */
        projeto: async (_no, entradas) => {
          const casosQuebras = criarCasosDeUsoDeQuebras(criarRepositorioDeQuebrasEmPostgres(db));
          const demandaId =
            typeof entradas.demandaId === "string" && entradas.demandaId.trim() ? entradas.demandaId.trim() : null;

          let quebra;
          if (demandaId) {
            quebra = await casosQuebras.obter(demandaId);
            if (!quebra) throw new Error(`não conheço a demanda "${demandaId}"`);
          } else {
            // A "ativa" que o servidor consegue afirmar: a mais recentemente
            // atualizada do time da execução (o aberto-agora é do navegador).
            const ativa = demandaAtiva(await casosQuebras.listar(), timeId);
            if (!ativa) throw erroSemDemanda(timeId);
            quebra = (await casosQuebras.obter(ativa.id))!;
          }

          if (entradas.linkExterno !== undefined) {
            // SPEC-107 G2 — DESTINO de PUBLICAÇÃO: o link do que subiu volta
            // para a DEMANDA (SPEC-106 C) — "última publicação ↗" sobrevive
            // ao F5 e à troca de máquina.
            const nivel = quebra.time ? await nivelNoTime(db, email, quebra.time) : await maiorNivel(db, email);
            if (nivel !== "operar" && nivel !== "owner") {
              throw new Error(
                `gravar a publicação na demanda "${quebra.id}" exige nível "operar" no time "${quebra.time ?? "(sem time)"}" — seu nível é "${nivel ?? "nenhum"}"`
              );
            }
            const linkExterno = String(entradas.linkExterno);
            await db.update(quebras).set({ documentoLinkExterno: linkExterno }).where(eq(quebras.id, quebra.id));
            registrarAuditoria(db, { email, acao: "publicar-documento", recurso: "quebras", recursoId: quebra.id });
            return { demandaId: quebra.id, linkExterno };
          }

          if (entradas.resultados !== undefined) {
            // SPEC-107 G1 — DESTINO de EXPORTAÇÃO: o retorno do tracker, por
            // item. Quem subiu grava `exportado`+link; quem falhou (ou ficou
            // sem resposta) sai nomeado — a disciplina da SPEC-49, na fiação.
            const nivel = quebra.time ? await nivelNoTime(db, email, quebra.time) : await maiorNivel(db, email);
            if (nivel !== "operar" && nivel !== "owner") {
              throw new Error(
                `gravar a exportação na demanda "${quebra.id}" exige nível "operar" no time "${quebra.time ?? "(sem time)"}" — seu nível é "${nivel ?? "nenhum"}"`
              );
            }
            const { paraGravar, erros } = resultadoDaExportacao(entradas.resultados, entradas.enviados);
            const repoItens = criarRepositorioDeItensGeradosEmPostgres(db);
            const exportados: string[] = [];
            for (const item of paraGravar) {
              const salvo = await repoItens.marcarExportado(quebra.id, item.chave, item.linkExterno);
              if (salvo) exportados.push(item.chave);
            }
            registrarAuditoria(db, { email, acao: "exportar", recurso: "itens_gerados", recursoId: quebra.id });
            return { demandaId: quebra.id, exportados, erros };
          }

          if (entradas.respostasItens !== undefined) {
            /**
             * SPEC-107 G5 — DESTINO da esteira: o que a corrida escreveu
             * entra na demanda como SUGESTÃO pendente (§5.5, decidida pelo
             * usuário: o julgamento fica NA DEMANDA) — `origem: "sugerido"`,
             * `confirmado: false`, e NUNCA por cima do que alguém confirmou.
             */
            const nivel = quebra.time ? await nivelNoTime(db, email, quebra.time) : await maiorNivel(db, email);
            if (nivel !== "operar" && nivel !== "owner") {
              throw new Error(
                `gravar as sugestões da esteira na demanda "${quebra.id}" exige nível "operar" no time "${quebra.time ?? "(sem time)"}" — seu nível é "${nivel ?? "nenhum"}"`
              );
            }
            const { respostasItens, aplicadas, preservadas } = aplicarRespostasNaDemanda(
              quebra.respostasItens,
              entradas.respostasItens as Record<string, Record<string, string>>
            );
            // Read-modify-write da quebra INTEIRA, como os outros destinos:
            // `atualizar` normaliza o documento completo.
            await casosQuebras.atualizar(quebra.id, { ...quebra, respostasItens });
            registrarAuditoria(db, { email, acao: "atualizar", recurso: "quebras", recursoId: quebra.id });
            return { demandaId: quebra.id, aplicadas, preservadas };
          }

          if (entradas.desenho !== undefined) {
            // DESTINO. O gate da rota cobre o time do CORPO; a quebra que o
            // `demandaId` aponta pode ser de outro — re-checa no time DELA.
            const nivel = quebra.time ? await nivelNoTime(db, email, quebra.time) : await maiorNivel(db, email);
            if (nivel !== "operar" && nivel !== "owner") {
              throw new Error(
                `escrever uma proposta na demanda "${quebra.id}" exige nível "operar" no time "${quebra.time ?? "(sem time)"}" — seu nível é "${nivel ?? "nenhum"}"`
              );
            }
            const variante = varianteProposta(entradas.desenho, fluxo, `proposta-${randomUUID().slice(0, 8)}`, new Date().toISOString());
            // Read-modify-write da quebra INTEIRA: `atualizar` normaliza o
            // documento completo — mandar só `variantes` apagaria o resto.
            await casosQuebras.atualizar(quebra.id, { ...quebra, variantes: [...(quebra.variantes ?? []), variante] });
            registrarAuditoria(db, { email, acao: "atualizar", recurso: "quebras", recursoId: quebra.id });
            return { demandaId: quebra.id, varianteId: variante.id, titulo: variante.titulo };
          }

          const itens = await criarCasosDeUsoDeItensGerados(criarRepositorioDeItensGeradosEmPostgres(db)).listarDaQuebra(quebra.id);
          /**
           * SPEC-107 G5 — a FONTE também emite a fila da esteira e os
           * contextos, montados com o MESMO motor da revisão (derivar →
           * fichas → fila; contexto do épico + do produto). §9.3: o que a
           * demanda não tem fica FORA da saída.
           */
          const ctx = await contextoDeFuncao();
          const ativos = papeis.filter((p) => p.ativo);
          const contextoEpico = contextoEpicoCompleto(quebra.demandInfo, quebra.anexosContexto);
          const produto = quebra.produtoId
            ? await criarRepositorioDeProdutosEmPostgres(db).obter(quebra.produtoId)
            : null;
          const contextoDoProduto = produto ? contextoDoProdutoEmTexto(produto) || undefined : undefined;
          return {
            ...saidaDoProjeto(quebra, itens),
            filaDaEsteira: filaDaEsteiraDaDemanda(quebra, {
              diagramaConfig: ctx.diagramaConfig,
              regrasConfig: ctx.regrasConfig,
              tokens: ctx.tokens,
              papeisAtivos: ativos,
            }),
            ...(contextoEpico !== undefined ? { contextoEpico } : {}),
            ...(contextoDoProduto !== undefined ? { contextoDoProduto } : {}),
          };
        },
        // SPEC-107 fatia E — pura, em processo: re-mapeia/extrai/concatena o
        // que chegou, pelos campos declarados no nó.
        transformacao: async (no, entradas) =>
          transformarEntradas(sanearCamposDaTransformacao((no.parametros as { campos?: unknown }).campos), entradas),
    } satisfies Parameters<typeof executarFluxo>[1];
  }

  /**
   * SPEC-107 fatia D — **o escritor de NDJSON, na técnica do `executarPedido`**
   * (routes/ia.ts): o `writeHead` é ADIADO até o primeiro evento (falha antes
   * do primeiro byte ainda vira status HTTP com motivo), e os headers já
   * montados são COPIADOS — sem `reply.getHeaders()`, os de CORS somem e o
   * navegador bloqueia a leitura (achado real, documentado lá).
   */
  function escritorDeEventos(reply: FastifyReply) {
    let comecou = false;
    return {
      comecou: () => comecou,
      escrever(evento: Record<string, unknown>) {
        if (!comecou) {
          comecou = true;
          reply.raw.writeHead(200, {
            ...(reply.getHeaders() as Record<string, string>),
            "content-type": "application/x-ndjson; charset=utf-8",
          });
        }
        reply.raw.write(`${JSON.stringify(evento)}\n`);
      },
    };
  }

  app.post("/fluxos/:id/executar", { preHandler: exigirNivel(db, "operar", timeDoCorpo) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { ateNo, aoVivo, parametrosPorNo } = (req.body ?? {}) as {
      ateNo?: string;
      aoVivo?: boolean;
      /**
       * SPEC-107 G1 — parâmetros DESTA execução, por nó (o atalho da tela
       * aponta a demanda ABERTA sem congelar nada na fiação). São entradas da
       * execução, não edição do fluxo: o hash (§9.5) continua o da fiação.
       */
      parametrosPorNo?: Record<string, Record<string, unknown>>;
    };
    const timeId = timeDoCorpo(req) ?? undefined;
    const email = req.usuario!.email;

    if (await execucaoRestritaPara(email, timeId)) {
      return reply.code(403).send({
        erro: `a execução de fluxos está restrita — disparar exige o papel com "fluxos.executar"`,
        recurso: "fluxos.executar",
        acao: "editar",
      });
    }

    // Do EM VIGOR, não só dos declarados: a esteira derivada também executa.
    const { fluxos, papeis } = await emVigor(timeId);
    const fluxoEmVigorAchado = fluxos.find((f) => f.id === id);
    if (!fluxoEmVigorAchado) return reply.code(404).send({ erro: `não conheço o fluxo "${id}" neste time` });
    if (ateNo && !fluxoEmVigorAchado.nos.some((no) => no.id === ateNo)) {
      return reply.code(404).send({ erro: `o fluxo "${id}" não tem o nó "${ateNo}"` });
    }
    for (const noId of Object.keys(parametrosPorNo ?? {})) {
      if (!fluxoEmVigorAchado.nos.some((no) => no.id === noId)) {
        return reply.code(404).send({ erro: `o fluxo "${id}" não tem o nó "${noId}" (parametrosPorNo)` });
      }
    }
    // Os parâmetros da chamada entram POR CIMA dos fixos do nó — o hash
    // continua sendo o da fiação (a identidade), não o da execução.
    const fluxo: Fluxo = parametrosPorNo
      ? {
          ...fluxoEmVigorAchado,
          nos: fluxoEmVigorAchado.nos.map((no) =>
            parametrosPorNo[no.id] ? { ...no, parametros: { ...no.parametros, ...parametrosPorNo[no.id] } } : no
          ),
        }
      : fluxoEmVigorAchado;

    const [catalogo, provedor] = await Promise.all([catalogoDeConectores(db, diretorioConfig), resolverProvedor()]);

    // Fatia D — com `aoVivo`, a resposta vira um stream de eventos por nó.
    const eventos = aoVivo ? escritorDeEventos(reply) : null;

    let resultado;
    try {
      resultado = await executarFluxo(
        fluxo,
        criarExecutores({
          fluxo,
          papeis,
          catalogo,
          provedor,
          timeId,
          email,
          ...(eventos ? { aoVivo: { texto: (noId, pedaco) => eventos.escrever({ tipo: "texto", noId, pedaco }) } } : {}),
        }),
        {
          ateNo,
          ...(eventos
            ? {
                aoVivo: {
                  noComecou: (no) => eventos.escrever({ tipo: "no-comecou", noId: no.id }),
                  noTerminou: (rastro) => eventos.escrever({ tipo: "no-terminou", rastro }),
                },
              }
            : {}),
        }
      );
    } finally {
      await provedor?.descartar().catch(() => undefined);
    }

    // Ciclo é RECUSA, não falha parcial — e a mensagem é a do desenho (§4.4).
    if (resultado.ciclo) return reply.code(409).send({ erro: mensagemDeCiclo(resultado.ciclo) });

    // §9.5 — a identidade é a da FIAÇÃO em vigor, não a da execução: os
    // parametrosPorNo são entrada, e entrada de nó de função já fica no rastro.
    const hash = hashDoFluxo(fluxoEmVigorAchado);
    // O rastro persiste SEM as saídas (ver o comentário da tabela) — EXCETO
    // quando a execução SUSPENDE num gate (fatia C): a suspensa guarda as
    // saídas até alguém continuar/descartar, porque elas são o stage a
    // revisar e o que a retomada usa para não reexecutar ninguém.
    //
    // SPEC-110 fatia B — a TELA é a outra suspensão, pelo MESMO caminho: o
    // estado diz qual das duas é, e o stage guardado é o mesmo dado.
    const estadoSuspenso = resultado.aguardandoEm
      ? "aguardando-confirmacao"
      : resultado.aguardandoTela
        ? "aguardando-tela"
        : null;
    const [linha] = await db
      .insert(fluxoExecucoes)
      .values({
        fluxoId: id,
        timeId: timeId ?? CAMPO_GLOBAL,
        hash,
        email,
        nos: resultado.nos,
        ...(estadoSuspenso ? { estado: estadoSuspenso, saidas: resultado.saidas, ateNo: ateNo ?? null } : {}),
      })
      .returning({ id: fluxoExecucoes.id });
    registrarAuditoria(db, { email, acao: "executar", recurso: "fluxos", recursoId: id });

    const resposta = {
      fluxo: id,
      execucaoId: linha.id,
      hash,
      nos: resultado.nos,
      saidas: resultado.saidas,
      ...(resultado.aguardandoEm ? { aguardandoEm: resultado.aguardandoEm } : {}),
      ...(resultado.aguardandoTela ? { aguardandoTela: resultado.aguardandoTela } : {}),
    };
    // No modo ao vivo o "fim" fecha o stream com a MESMA resposta do modo
    // one-shot — quem consome os dois caminhos lê a mesma forma no final.
    if (eventos) {
      eventos.escrever({ tipo: "fim", resposta });
      reply.raw.end();
      return;
    }
    return resposta;
  });

  /**
   * SPEC-107 fatia C (§5.5) — **continuar uma execução suspensa no gate.**
   *
   * O nível é checado no time DA EXECUÇÃO (não no corpo): continuar é
   * disparar o resto, de qualquer máquina — é isso que torna o gate um ponto
   * de revisão de verdade, não um estado preso na aba de quem executou.
   */
  app.post("/fluxos/execucoes/:id/continuar", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const email = req.usuario!.email;

    const [execucao] = await db.select().from(fluxoExecucoes).where(eq(fluxoExecucoes.id, id)).limit(1);
    if (!execucao) return reply.code(404).send({ erro: `não conheço a execução "${id}"` });
    // SPEC-110 fatia B — as DUAS suspensões continuam pelo mesmo endpoint
    // ("continuar é disparar o resto"); o que muda é o que a retomada leva.
    if (execucao.estado !== "aguardando-confirmacao" && execucao.estado !== "aguardando-tela") {
      return reply.code(409).send({ erro: `esta execução não está aguardando confirmação (estado: ${execucao.estado})` });
    }

    const timeId = execucao.timeId === CAMPO_GLOBAL ? undefined : execucao.timeId;
    const nivel = timeId ? await nivelNoTime(db, email, timeId) : await maiorNivel(db, email);
    if (nivel !== "operar" && nivel !== "owner") {
      return reply.code(403).send({
        erro: `continuar esta execução exige nível "operar" no time "${timeId ?? "(global)"}" — seu nível é "${nivel ?? "nenhum"}"`,
      });
    }
    if (await execucaoRestritaPara(email, timeId)) {
      return reply.code(403).send({
        erro: `a execução de fluxos está restrita — continuar exige o papel com "fluxos.executar"`,
        recurso: "fluxos.executar",
        acao: "editar",
      });
    }

    const { fluxos, papeis, telas } = await emVigor(timeId);
    const fluxo = fluxos.find((f) => f.id === execucao.fluxoId);
    if (!fluxo) {
      return reply.code(409).send({ erro: `o fluxo "${execucao.fluxoId}" não existe mais neste time — descarte esta execução` });
    }
    // §9.5 — o hash é a identidade da fiação que SUSPENDEU. Continuar sobre
    // uma fiação editada tornaria o rastro ambíguo: recusa, com o caminho.
    if (hashDoFluxo(fluxo) !== execucao.hash) {
      return reply.code(409).send({
        erro: "o fluxo mudou desde a suspensão — descarte esta execução e execute de novo",
      });
    }

    const rastroParcial = execucao.nos as RastroDoNo[];
    const concluidos = rastroParcial.filter((n) => n.estado === "sucesso").map((n) => n.noId);
    const saidasSuspensas = (execucao.saidas ?? {}) as Record<string, Record<string, unknown>>;

    /**
     * SPEC-110 fatia B (D2) — **o Avançar de uma tela.** A execução parou NUM
     * nó de tela e o corpo traz o que a pessoa decidiu. Duas guardas antes de
     * gravar: a tela precisa existir na fiação em vigor, e a saída precisa
     * honrar o contrato DELA — o nó seguinte receberia um "vazio plausível"
     * de outro jeito, que é o silêncio que a §9.3 recusa.
     */
    const [catalogo, provedor] = await Promise.all([catalogoDeConectores(db, diretorioConfig), resolverProvedor()]);

    let saidaDaTela: { noId: string; saida: Record<string, unknown> } | undefined;
    if (execucao.estado === "aguardando-tela") {
      const corpo = (req.body ?? {}) as { saidaDaTela?: Record<string, unknown> };
      // Descobrir QUAL tela sem recalcular mapeamento à mão (§263): o mesmo
      // executor, sem decisão, para de novo exatamente onde parou. Nenhum
      // executor de nó roda — os concluídos são pulados e o laço quebra na
      // tela; é sondagem, não execução.
      const parada = await executarFluxo(fluxo, criarExecutores({ fluxo, papeis, catalogo, provedor, timeId, email }), {
        ateNo: execucao.ateNo ?? undefined,
        retomarDe: { saidas: saidasSuspensas, concluidos },
      });
      const naTela = parada.aguardandoTela;
      if (!naTela) {
        return reply.code(409).send({ erro: "esta execução não está parada numa tela — descarte e execute de novo" });
      }
      if (!corpo.saidaDaTela) {
        return reply.code(400).send({
          erro: `a tela "${naTela.noId}" precisa da decisão de quem revisou — mande "saidaDaTela" com "decisao"`,
        });
      }
      const tela = telas.find((t: TelaEmVigor) => t.refId === naTela.refId);
      if (!tela) return reply.code(409).send({ erro: `não conheço a tela "${naTela.refId}"` });
      const problema = problemaNaSaidaDaTela(tela, corpo.saidaDaTela);
      if (problema) return reply.code(400).send({ erro: problema });
      // Retornar tem endpoint próprio: aqui só avança (D2 — retornar ENCERRA).
      if (corpo.saidaDaTela.decisao !== "avancar") {
        return reply.code(400).send({ erro: `para retornar use POST /fluxos/execucoes/${id}/retornar` });
      }
      saidaDaTela = { noId: naTela.noId, saida: corpo.saidaDaTela };
    }

    // Fatia D — continuar também é assistível: o resto roda ao vivo.
    const eventos = (req.body as { aoVivo?: boolean } | null)?.aoVivo ? escritorDeEventos(reply) : null;
    let resultado;
    try {
      resultado = await executarFluxo(
        fluxo,
        criarExecutores({
          fluxo,
          papeis,
          catalogo,
          provedor,
          timeId,
          email,
          ...(eventos ? { aoVivo: { texto: (noId, pedaco) => eventos.escrever({ tipo: "texto", noId, pedaco }) } } : {}),
        }),
        {
          ateNo: execucao.ateNo ?? undefined,
          retomarDe: { saidas: saidasSuspensas, concluidos, ...(saidaDaTela ? { saidaDaTela } : {}) },
          ...(eventos
            ? {
                aoVivo: {
                  noComecou: (no) => eventos.escrever({ tipo: "no-comecou", noId: no.id }),
                  noTerminou: (rastro) => eventos.escrever({ tipo: "no-terminou", rastro }),
                },
              }
            : {}),
        }
      );
    } finally {
      await provedor?.descartar().catch(() => undefined);
    }

    const nosCompletos = [...rastroParcial, ...resultado.nos];
    // SPEC-110 fatia B — a retomada pode parar DE NOVO, num gate ou noutra
    // tela: vários pontos de revisão numa fiação são vários (§5.5).
    const estadoDepois = resultado.aguardandoEm
      ? "aguardando-confirmacao"
      : resultado.aguardandoTela
        ? "aguardando-tela"
        : null;
    await db
      .update(fluxoExecucoes)
      .set({
        nos: nosCompletos,
        ...(estadoDepois
          ? { estado: estadoDepois, saidas: { ...saidasSuspensas, ...resultado.saidas } }
          : { estado: "concluida", saidas: null }),
      })
      .where(eq(fluxoExecucoes.id, id));
    registrarAuditoria(db, { email, acao: "executar", recurso: "fluxos", recursoId: execucao.fluxoId });

    const resposta = {
      fluxo: execucao.fluxoId,
      execucaoId: id,
      hash: execucao.hash,
      nos: nosCompletos,
      saidas: { ...saidasSuspensas, ...resultado.saidas },
      ...(resultado.aguardandoEm ? { aguardandoEm: resultado.aguardandoEm } : {}),
      ...(resultado.aguardandoTela ? { aguardandoTela: resultado.aguardandoTela } : {}),
    };
    if (eventos) {
      eventos.escrever({ tipo: "fim", resposta });
      reply.raw.end();
      return;
    }
    return resposta;
  });

  /**
   * SPEC-110 fatia B (D2) — **o stage de uma tela: o que ela vai mostrar.**
   *
   * Quem abre `#/tela/<execucaoId>` precisa das ENTRADAS do nó de tela. Elas
   * não são recalculadas aqui nem no navegador (§263): o MESMO `executarFluxo`
   * roda sem decisão e para exatamente onde parou, devolvendo `aguardandoTela`
   * com as entradas. Nenhum executor de nó é chamado — os concluídos são
   * pulados e o laço quebra na tela. É sondagem, não execução.
   */
  app.get("/fluxos/execucoes/:id/tela", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const email = req.usuario!.email;

    const [execucao] = await db.select().from(fluxoExecucoes).where(eq(fluxoExecucoes.id, id)).limit(1);
    if (!execucao) return reply.code(404).send({ erro: `não conheço a execução "${id}"` });
    if (execucao.estado !== "aguardando-tela") {
      return reply.code(409).send({ erro: `esta execução não está parada numa tela (estado: ${execucao.estado})` });
    }
    const timeId = execucao.timeId === CAMPO_GLOBAL ? undefined : execucao.timeId;
    const { fluxos, papeis, telas } = await emVigor(timeId);
    const fluxo = fluxos.find((f) => f.id === execucao.fluxoId);
    if (!fluxo) {
      return reply.code(409).send({ erro: `o fluxo "${execucao.fluxoId}" não existe mais neste time — descarte esta execução` });
    }
    const rastroParcial = execucao.nos as RastroDoNo[];
    const saidasSuspensas = (execucao.saidas ?? {}) as Record<string, Record<string, unknown>>;
    const [catalogo, provedor] = await Promise.all([catalogoDeConectores(db, diretorioConfig), resolverProvedor()]);
    let parada;
    try {
      parada = await executarFluxo(fluxo, criarExecutores({ fluxo, papeis, catalogo, provedor, timeId, email }), {
        ateNo: execucao.ateNo ?? undefined,
        retomarDe: {
          saidas: saidasSuspensas,
          concluidos: rastroParcial.filter((n) => n.estado === "sucesso").map((n) => n.noId),
        },
      });
    } finally {
      await provedor?.descartar().catch(() => undefined);
    }
    if (!parada.aguardandoTela) {
      return reply.code(409).send({ erro: "esta execução não está parada numa tela — descarte e execute de novo" });
    }
    const tela = telas.find((t: TelaEmVigor) => t.refId === parada.aguardandoTela!.refId);
    if (!tela) return reply.code(409).send({ erro: `não conheço a tela "${parada.aguardandoTela.refId}"` });
    const noDaTela = fluxo.nos.find((n) => n.id === parada.aguardandoTela!.noId);
    return {
      execucaoId: id,
      fluxoId: execucao.fluxoId,
      nome: fluxo.nome,
      timeId: timeId ?? null,
      // O nome do NÓ vence o da tela, como em todo cartão do canvas (§387).
      noId: parada.aguardandoTela.noId,
      nomeDoNo: noDaTela?.nome ?? null,
      tela: {
        id: tela.id,
        nome: tela.nome,
        descricao: tela.descricao,
        entrada: tela.entrada,
        saida: tela.saida,
        // SPEC-110 fatia C — a tela DECLARADA viaja com os blocos: é o que o
        // renderizador desenha. As do sistema não têm blocos — elas delegam
        // para a tela que já existe (a bancada, o documento, a mesa).
        origem: tela.origem,
        ...(tela.blocos ? { blocos: tela.blocos } : {}),
      },
      entradas: parada.aguardandoTela.entradas,
    };
  });

  /**
   * SPEC-110 fatia B (D2) — **Retornar: a execução acaba aqui.**
   *
   * A decisão de quem revisou é terminal de propósito: *"retornar re-rodar
   * automaticamente o nó anterior é dívida declarada, não v1"*. O canvas
   * mostra "retornado — ajuste e rode de novo", e quem ajusta dispara outra
   * execução, com o rastro da anterior preservado.
   */
  app.post("/fluxos/execucoes/:id/retornar", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const email = req.usuario!.email;

    const [execucao] = await db.select().from(fluxoExecucoes).where(eq(fluxoExecucoes.id, id)).limit(1);
    if (!execucao) return reply.code(404).send({ erro: `não conheço a execução "${id}"` });
    if (execucao.estado !== "aguardando-tela") {
      return reply.code(409).send({ erro: `só uma execução parada numa tela pode ser retornada (estado: ${execucao.estado})` });
    }
    const timeId = execucao.timeId === CAMPO_GLOBAL ? undefined : execucao.timeId;
    const nivel = timeId ? await nivelNoTime(db, email, timeId) : await maiorNivel(db, email);
    if (nivel !== "operar" && nivel !== "owner") {
      return reply.code(403).send({
        erro: `retornar esta execução exige nível "operar" no time "${timeId ?? "(global)"}" — seu nível é "${nivel ?? "nenhum"}"`,
      });
    }
    // As saídas somem como no descartar: o stage era para revisar, e a revisão
    // terminou. O rastro fica — é ele que diz até onde a execução chegou.
    await db.update(fluxoExecucoes).set({ estado: "retornada", saidas: null }).where(eq(fluxoExecucoes.id, id));
    registrarAuditoria(db, { email, acao: "executar", recurso: "fluxos", recursoId: execucao.fluxoId });
    return { ok: true, estado: "retornada" };
  });

  /** O outro lado do gate: quem revisa pode DESCARTAR — a execução fecha sem
   * o resto rodar, e as saídas suspensas somem (rastro não é armazém). */
  app.post("/fluxos/execucoes/:id/descartar", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const email = req.usuario!.email;

    const [execucao] = await db.select().from(fluxoExecucoes).where(eq(fluxoExecucoes.id, id)).limit(1);
    if (!execucao) return reply.code(404).send({ erro: `não conheço a execução "${id}"` });
    if (execucao.estado !== "aguardando-confirmacao") {
      return reply.code(409).send({ erro: `esta execução não está aguardando confirmação (estado: ${execucao.estado})` });
    }
    const timeId = execucao.timeId === CAMPO_GLOBAL ? undefined : execucao.timeId;
    const nivel = timeId ? await nivelNoTime(db, email, timeId) : await maiorNivel(db, email);
    if (nivel !== "operar" && nivel !== "owner") {
      return reply.code(403).send({
        erro: `descartar esta execução exige nível "operar" no time "${timeId ?? "(global)"}" — seu nível é "${nivel ?? "nenhum"}"`,
      });
    }

    await db.update(fluxoExecucoes).set({ estado: "descartada", saidas: null }).where(eq(fluxoExecucoes.id, id));
    registrarAuditoria(db, { email, acao: "executar", recurso: "fluxos", recursoId: execucao.fluxoId });
    return { ok: true };
  });

  /**
   * SPEC-110 fatia E (D7) — **o disparo pelo relógio**, num lugar só: o tick
   * do runner e o tick forçado da prova chamam ESTA função. Dois caminhos
   * divergiriam, e o E2E passaria a provar o que ninguém roda (§263).
   */
  async function dispararAgendamentosVencidos(agora = new Date()): Promise<{ disparados: number }> {
    const vencidos = await reservarVencidos(db, agora);
    let disparados = 0;
    for (const venc of vencidos) {
      const timeId = venc.timeId === CAMPO_GLOBAL ? undefined : venc.timeId;
      try {
        const { fluxos, papeis } = await emVigor(timeId);
        const fluxo = fluxos.find((f) => f.id === venc.fluxoId);
        // O fluxo pode ter sumido (o time apagou o declarado): o agendamento
        // órfão desativa em vez de tentar para sempre.
        if (!fluxo) {
          await desativarAgendamento(db, venc.id);
          continue;
        }
        const [catalogo, provedor] = await Promise.all([catalogoDeConectores(db, diretorioConfig), resolverProvedor()]);
        let resultado;
        try {
          resultado = await executarFluxo(
            fluxo,
            criarExecutores({ fluxo, papeis, catalogo, provedor, timeId, email: EMAIL_DO_RELOGIO }),
            // A ORIGEM é o que o histórico registra: sem isto, uma execução do
            // relógio seria indistinguível de alguém que apertou o botão.
            { origemDoDisparo: "agendamento" }
          );
        } finally {
          await provedor?.descartar().catch(() => undefined);
        }
        if (resultado.ciclo) continue;
        const estadoSuspenso = resultado.aguardandoEm
          ? "aguardando-confirmacao"
          : resultado.aguardandoTela
            ? "aguardando-tela"
            : null;
        await db.insert(fluxoExecucoes).values({
          fluxoId: venc.fluxoId,
          timeId: venc.timeId,
          hash: hashDoFluxo(fluxo),
          email: EMAIL_DO_RELOGIO,
          nos: resultado.nos,
          ...(estadoSuspenso ? { estado: estadoSuspenso, saidas: resultado.saidas } : {}),
        });
        registrarAuditoria(db, { email: EMAIL_DO_RELOGIO, acao: "executar", recurso: "fluxos", recursoId: venc.fluxoId });
        disparados++;
      } catch (erro) {
        // Um agendamento que explode não pode derrubar o tick dos outros — a
        // mesma regra 2 do executor de fluxo (§9.3), um nível acima.
        app.log.error({ erro, agendamento: venc.id }, "falha ao disparar agendamento");
      }
    }
    return { disparados };
  }

  /**
   * O TICK, a cada 30s. `unref()` para o processo não ficar preso ao timer no
   * desligamento — um servidor que não morre é pior que um tick perdido.
   */
  const relogio = setInterval(() => {
    void dispararAgendamentosVencidos().catch((erro) => app.log.error({ erro }, "tick de agendamentos falhou"));
  }, 30_000);
  relogio.unref();
  app.addHook("onClose", async () => clearInterval(relogio));

  /**
   * SPEC-110 fatia E — **o tick FORÇADO, só em `AUTH_MODE=dev`.**
   *
   * A prova de um relógio não pode depender de esperar o relógio: o E2E cria o
   * agendamento com a próxima ocorrência no passado, força o tick e vê a
   * execução no histórico com origem `agendamento`. Fora do modo dev a rota
   * não existe — um endpoint que dispara fluxos por HTTP sem sessão é
   * exatamente o que não se deixa num ambiente real.
   */
  if ((process.env.AUTH_MODE ?? "dev") === "dev") {
    app.post("/fluxos/agendamentos/tick", async () => dispararAgendamentosVencidos());
  }

  /** O rastro das últimas execuções — é o que torna o fluxo diagnosticável. */
  app.get("/fluxos/:id/execucoes", { preHandler: exigirSessao }, async (req) => {
    const { id } = req.params as { id: string };
    const linhas = await db
      .select()
      .from(fluxoExecucoes)
      .where(eq(fluxoExecucoes.fluxoId, id))
      .orderBy(desc(fluxoExecucoes.em))
      .limit(20);
    return { execucoes: linhas };
  });
}
