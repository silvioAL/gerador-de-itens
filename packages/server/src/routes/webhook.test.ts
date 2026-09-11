import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { criarGatewayFalso, CHAVE_GATEWAY_FALSO } from "@gerador/gateway-falso";
import { fluxoExecucoes, fluxoWebhooks } from "../db/schema.js";

/**
 * SPEC-110 fatia L (D1) — **o gatilho webhook, na rota.**
 *
 * As provas puras (`aplicacao/src/config/webhook.test.ts`) cobrem a extração e
 * as recusas de escrita. O que só existe AQUI é a porta: um endereço sem
 * sessão, autenticado por um token que só existe em hash, que dispara a mesma
 * execução do botão e aparece no histórico dizendo de onde veio.
 *
 * E o que o navegador não provaria melhor que isto: que o token **não volta**
 * depois de emitido, e que regenerar **invalida** o anterior.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;
let db: BancoDeDados;
let gateway: ReturnType<typeof criarGatewayFalso>;
let baseDoGateway: string;

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });

  gateway = criarGatewayFalso();
  await new Promise<void>((r) => gateway.listen(0, "127.0.0.1", () => r()));
  const addr = gateway.address() as { port: number };
  baseDoGateway = `http://127.0.0.1:${addr.port}/v1`;
});

afterAll(() => new Promise<void>((r) => gateway.close(() => r())));

type App = Awaited<ReturnType<typeof buildApp>>;
type Cookies = Record<string, string>;

async function comApp<T>(f: (app: App, cookies: Cookies) => Promise<T>): Promise<T> {
  const app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
  try {
    const sessao = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "dev@gerador.local" } });
    const cookies = sessao.cookies.reduce((acc, c) => ({ ...acc, [c.name]: c.value }), {});
    return await f(app, cookies);
  } finally {
    await app.close();
  }
}

async function prepararMundo(app: App, cookies: Cookies) {
  await app.inject({
    method: "PUT",
    url: "/ia/credencial",
    cookies,
    payload: { baseUrl: baseDoGateway, chave: CHAVE_GATEWAY_FALSO, modelo: "gateway-falso" },
  });
  await app.inject({
    method: "PUT",
    url: "/config/conectores",
    cookies,
    payload: {
      documento: {
        conectores: [
          /**
           * O conector que ECOA o que recebe: é o que transforma "o webhook
           * disparou" em "o webhook disparou COM O DADO CERTO". Sem um nó que
           * consome o campo extraído, a prova seria "não explodiu".
           */
          {
            id: "eco",
            nome: "Eco",
            endpoint: `${baseDoGateway}/documento-externo`,
            entrada: [{ chave: "link", rotulo: "Link", tipo: "texto", obrigatorio: true }],
            saida: [{ chave: "conteudo", rotulo: "Conteúdo", tipo: "texto", caminho: "$.link", obrigatorio: true }],
          },
        ],
      },
    },
  });
}

const salvarFluxos = (app: App, cookies: Cookies, fluxos: unknown[]) =>
  app.inject({ method: "PUT", url: "/config/fluxos", cookies, payload: { documento: { fluxos } } });

const no = (id: string, tipo: string, refId: string, parametros: Record<string, unknown> = {}) => ({
  id,
  tipo,
  refId,
  posicao: { x: 0, y: 0 },
  parametros,
});

/**
 * `webhook(pedidoId, texto) → pdca-feedback`.
 *
 * O nó de destino é uma FUNÇÃO de propósito: o rastro guarda as `entradas` de
 * um nó de função, e é por ali que se prova que o valor extraído do corpo
 * chegou ao lugar certo. Com um conector, o rastro só diria "sucesso" — e
 * "sucesso" provaria que algo chegou, não O QUE chegou.
 *
 * De quebra é o caso vivo da D12: um sistema de fora registrando feedback no
 * ciclo de melhoria sem ninguém abrir a tela.
 */
const FLUXO_COM_WEBHOOK = {
  id: "recebe",
  nome: "Recebe de fora",
  nos: [
    no("gatilho", "gatilho", "webhook", {
      campos: [{ chave: "pedidoId" }, { chave: "texto", caminho: "$.dados.mensagem" }],
    }),
    no("registra", "funcao", "pdca-feedback"),
  ],
  arestas: [{ de: "gatilho", para: "registra", mapeamento: [{ saida: "texto", entrada: "texto" }] }],
};

async function comToken(app: App, cookies: Cookies): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/fluxos/recebe/gatilhos/gatilho/token",
    cookies,
    payload: {},
  });
  expect(r.statusCode).toBe(200);
  return (r.json() as { token: string }).token;
}

describe("SPEC-110 fatia L — o endereço que outro sistema chama", () => {
  it("o POST sem sessão dispara o fluxo, e o campo extraído do corpo chega ao nó", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      expect((await salvarFluxos(app, cookies, [FLUXO_COM_WEBHOOK])).statusCode).toBe(200);
      const token = await comToken(app, cookies);

      // SEM cookies: é máquina-a-máquina, e o token no caminho é o que autentica.
      const chamada = await app.inject({
        method: "POST",
        url: `/fluxos/gatilhos/webhook/${token}`,
        payload: { pedidoId: "P-9", dados: { mensagem: "o relatório veio truncado" }, ruido: "ignore-me" },
      });

      // 202 e não 200: quem chamou não é quem revisa (o fluxo pode parar numa tela).
      expect(chamada.statusCode).toBe(202);
      const corpo = chamada.json() as { execucaoId: string; estado: string; nos: { noId: string; estado: string }[] };
      expect(corpo.estado).toBe("concluida");
      expect(corpo.nos.find((n) => n.noId === "registra")?.estado).toBe("sucesso");

      /**
       * O DADO chegou, e chegou pelo CAMINHO declarado (`$.dados.mensagem`) e
       * não pelo nome do campo — é a diferença entre extrair e adivinhar. O
       * rastro de um nó de função guarda as entradas dele, e é onde isso se vê.
       */
      const [execucao] = await db.select().from(fluxoExecucoes).where(eq(fluxoExecucoes.id, corpo.execucaoId));
      const rastro = execucao.nos as { noId: string; entradas?: Record<string, unknown> }[];
      expect(rastro.find((n) => n.noId === "registra")?.entradas?.texto).toBe("o relatório veio truncado");
      // E o `ruido` do corpo não virou entrada de ninguém: o declarado é o
      // contrato, o resto é ignorado de propósito.
      expect(JSON.stringify(rastro)).not.toContain("ignore-me");
    });
  });

  it("o histórico diz de ONDE veio: origem `webhook` e um e-mail que não é de gente", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [FLUXO_COM_WEBHOOK]);
      const token = await comToken(app, cookies);
      const chamada = await app.inject({
        method: "POST",
        url: `/fluxos/gatilhos/webhook/${token}`,
        payload: { pedidoId: "P-1", dados: { mensagem: "veio de fora" } },
      });
      const { execucaoId } = chamada.json() as { execucaoId: string };

      const [execucao] = await db.select().from(fluxoExecucoes).where(eq(fluxoExecucoes.id, execucaoId));
      // A mesma disciplina do relógio (fatia E): a auditoria pergunta "quem
      // fez?", e "um sistema qualquer" não é resposta.
      expect(execucao.email).toBe("webhook@gerador.local");
      const rastro = execucao.nos as { noId: string; origem?: string }[];
      expect(rastro.find((n) => n.noId === "gatilho")?.origem).toBe("webhook");
    });
  });

  it("token desconhecido: 4xx nomeado, e a recusa NÃO conta o que existe do lado de cá", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [FLUXO_COM_WEBHOOK]);
      await comToken(app, cookies);

      const errado = await app.inject({ method: "POST", url: "/fluxos/gatilhos/webhook/nao-existe", payload: {} });
      expect(errado.statusCode).toBe(404);
      const erro = (errado.json() as { erro: string }).erro;
      expect(erro).toContain("não conheço este endereço");
      // A frase não pode virar oráculo: nada de "o fluxo existe mas o token
      // não", que ensinaria um atacante o que procurar.
      expect(erro).not.toContain("recebe");
    });
  });

  it("o token é mostrado UMA vez — depois dela só o hash existe", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [FLUXO_COM_WEBHOOK]);
      const token = await comToken(app, cookies);

      const [linha] = await db.select().from(fluxoWebhooks).where(eq(fluxoWebhooks.fluxoId, "recebe"));
      expect(linha.tokenHash).not.toBe(token);
      expect(linha.tokenHash).toMatch(/^[a-f0-9]{64}$/);

      // A listagem que a tela consome não devolve segredo nenhum.
      const lista = await app.inject({ method: "GET", url: "/fluxos/recebe/webhooks", cookies });
      expect(lista.statusCode).toBe(200);
      expect(JSON.stringify(lista.json())).not.toContain(token);
    });
  });

  it("regenerar INVALIDA o anterior — é o que faz o botão ser um conserto de verdade", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [FLUXO_COM_WEBHOOK]);
      const antigo = await comToken(app, cookies);
      const novo = await comToken(app, cookies);
      expect(novo).not.toBe(antigo);

      const comOAntigo = await app.inject({ method: "POST", url: `/fluxos/gatilhos/webhook/${antigo}`, payload: {} });
      expect(comOAntigo.statusCode).toBe(404);
      const comONovo = await app.inject({
        method: "POST",
        url: `/fluxos/gatilhos/webhook/${novo}`,
        payload: { pedidoId: "P-2", dados: { mensagem: "com o token novo" } },
      });
      expect(comONovo.statusCode).toBe(202);
    });
  });

  it("o nó que SAI do desenho leva o endereço junto — porta destrancada não fica de pé", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [FLUXO_COM_WEBHOOK]);
      const token = await comToken(app, cookies);
      expect((await app.inject({ method: "POST", url: `/fluxos/gatilhos/webhook/${token}`, payload: { pedidoId: "x", dados: { mensagem: "antes de sumir" } } })).statusCode).toBe(202);

      // O desenho troca o webhook por um gatilho manual: o endereço tem de
      // morrer. O fluxo continua COERENTE (as arestas acompanham os nós) —
      // senão a escrita recusaria o documento e a prova mediria o erro errado.
      const semWebhook = await salvarFluxos(app, cookies, [
        {
          ...FLUXO_COM_WEBHOOK,
          nos: [no("gatilho", "gatilho", "manual"), no("registra", "funcao", "pdca-feedback", { texto: "manual" })],
          arestas: [{ de: "gatilho", para: "registra", mapeamento: [] }],
        },
      ]);
      expect(semWebhook.statusCode).toBe(200);

      const depois = await app.inject({ method: "POST", url: `/fluxos/gatilhos/webhook/${token}`, payload: {} });
      expect(depois.statusCode).toBe(404);
      const linhas = await db.select().from(fluxoWebhooks).where(eq(fluxoWebhooks.fluxoId, "recebe"));
      expect(linhas).toHaveLength(0);
    });
  });

  it("o FLUXO apagado leva o endereço junto — o caso pior, não o de borda", async () => {
    /**
     * Achado do E2E: a varredura era POR FLUXO, e um fluxo apagado nunca entra
     * em laço nenhum — o endereço sobrevivia ao próprio fluxo. Quem apaga um
     * fluxo tem ainda mais razão para esperar que o endereço dele morra junto
     * do que quem só troca um nó.
     */
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [FLUXO_COM_WEBHOOK]);
      const token = await comToken(app, cookies);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/fluxos/gatilhos/webhook/${token}`,
            payload: { pedidoId: "P-4", dados: { mensagem: "antes de apagar" } },
          })
        ).statusCode
      ).toBe(202);

      // O documento inteiro fica vazio: o fluxo não existe mais.
      expect((await salvarFluxos(app, cookies, [])).statusCode).toBe(200);

      const depois = await app.inject({ method: "POST", url: `/fluxos/gatilhos/webhook/${token}`, payload: {} });
      expect(depois.statusCode).toBe(404);
      expect(await db.select().from(fluxoWebhooks).where(eq(fluxoWebhooks.fluxoId, "recebe"))).toHaveLength(0);
    });
  });

  it("emitir token exige sessão e um nó que SEJA webhook", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [FLUXO_COM_WEBHOOK]);

      const semSessao = await app.inject({ method: "POST", url: "/fluxos/recebe/gatilhos/gatilho/token", payload: {} });
      expect(semSessao.statusCode).toBeGreaterThanOrEqual(400);

      const noErrado = await app.inject({
        method: "POST",
        url: "/fluxos/recebe/gatilhos/registra/token",
        cookies,
        payload: {},
      });
      expect(noErrado.statusCode).toBe(400);
      expect((noErrado.json() as { erro: string }).erro).toContain("não é um gatilho de webhook");
    });
  });

  it("o disparo carimba `ultimaEm` — a resposta de “esse endereço está vivo?”", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [FLUXO_COM_WEBHOOK]);
      const token = await comToken(app, cookies);

      const [antes] = await db
        .select()
        .from(fluxoWebhooks)
        .where(and(eq(fluxoWebhooks.fluxoId, "recebe"), eq(fluxoWebhooks.noId, "gatilho")));
      expect(antes.ultimaEm).toBeNull();

      await app.inject({
        method: "POST",
        url: `/fluxos/gatilhos/webhook/${token}`,
        payload: { pedidoId: "P-3", dados: { mensagem: "carimba a data" } },
      });

      const [depois] = await db
        .select()
        .from(fluxoWebhooks)
        .where(and(eq(fluxoWebhooks.fluxoId, "recebe"), eq(fluxoWebhooks.noId, "gatilho")));
      expect(depois.ultimaEm).not.toBeNull();
    });
  });
});
