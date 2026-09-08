import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";

/**
 * SPEC-110 fatia I (D15) — **cada item sobe com a spec DELE.**
 *
 * A unidade é o ITEM, não a demanda: *"isso varia com o desenho, pode ter
 * vários itens"*. N itens → N specs.
 *
 * ## Por que este teste existe mesmo com a promessa já cumprida
 *
 * Medido antes de escrever qualquer código: `saidaDoProjeto` já monta cada
 * item com `corpoMarkdown` (produzido por `renderizarItemEspecificacao`), e a
 * fábrica `exportar-prontos` já mapeia `itensProntos → itens`. A promessa da
 * SPEC-98 §3.2 está viva no dado.
 *
 * O que NÃO existia era prova de que ela chega ao destino. O dublê da suíte
 * só lê a `chave` de cada item — um payload sem o corpo passaria por ele sem
 * um vermelho. Este teste levanta um destino que GUARDA o que recebeu, e
 * afirma sobre o payload real: dois itens, duas specs, cada uma com o
 * conteúdo do seu item. Sem isto, a promessa dependia de leitura de código.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;
let db: BancoDeDados;

/** O destino espião: responde como o tracker e GUARDA o corpo recebido. */
let espiao: Server;
let baseDoEspiao: string;
let recebidos: { itens?: { chave?: string; corpoMarkdown?: string }[] }[] = [];

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });

  espiao = createServer((req, res) => {
    const pedacos: Buffer[] = [];
    req.on("data", (p) => pedacos.push(p as Buffer));
    req.on("end", () => {
      const corpo = JSON.parse(Buffer.concat(pedacos).toString("utf-8") || "{}");
      recebidos.push(corpo);
      const itens = (corpo.itens ?? []) as { chave?: string }[];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          resultados: itens.map((i) => ({ chave: i.chave, linkExterno: `https://exemplo.invalido/${i.chave}` })),
        })
      );
    });
  });
  await new Promise<void>((r) => espiao.listen(0, "127.0.0.1", () => r()));
  baseDoEspiao = `http://127.0.0.1:${(espiao.address() as { port: number }).port}`;
});

afterAll(() => new Promise<void>((r) => espiao.close(() => r())));

async function comApp<T>(f: (app: Awaited<ReturnType<typeof buildApp>>, cookies: Record<string, string>) => Promise<T>) {
  const app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
  try {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "dev@gerador.local" } });
    const cookies = Object.fromEntries(
      (login.cookies as { name: string; value: string }[]).map((c) => [c.name, c.value])
    );
    return await f(app, cookies);
  } finally {
    await app.close();
  }
}

/**
 * Dois componentes — o desenho que a demanda carrega.
 *
 * A forma é a do DOMÍNIO (label, x/y e `spec` no topo), não a do React Flow
 * (`data: { … }`). Foi o primeiro vermelho deste teste: o motor lê
 * `no.spec.endpoints` e estourava com "Cannot read properties of undefined".
 * Era o dado que eu escrevi, não o produto — copiei a forma de
 * `DESENHO_DO_GATEWAY_FALSO`, que é a que a suíte já usa.
 */
const DESENHO_COM_DOIS = {
  nodes: [
    {
      id: "pedidos",
      type: "service",
      x: 80,
      y: 80,
      label: "Serviço de pedidos",
      status: "novo",
      spec: { nome: { valor: "servico-de-pedidos", origem: "manual" }, linguagem: { valor: "Kotlin", origem: "manual" } },
      specNA: {},
    },
    {
      id: "faturas",
      type: "service",
      x: 380,
      y: 80,
      label: "Serviço de faturas",
      status: "novo",
      spec: { nome: { valor: "servico-de-faturas", origem: "manual" }, linguagem: { valor: "Kotlin", origem: "manual" } },
      specNA: {},
    },
  ],
  edges: [],
};

describe("SPEC-110 fatia I — a spec por ITEM chega ao destino", () => {
  it("dois itens sobem com DUAS specs, cada uma com o conteúdo do seu item", async () => {
    recebidos = [];
    await comApp(async (app, cookies) => {
      // O destino de itens aponta para o espião — nada de dublê aqui: o que
      // se quer ver é o PAYLOAD, e o dublê da suíte descarta o corpo.
      await app.inject({
        method: "PUT",
        url: "/config/exportador",
        cookies,
        payload: {
          documento: {
            endpoint: "",
            rotulo: "",
            cabecalhos: {},
            destinos: [{ id: "espiao", operacao: "itens", endpoint: `${baseDoEspiao}/itens`, rotulo: "Espião" }],
          },
        },
      });

      const criada = await app.inject({
        method: "POST",
        url: "/quebras",
        cookies,
        payload: { titulo: `spec-por-item ${Date.now()}`, time: "time-pagamentos", diagrama: DESENHO_COM_DOIS },
      });
      expect(criada.statusCode).toBe(201);
      const { id: demandaId } = criada.json() as { id: string };

      /**
       * Os itens entram pela porta de gravação, com o corpo de cada um.
       *
       * Não pela derivação de propósito: o que este teste mede é o CAMINHO DO
       * ENVIO — se o corpo do item chega ao destino. A derivação tem prova
       * própria, e trazê-la para cá faria o vermelho ficar ambíguo entre "não
       * derivou" e "não enviou".
       */
      const gravados = await app.inject({
        method: "PUT",
        url: `/quebras/${demandaId}/itens`,
        cookies,
        payload: {
          itens: [
            {
              chave: "PED-1",
              titulo: "Serviço de pedidos",
              tipo: "backend",
              tamanho: "M",
              dependencias: [],
              corpoMarkdown: "## Serviço de pedidos\n\nA spec do item de pedidos.",
              pendencias: 0,
              sugestoes: 0,
            },
            {
              chave: "FAT-1",
              titulo: "Serviço de faturas",
              tipo: "backend",
              tamanho: "S",
              dependencias: [],
              corpoMarkdown: "## Serviço de faturas\n\nA spec do item de faturas.",
              pendencias: 0,
              sugestoes: 0,
            },
          ],
        },
      });
      expect(gravados.statusCode).toBe(200);

      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "sobe-com-spec",
                nome: "Sobe com spec",
                nos: [
                  { id: "demanda", tipo: "projeto", refId: "demanda-ler", posicao: { x: 0, y: 0 }, parametros: { demandaId } },
                  { id: "envio", tipo: "conector", refId: "espiao", componente: "itens", posicao: { x: 240, y: 0 }, parametros: {} },
                ],
                arestas: [{ de: "demanda", para: "envio", mapeamento: [{ saida: "itensProntos", entrada: "itens" }] }],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/sobe-com-spec/executar", cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const { nos } = r.json() as { nos: { noId: string; estado: string; erro?: string }[] };
      expect(nos.find((n) => n.noId === "envio")?.estado).toBe("sucesso");

      // ── O payload REAL que o destino recebeu ──
      expect(recebidos).toHaveLength(1);
      const enviados = recebidos[0].itens ?? [];
      expect(enviados.length).toBeGreaterThanOrEqual(2);

      // Cada item leva a spec DELE — não a da demanda repetida.
      for (const item of enviados) {
        expect(item.corpoMarkdown, `item ${item.chave} subiu sem spec`).toBeTruthy();
      }
      const corpos = enviados.map((i) => i.corpoMarkdown);
      expect(new Set(corpos).size, "as specs vieram iguais — é a da demanda duplicada").toBe(corpos.length);

      // E o conteúdo é o do item: o corpo de cada um cita o próprio elemento.
      const porChave = Object.fromEntries(enviados.map((i) => [i.chave!, i.corpoMarkdown!]));
      const doPedidos = Object.entries(porChave).find(([, corpo]) => corpo.includes("item de pedidos"));
      const doFaturas = Object.entries(porChave).find(([, corpo]) => corpo.includes("item de faturas"));
      expect(doPedidos, "nenhuma spec fala do serviço de pedidos").toBeDefined();
      expect(doFaturas, "nenhuma spec fala do serviço de faturas").toBeDefined();
      expect(doPedidos![0]).not.toBe(doFaturas![0]);
    });
  });

  /**
   * SPEC-110 fatia I (D15) — **a spec como saída do fluxo, e não só efeito.**
   *
   * O que estes testes trancam: o fluxo produz UMA spec por item, e o agregado
   * que ele devolve é o MESMO que a tela monta — não uma segunda montagem que
   * diverge na primeira mudança de template (§263).
   */
  it("`gerar-spec` devolve uma spec POR ITEM e o agregado, pela mesma montagem da tela", async () => {
    await comApp(async (app, cookies) => {
      const criada = await app.inject({
        method: "POST",
        url: "/quebras",
        cookies,
        payload: { titulo: `gerar-spec ${Date.now()}`, time: "time-pagamentos", diagrama: DESENHO_COM_DOIS },
      });
      const { id: demandaId } = criada.json() as { id: string };
      /**
       * Os itens PERSISTIDOS: `demanda-ler` emite o que está gravado, e
       * `/derivar` só calcula sem escrever. Foi o primeiro vermelho deste
       * teste — o nó recebia lista vazia e recusava, corretamente.
       */
      const gravados = await app.inject({
        method: "PUT",
        url: `/quebras/${demandaId}/itens`,
        cookies,
        payload: {
          itens: [
            {
              chave: "PED-1",
              titulo: "Serviço de pedidos",
              tipo: "backend",
              tamanho: "M",
              dependencias: [],
              corpoMarkdown: "## Serviço de pedidos",
              pendencias: 0,
              sugestoes: 0,
            },
            {
              chave: "FAT-1",
              titulo: "Serviço de faturas",
              tipo: "backend",
              tamanho: "S",
              dependencias: [],
              corpoMarkdown: "## Serviço de faturas",
              pendencias: 0,
              sugestoes: 0,
            },
          ],
        },
      });
      expect(gravados.statusCode).toBe(200);

      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "spec-do-fluxo",
                nome: "Spec do fluxo",
                nos: [
                  { id: "demanda", tipo: "projeto", refId: "demanda-ler", posicao: { x: 0, y: 0 }, parametros: { demandaId } },
                  { id: "spec", tipo: "funcao", refId: "gerar-spec", posicao: { x: 240, y: 0 }, parametros: {} },
                ],
                arestas: [
                  {
                    de: "demanda",
                    para: "spec",
                    mapeamento: [{ saida: "desenho", entrada: "desenho" }],
                  },
                ],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/spec-do-fluxo/executar", cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const { nos, saidas } = r.json() as {
        nos: { noId: string; estado: string; erro?: string }[];
        saidas: Record<string, Record<string, unknown>>;
      };
      expect(nos.find((n) => n.noId === "spec")?.estado, nos.find((n) => n.noId === "spec")?.erro).toBe("sucesso");

      const porItem = saidas["spec"].specPorItem as { chave: string; titulo: string; markdown: string; lacunas: number }[];
      // N itens → N specs: a unidade é o ITEM, não a demanda.
      expect(porItem.length).toBeGreaterThanOrEqual(2);
      expect(new Set(porItem.map((s) => s.markdown)).size, "as specs vieram iguais").toBe(porItem.length);
      // E o agregado existe, com o conteúdo de todas.
      const agregado = String(saidas["spec"].spec);
      expect(agregado.length).toBeGreaterThan(0);
      /**
       * O agregado cobre cada item pelo TÍTULO, não pela chave crua: é assim
       * que a montagem da tela o escreve, e afirmar sobre a chave seria
       * afirmar sobre um detalhe que o documento não mostra.
       */
      for (const item of porItem) {
        expect(agregado, `o agregado não cobre "${item.titulo}"`).toContain(item.titulo);
      }
      // A lacuna é CONTADA, não escondida (§311).
      expect(saidas["spec"].lacunas).toBe(porItem.reduce((soma, s) => soma + s.lacunas, 0));
    });
  });

  it("`gerar-spec` sem itens RECUSA, nomeando — spec vazia não é spec", async () => {
    await comApp(async (app, cookies) => {
      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "spec-sem-itens",
                nome: "Sem itens",
                nos: [{ id: "spec", tipo: "funcao", refId: "gerar-spec", posicao: { x: 0, y: 0 }, parametros: {} }],
                arestas: [],
              },
            ],
          },
        },
      });
      const r = await app.inject({ method: "POST", url: "/fluxos/spec-sem-itens/executar", cookies, payload: {} });
      const { nos } = r.json() as { nos: { estado: string; erro?: string }[] };
      expect(nos[0].estado).toBe("falhou");
      expect(nos[0].erro).toContain("desenho");
    });
  });
});
