import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  CAMPO_GLOBAL,
  criarCasosDeUsoDeConfig,
  executarFluxo,
  fluxosEmVigor,
  mensagemDeCiclo,
  normalizarPipelineAgentes,
  preambuloDoPapel,
  type Fluxo,
  type RastroDoNo,
} from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { executarConector } from "../adaptadores/executorDeConector.js";
import { exigirNivel } from "../auth/niveis.js";
import { organizacaoPadraoDe, recursosCurados, resolverPermissoes } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";
import { catalogoDeConectores } from "../config/catalogoDeConectores.js";
import { templateDaVersao } from "../config/templateDaVersao.js";
import { criarResolvedorDeProvedor } from "../ia/provedorDaOrganizacao.js";
import { fluxoExecucoes } from "../db/schema.js";
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
  const resolverProvedor = criarResolvedorDeProvedor(db);

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

  /** Os fluxos EM VIGOR do time: declarados + a esteira derivada dos papéis.
   * Resolvido AQUI (§263): a tela, o mapa e o executor leem a mesma soma. */
  async function emVigor(timeId?: string) {
    const [fluxosDoc, pipelineDoc] = await Promise.all([
      casos.obter("fluxos", await templateDaVersao("fluxos", diretorioConfig), timeId),
      casos.obter("pipeline-agentes", await templateDaVersao("pipeline-agentes", diretorioConfig), timeId),
    ]);
    const { papeis } = normalizarPipelineAgentes(pipelineDoc.documento);
    return { fluxos: fluxosEmVigor(papeis, fluxosDoc.documento), papeis };
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

  app.post("/fluxos/:id/executar", { preHandler: exigirNivel(db, "operar", timeDoCorpo) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { ateNo } = (req.body ?? {}) as { ateNo?: string };
    const timeId = timeDoCorpo(req) ?? undefined;
    const email = req.usuario!.email;

    // A camada de curadoria da execução (ver o comentário do arquivo).
    const orgId = await organizacaoPadrao();
    if (orgId && (await recursosCurados(db, orgId)).includes("fluxos.executar")) {
      const { porRecurso } = await resolverPermissoes(db, orgId, email, timeId ?? null);
      if (!porRecurso["fluxos.executar"]?.includes("editar")) {
        return reply.code(403).send({
          erro: `a execução de fluxos está restrita — disparar exige o papel com "fluxos.executar"`,
          recurso: "fluxos.executar",
          acao: "editar",
        });
      }
    }

    // Do EM VIGOR, não só dos declarados: a esteira derivada também executa.
    const { fluxos, papeis } = await emVigor(timeId);
    const fluxo = fluxos.find((f) => f.id === id);
    if (!fluxo) return reply.code(404).send({ erro: `não conheço o fluxo "${id}" neste time` });
    if (ateNo && !fluxo.nos.some((no) => no.id === ateNo)) {
      return reply.code(404).send({ erro: `o fluxo "${id}" não tem o nó "${ateNo}"` });
    }

    const [catalogo, provedor] = await Promise.all([catalogoDeConectores(db, diretorioConfig), resolverProvedor()]);

    let resultado;
    try {
      resultado = await executarFluxo(fluxo, {
        conector: async (no, parametros) => {
          const conector = catalogo.find((c) => c.id === no.refId);
          if (!conector) throw new Error(`não conheço o conector "${no.refId}" — veja GET /conectores`);
          const { saida, ausentes } = await executarConector(conector, parametros);
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
          const texto = await provedor.completar(prompt);
          return { texto };
        },
      }, { ateNo });
    } finally {
      await provedor?.descartar().catch(() => undefined);
    }

    // Ciclo é RECUSA, não falha parcial — e a mensagem é a do desenho (§4.4).
    if (resultado.ciclo) return reply.code(409).send({ erro: mensagemDeCiclo(resultado.ciclo) });

    const hash = hashDoFluxo(fluxo);
    // O rastro persiste SEM as saídas (ver o comentário da tabela); a resposta
    // da rota as carrega, porque quem disparou quer ver o que saiu.
    await db.insert(fluxoExecucoes).values({
      fluxoId: id,
      timeId: timeId ?? CAMPO_GLOBAL,
      hash,
      email,
      nos: resultado.nos,
    });
    registrarAuditoria(db, { email, acao: "executar", recurso: "fluxos", recursoId: id });

    return { fluxo: id, hash, nos: resultado.nos, saidas: resultado.saidas };
  });

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
