import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  criarProvedorCompativelOpenAI,
  formatoJsonPorBaseUrl,
  presetsDoModo,
  temVisao,
  type ProvedorIa,
} from "@gerador/llm/gateway";
import {
  criarCasosDeUsoDeConfig,
  montarPedidoAlterarItem,
  montarPedidoConfigurarConversa,
  montarPedidoDiagrama,
  montarPedidoPipeline,
  montarPedidoSugerirConfig,
  normalizarPipelineAgentes,
  preambuloDoPapel,
  PedidoInvalido,
  resumirCredencialIa,
  type CredencialIa,
  type PedidoIa,
} from "@gerador/aplicacao";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeCredenciaisEmPostgres } from "../adaptadores/credenciaisEmPostgres.js";
import { exigirSessao } from "../auth/middleware.js";
import { exigirPermissao, organizacaoPadraoDe } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";
import { organizacoes } from "../db/schema.js";

/**
 * SPEC-31 Fase 4 — as rotas de IA no modo hospedado. **Não existiam** (§105):
 * o app web servido pelo container chamava `/ia/status` e recebia 404, então a
 * esteira de agentes simplesmente não rodava — e a tela não dizia por quê.
 *
 * Uma diferença deliberada em relação ao modo local: aqui **só existe o
 * gateway**. Modelo local dentro de container é 200 MB de binário que nunca
 * executa, e o import vem de `@gerador/llm/gateway`, o caminho que não alcança
 * `node-llama-cpp` (guardado por `gateway.fronteira.test.ts`).
 *
 * A credencial é da organização, não da pessoa. A chave entra por `PUT` e
 * nunca volta: toda leitura passa por `resumirCredencialIa`.
 */
const ID_PROVEDOR_GATEWAY = "gateway";

/** Teto de upload de áudio — o mesmo do modo local, pelo mesmo motivo
 * (JOURNEY: *toda ausência de teto virou bug*). ~10 MB de WebM/Opus são vários
 * minutos de fala, bem acima de "ditar uma demanda". */
const LIMITE_AUDIO_BYTES = 10 * 1024 * 1024;

const corpoCredencial = z.object({
  baseUrl: z.string().url(),
  chave: z.string().min(1),
  modelo: z.string().min(1),
  cabecalhos: z.record(z.string()).optional(),
  formatoJson: z.enum(["json_object", "json_schema", "nenhum"]).optional(),
  // SPEC-30: o Ollama não transcreve, então o preset do Docker aponta a voz
  // pro serviço `whisper` do mesmo compose.
  baseUrlTranscricao: z.string().url().optional(),
  // Marcação manual de visão — pra gateway interno, que nenhum preset conhece.
  visao: z.boolean().optional(),
});

function comoProvedor(credencial: CredencialIa): ProvedorIa {
  return criarProvedorCompativelOpenAI({
    baseUrl: credencial.baseUrl!,
    chave: credencial.chave!,
    modelo: credencial.modelo!,
    cabecalhos: credencial.cabecalhos,
    formatoJson: credencial.formatoJson as never,
    baseUrlTranscricao: credencial.baseUrlTranscricao,
  });
}

export async function registrarRotasIa(app: FastifyInstance, { db }: OpcoesApp) {
  /**
   * SPEC-28 Fase 1b — `credenciais-ia` cobre as DUAS rotas: gravar e testar.
   * Testar manda a chave no corpo e devolve se o gateway aceitou; sem o mesmo
   * portão, quem não pode gravar credencial poderia usar o servidor como
   * oráculo para validar chaves alheias.
   *
   * No modo hospedado a escolha do modelo viaja junto com a credencial, então
   * `modelo-ia` não tem rota própria — ver RECURSOS_SEM_ROTA.
   */
  const podeEditarCredenciais = exigirPermissao(db, organizacaoPadraoDe(db), "credenciais-ia", "editar");

  async function repositorio() {
    const [org] = await db.select({ id: organizacoes.id }).from(organizacoes).limit(1);
    if (!org) return null;
    return criarRepositorioDeCredenciaisEmPostgres(db, org.id);
  }

  /**
   * O que a tela precisa saber antes de tentar rodar a esteira. No local isso
   * responde "o modelo está baixado?"; aqui, "existe credencial de gateway?".
   * A mesma pergunta do ponto de vista de quem chama: dá pra usar IA agora?
   */
  /**
   * ACHADO REAL abrindo a aba "Modelo de IA" no modo hospedado: minha primeira
   * versão devolvia `modelosChat: []` e `embeddingInstalado: false`. A tela
   * renderiza a LISTA de modelos, então não apareceu formulário nenhum — só o
   * aviso "o modelo de embedding não está instalado, rode `gerador ia
   * instalar`", um comando que não existe em container e que a Fase 4 decidiu
   * que nunca vai existir.
   *
   * O erro era meu, não da tela: valores honestos ("não tenho modelo local")
   * lidos com a semântica do outro modo. A correção é o hospedado falar a
   * MESMA forma — um único modelo, remoto, sempre selecionado — em vez de a UI
   * ganhar um `if` por modo. É a mesma regra que rege o resto da SPEC-31.
   */
  app.get("/ia/status", async () => {
    const repo = await repositorio();
    const resumo = repo ? await repo.resumir(ID_PROVEDOR_GATEWAY) : { configurado: false };

    return {
      pronto: resumo.configurado,
      provedor: ID_PROVEDOR_GATEWAY,
      chatInstalado: resumo.configurado,
      // Não há embedding aqui, e não é pendência: é a decisão de não carregar
      // modelo local em container. `true` porque a pergunta que a tela faz com
      // este campo — "falta instalar algo?" — tem resposta "não".
      embeddingInstalado: true,
      caminhoModelos: "",
      modelosChat: [
        {
          id: ID_PROVEDOR_GATEWAY,
          nome: "Gateway (Claude, DeepSeek, wrapper da empresa)",
          papel: "Modo hospedado: o modelo roda fora do container, no endereço que você configurar.",
          instalado: resumo.configurado,
          tamanhoAproximadoBytes: 0,
          raciocinador: false,
          // Único caminho possível aqui — deixar como não-selecionado faria a
          // tela sugerir uma escolha que não existe.
          selecionado: true,
          remoto: true,
        },
      ],
      gateway: resumo,
      // Do modo HOSPEDADO: quem chama o gateway daqui é este container, então
      // o Ollama alcançável é `http://ollama:11434` (serviço do compose), não
      // `localhost`. Servir a lista do outro modo ofereceria um destino que
      // falha em "connection refused" sem nunca sair do container.
      presetsGateway: presetsDoModo("hospedado"),
      // SPEC-30: aqui só existe o gateway, e o gateway transcreve — então a
      // capacidade é exatamente "tem credencial?". A tela usa isto pra decidir
      // se desenha o microfone.
      capacidades: {
        transcricao: resumo.configurado,
        // Por MODELO: o mesmo endereço serve modelo com e sem visão.
        // Preset OU marcação manual: quem tem gateway próprio sabe do modelo
        // dele mais que qualquer lista nossa.
        visao: resumo.visao === true || temVisao(resumo.baseUrl, resumo.modelo),
      },
      credencial: resumo,
    };
  });

  app.get("/ia/credencial", async () => {
    const repo = await repositorio();
    return repo ? repo.resumir(ID_PROVEDOR_GATEWAY) : { configurado: false };
  });

  app.put("/ia/credencial", { preHandler: [exigirSessao, podeEditarCredenciais] }, async (req, reply) => {
    const corpo = corpoCredencial.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const repo = await repositorio();
    if (!repo) return reply.code(503).send({ erro: "organização não inicializada" });

    // O dialeto de JSON é INFERIDO da base URL quando o cliente não manda —
    // a tela não deveria precisar saber que a Anthropic exige `json_schema`
    // (medido contra a API real, não lido na doc). Mesma dedução do modo local.
    const credencial = { ...corpo.data, formatoJson: corpo.data.formatoJson ?? formatoJsonPorBaseUrl(corpo.data.baseUrl) };
    await repo.salvar(ID_PROVEDOR_GATEWAY, credencial);
    registrarAuditoria(db, {
      email: req.usuario!.email,
      acao: "atualizar",
      recurso: "credenciais_ia",
      recursoId: ID_PROVEDOR_GATEWAY,
    });
    // Devolve o RESUMO, nunca a chave — nem para quem acabou de mandá-la.
    return resumirCredencialIa(credencial);
  });

  /** Uma chamada curta de verdade contra o destino: é a única forma de saber
   * se a credencial funciona, e o custo de descobrir na primeira quebra é
   * uma esteira inteira perdida. */
  app.post("/ia/credencial/testar", { preHandler: [exigirSessao, podeEditarCredenciais] }, async (req, reply) => {
    // A tela testa ANTES de salvar — é o ponto do botão "Testar". Usar só a
    // credencial gravada faria o primeiro teste da vida sempre falhar com
    // "nenhuma credencial configurada" enquanto a pessoa olha para os campos
    // preenchidos. O corpo vence; sem corpo, cai na gravada.
    const doCorpo = (req.body ?? {}) as CredencialIa;
    const repo = await repositorio();
    const credencial =
      doCorpo.baseUrl && doCorpo.chave
        ? { ...doCorpo, formatoJson: doCorpo.formatoJson ?? formatoJsonPorBaseUrl(doCorpo.baseUrl) }
        : repo
          ? await repo.obter(ID_PROVEDOR_GATEWAY)
          : null;
    if (!credencial?.baseUrl || !credencial.chave) {
      return reply.code(400).send({ ok: false, erro: "nenhuma credencial configurada" });
    }

    const provedor = comoProvedor(credencial);
    try {
      const inicio = Date.now();
      const resposta = await provedor.completar("Responda apenas: ok");
      // Mesma forma que a tela já espera do modo local: `amostra` e `duracaoMs`.
      return { ok: true, amostra: resposta.slice(0, 200), duracaoMs: Date.now() - inicio };
    } catch (erro) {
      // Falha de conexão é RESULTADO do teste, não erro da rota — a tela
      // mostra o motivo em vez de um erro genérico de rede.
      return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
    } finally {
      await provedor.descartar().catch(() => undefined);
    }
  });

  /**
   * A sugestão de texto para um placeholder — o mesmo contrato do modo local
   * (`text/plain` streamado), para que `packages/web` não precise saber em qual
   * modo está rodando.
   */
  app.post("/ia/sugerir", async (req, reply) => {
    const repo = await repositorio();
    const credencial = repo ? await repo.obter(ID_PROVEDOR_GATEWAY) : null;
    if (!credencial?.baseUrl || !credencial.chave) {
      return reply.code(503).send({ erro: "IA não configurada — cadastre a credencial do gateway" });
    }

    const { tech, rotulo, contextoNo, contextoEpico } = (req.body ?? {}) as {
      tech?: string;
      rotulo?: string;
      contextoNo?: string;
      contextoEpico?: string;
    };
    const prompt = [
      `Você ajuda a especificar um requisito técnico de refinamento de software.`,
      ...(contextoEpico ? [`Contexto geral da demanda/épico:`, contextoEpico, ``] : []),
      `Tecnologia: ${tech ?? "(não informada)"}`,
      `Requisito a especificar: "${rotulo ?? ""}"`,
      `Contexto do(s) nó(s) de arquitetura envolvidos:`,
      contextoNo || "(sem contexto adicional)",
      ``,
      `Responda de forma curta, específica e em português, com uma decisão concreta pra esse requisito nesse contexto. Não repita o requisito, só a resposta.`,
    ].join("\n");

    const provedor = comoProvedor(credencial);
    try {
      const texto = await provedor.completar(prompt);
      return reply.type("text/plain; charset=utf-8").send(texto);
    } catch (erro) {
      return reply.code(502).send({ erro: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      await provedor.descartar().catch(() => undefined);
    }
  });
  /**
   * SPEC-31 Fase 4 (conclusão) — as quatro rotas que faltavam.
   *
   * Elas existem aqui pelo MESMO motivo que existem no modo local: o pedido
   * (prompt + schema) é montado pela camada de aplicação, que não conhece
   * arquivo, banco nem provedor. O que muda entre os modos é só quem executa —
   * `node-llama-cpp` lá, gateway aqui.
   */
  async function executarPedido(reply: FastifyReply, pedido: PedidoIa, rotulo: string) {
    const repo = await repositorio();
    const credencial = repo ? await repo.obter(ID_PROVEDOR_GATEWAY) : null;
    if (!credencial?.baseUrl || !credencial.chave) {
      return reply.code(503).send({ erro: "IA não configurada — cadastre a credencial do gateway" });
    }

    const provedor = comoProvedor(credencial);
    // Streaming de verdade (não "junta tudo e manda"): a esteira mostra o
    // texto aparecendo, e perder isso no hospedado seria a mesma tela com
    // uma experiência pior — o tipo de divergência que esta fase existe pra
    // eliminar.
    // ACHADO REAL (todos os campos vazios na tela, e `curl` funcionando):
    // escrever direto em `reply.raw` PULA os hooks do Fastify — inclusive os
    // cabeçalhos de CORS que o `@fastify/cors` já tinha calculado. Sem eles o
    // navegador bloqueia a LEITURA da resposta: o servidor responde 200 com o
    // JSON certo, o `fetch` rejeita, e o lote inteiro se perde sem erro visível.
    // Por isso `curl` passava e a tela não.
    //
    // `reply.getHeaders()` traz o que o Fastify já montou; copiar antes de
    // assumir o socket é o que mantém o comportamento das outras rotas.
    /**
     * ACHADO REAL caçando "Unexpected end of JSON input" na tela: o `writeHead`
     * ficava AQUI, antes de qualquer byte do provedor. Com isso, toda falha do
     * gateway — inclusive um 400 com mensagem explícita — virava 200 com corpo
     * VAZIO, porque quando o erro chegava o status já tinha sido comprometido.
     * A tela recebia zero byte e mostrava o erro do `JSON.parse`, que não diz
     * nada sobre a causa.
     *
     * Adiar o cabeçalho até o PRIMEIRO pedaço resolve sem perder streaming:
     * enquanto nada chegou, ainda dá pra responder 502 com o motivo; a partir
     * do primeiro byte o comportamento é o de antes.
     */
    let comecou = false;
    const comecar = () => {
      if (comecou) return;
      comecou = true;
      reply.raw.writeHead(200, {
        ...(reply.getHeaders() as Record<string, string>),
        "content-type": "text/plain; charset=utf-8",
      });
    };

    try {
      await provedor.completarEstruturado(pedido.prompt, pedido.esquema as never, {
        // SPEC-30 Fase 2: se o pedido trouxe imagem, ela vai junto do prompt.
        imagens: pedido.imagens,
        onTexto: (pedaco) => {
          comecar();
          reply.raw.write(pedaco);
        },
        // NUL nunca aparece em JSON válido: é o sinal de "descarte o que
        // recebeu até aqui" quando o provedor vai repetir a tentativa.
        onReiniciar: () => {
          comecar();
          reply.raw.write(" ");
        },
      });
      if (!comecou) {
        // Sem exceção e sem um único byte. Acontece quando o gateway aceita a
        // chamada e devolve resposta vazia — e é indistinguível de sucesso pra
        // quem só olha o status.
        return reply.code(502).send({
          erro: `O modelo respondeu, mas não veio nenhum texto. Confira o modelo e o endereço na aba "Modelo de IA".`,
        });
      }
      reply.raw.end();
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      app.log.error(`[${rotulo}] falhou: ${mensagem}`);
      if (!comecou) {
        // Nada foi enviado ainda: dá pra dizer o que houve, com status de erro.
        return reply.code(502).send({ erro: `A chamada ao modelo falhou: ${mensagem}`, rotulo });
      }
      // Cabeçalho já foi: não dá pra trocar o status, só encerrar. O cliente
      // detecta o JSON incompleto — mesmo contrato do modo local.
      reply.raw.end();
    } finally {
      await provedor.descartar().catch(() => undefined);
    }
  }

  /** Entrada inválida vira 400 ANTES de qualquer byte de resposta. */
  function comPedido(montar: () => PedidoIa, reply: FastifyReply): PedidoIa | null {
    try {
      return montar();
    } catch (erro) {
      if (erro instanceof PedidoInvalido) {
        void reply.code(400).send({ erro: erro.message });
        return null;
      }
      throw erro;
    }
  }

  app.post("/ia/pipeline/:papel", async (req, reply) => {
    const { papel } = req.params as { papel: string };
    const corpo = (req.body ?? {}) as { contextoEpico?: string; itens?: never };

    // O preâmbulo sai da config da esteira — a mesma porta da Fase 3, agora
    // com o adaptador Postgres. É por isso que renomear um papel na tela de
    // configuração muda o prompt nos DOIS modos.
    const casosDeConfig = criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db));
    const { documento } = await casosDeConfig.obter("pipeline-agentes", { papeis: [] });
    const { papeis } = normalizarPipelineAgentes(documento);

    const pedido = comPedido(
      () => montarPedidoPipeline({ preambulo: preambuloDoPapel(papel, papeis), ...corpo, itens: corpo.itens ?? [] }),
      reply
    );
    if (!pedido) return reply;
    return executarPedido(reply, pedido, `ia/pipeline/${papel}`);
  });

  app.post("/ia/diagrama", async (req, reply) => {
    const pedido = comPedido(() => montarPedidoDiagrama((req.body ?? {}) as never), reply);
    if (!pedido) return reply;
    return executarPedido(reply, pedido, "ia/diagrama");
  });

  app.post("/ia/alterar-item", async (req, reply) => {
    const pedido = comPedido(() => montarPedidoAlterarItem((req.body ?? {}) as never), reply);
    if (!pedido) return reply;
    return executarPedido(reply, pedido, "ia/alterar-item");
  });

  app.post("/ia/sugerir-config", async (req, reply) => {
    const pedido = comPedido(() => montarPedidoSugerirConfig((req.body ?? {}) as never), reply);
    if (!pedido) return reply;
    return executarPedido(reply, pedido, "ia/sugerir-config");
  });

  /** SPEC-34 Fase 1 — o passo 1 da conversa de configuração: decide alvo e
   * destila a instrução; a materialização reusa `/ia/sugerir-config` acima.
   * Sem RBAC aqui de propósito: conversar e receber proposta é leitura; a
   * escrita acontece nas rotas de config, que já têm o portão. */
  app.post("/ia/configurar", async (req, reply) => {
    const pedido = comPedido(() => montarPedidoConfigurarConversa((req.body ?? {}) as never), reply);
    if (!pedido) return reply;
    return executarPedido(reply, pedido, "ia/configurar");
  });

  /**
   * SPEC-30 Fase 1a — transcrição. Mesma rota e mesmo contrato do modo local
   * (`paridade.sanity.test.ts` cobra isso), com a diferença que aqui **só o
   * gateway transcreve**: carregar modelo dentro do container é justamente o
   * que a Fase 4 decidiu não fazer.
   *
   * `addContentTypeParser` porque o Fastify, sem isso, tenta parsear o corpo
   * como JSON e devolve 400 antes do handler rodar — o áudio chega como bytes
   * crus, com o `Content-Type` que o navegador gravou.
   */
  app.addContentTypeParser(
    ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav"],
    { parseAs: "buffer", bodyLimit: LIMITE_AUDIO_BYTES },
    (_req, corpo, feito) => feito(null, corpo)
  );

  app.post("/ia/transcrever", async (req, reply) => {
    const repo = await repositorio();
    const credencial = repo ? await repo.obter(ID_PROVEDOR_GATEWAY) : null;
    if (!credencial?.baseUrl || !credencial.chave) {
      return reply.code(503).send({ erro: "IA não configurada — cadastre a credencial do gateway" });
    }

    const audio = req.body as Buffer | undefined;
    if (!audio?.length) return reply.code(400).send({ erro: "nenhum áudio recebido" });

    const provedor = comoProvedor(credencial);
    try {
      // Sempre existe no provedor de gateway; a checagem é pelo contrato, não
      // por otimismo — `transcrever` é opcional em `ProvedorIa`.
      if (!provedor.transcrever) {
        return reply.code(501).send({ erro: "o provedor configurado não transcreve áudio" });
      }
      const texto = await provedor.transcrever(new Uint8Array(audio), {
        formato: (req.headers["content-type"] ?? "audio/webm").split(";")[0].trim(),
        idioma: "pt",
        // Mesmo contrato do modo local: o vocabulário do projeto viaja na
        // query (o corpo é o áudio). Quem monta é o navegador, que tem config
        // e diagrama — `montarVocabularioTranscricao`, no engine.
        vocabulario: (req.query as { vocabulario?: string } | undefined)?.vocabulario,
      });
      return { texto };
    } catch (erro) {
      return reply.code(502).send({ erro: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      await provedor.descartar().catch(() => undefined);
    }
  });
}
