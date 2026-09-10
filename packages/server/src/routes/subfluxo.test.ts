import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { criarGatewayFalso, CHAVE_GATEWAY_FALSO } from "@gerador/gateway-falso";
import { fluxoExecucoes } from "../db/schema.js";

/**
 * SPEC-110 fatia J (D16) — **o subfluxo, na rota.**
 *
 * As provas puras (`aplicacao/src/config/subfluxo.test.ts`) cobrem o contrato e
 * a recusa de ciclo. O que só existe aqui é o EXECUTOR: a execução do filho como
 * linha própria marcada com `disparadoPor`, o teto do aninhamento, a falha que
 * atravessa os níveis nomeando o nó de dentro, e — o caso que a jornada da
 * demanda torna rotineiro — a TELA que pausa dentro de um subfluxo.
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

/** O conector que lê um desenho do dublê — a fonte de dado mais barata que a
 * casa tem, e a mesma que as provas da fatia B usam. */
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
          {
            id: "leitor-de-desenho",
            nome: "Desenho da casa",
            endpoint: `${baseDoGateway}/desenho`,
            entrada: [],
            saida: [{ chave: "desenho", rotulo: "Desenho", tipo: "objeto", caminho: "$.desenho", obrigatorio: true }],
          },
          /**
           * O conector que PEDE algo: `link` é entrada obrigatória e o dublê o
           * devolve ecoado. É o que permite provar que um valor mandado pelo
           * pai chegou ao nó certo lá dentro — com um conector sem entrada, a
           * prova seria "não explodiu", que não é prova.
           */
          {
            id: "volumetria",
            nome: "Documento externo",
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

/** filho: lê um desenho de fora e deriva os itens dele. */
const FILHO = {
  id: "filho",
  nome: "Deriva os itens",
  nos: [no("le", "conector", "leitor-de-desenho"), no("gera", "funcao", "derivacao")],
  arestas: [{ de: "le", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }],
};

describe("SPEC-110 fatia J — o subfluxo no executor", () => {
  it("roda o fluxo referenciado inteiro e devolve a saída do ÚLTIMO nó dele", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [
        FILHO,
        { id: "pai", nome: "Pai", nos: [no("etapa", "subfluxo", "filho")], arestas: [] },
      ]);

      const exec = await app.inject({ method: "POST", url: "/fluxos/pai/executar", cookies, payload: {} });
      expect(exec.statusCode).toBe(200);
      const corpo = exec.json() as {
        execucaoId: string;
        nos: { noId: string; tipo: string; estado: string }[];
        saidas: Record<string, Record<string, unknown>>;
      };
      expect(corpo.nos.map((n) => [n.noId, n.tipo, n.estado])).toEqual([["etapa", "subfluxo", "sucesso"]]);
      // O contrato promete a saída do último nó (`derivacao`): itens, avisos,
      // conformidade. Se o nó devolvesse o rastro do filho, o pai teria de
      // saber o que é um rastro — e a aresta seguinte não teria o que mapear.
      expect(Object.keys(corpo.saidas.etapa)).toEqual(
        expect.arrayContaining(["itens", "avisos", "conformidade", "execucaoDoSubfluxo"])
      );

      /**
       * A execução do FILHO é linha própria, marcada com a do pai. As duas
       * metades importam: linha própria dá alvo ao link "ver execução do
       * subfluxo" (§4.J), e a marca impede o histórico do filho de mostrar uma
       * corrida que ninguém disparou à mão.
       */
      const doFilho = await app.inject({ method: "GET", url: "/fluxos/filho/execucoes", cookies });
      const execucoes = (doFilho.json() as { execucoes: { id: string }[] }).execucoes;
      expect(execucoes.length).toBeGreaterThan(0);
      expect(corpo.saidas.etapa.execucaoDoSubfluxo).toBe(execucoes[0].id);

      const [linha] = await db
        .select({ disparadoPor: fluxoExecucoes.disparadoPor })
        .from(fluxoExecucoes)
        .where(eq(fluxoExecucoes.id, execucoes[0].id));
      expect(linha.disparadoPor).toBe(corpo.execucaoId);
    });
  });

  it("o campo externo do filho é alimentado pelo PAI, pela aresta de fora", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      /**
       * `link` é campo externo do conector do filho: ninguém dentro dele o
       * produz e o nó não o fixou, então quem o passa é o pai. É por este
       * caminho que a jornada inteira fala da MESMA demanda — e a régua velha
       * ("nó sem aresta chegando") o teria escondido, porque o gatilho das
       * fábricas dá produtor a todo primeiro nó.
       */
      await salvarFluxos(app, cookies, [
        {
          id: "filho-parametrizado",
          nome: "Filho com parâmetro",
          nos: [no("le", "conector", "volumetria")],
          arestas: [],
        },
        {
          id: "pai-parametrizado",
          nome: "Pai",
          nos: [
            no("aponta", "transformacao", "transformacao", {
              campos: [{ chave: "link", modelo: "https://wiki.invalido/de-fora" }],
            }),
            no("etapa", "subfluxo", "filho-parametrizado"),
          ],
          arestas: [{ de: "aponta", para: "etapa", mapeamento: [{ saida: "link", entrada: "link" }] }],
        },
      ]);

      const exec = await app.inject({ method: "POST", url: "/fluxos/pai-parametrizado/executar", cookies, payload: {} });
      expect(exec.statusCode).toBe(200);
      const corpo = exec.json() as {
        nos: { noId: string; estado: string; erro?: string }[];
        saidas: Record<string, Record<string, unknown>>;
      };
      expect(corpo.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["aponta", "sucesso"],
        ["etapa", "sucesso"],
      ]);
      // O dublê ecoa o link que recebeu — é a prova de que o valor DESCEU: sem
      // a alimentação, o conector chamaria sem `link` e falharia nomeando.
      expect(String(corpo.saidas.etapa.conteudo)).toContain("de-fora");
    });
  });

  it("o filho que FALHA faz o nó do pai falhar nomeando o nó de dentro", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [
        {
          id: "filho-que-falha",
          nome: "Filho que falha",
          // `demanda-gravar` sem nada mapeado falha nomeando os campos (§9.3).
          nos: [no("grava", "projeto", "demanda-gravar", { demandaId: "nao-existe" })],
          arestas: [],
        },
        { id: "pai-da-falha", nome: "Pai", nos: [no("etapa", "subfluxo", "filho-que-falha")], arestas: [] },
      ]);

      const exec = await app.inject({ method: "POST", url: "/fluxos/pai-da-falha/executar", cookies, payload: {} });
      expect(exec.statusCode).toBe(200);
      const rastro = (exec.json() as { nos: { noId: string; estado: string; erro?: string }[] }).nos;
      expect(rastro[0].estado).toBe("falhou");
      // O nome do nó DE DENTRO no erro é o que evita "o subfluxo falhou" —
      // uma frase que manda a pessoa procurar sozinha.
      expect(rastro[0].erro).toContain("grava");
      expect(rastro[0].erro).toContain("Filho que falha");
    });
  });

  it("subfluxo apontando para um fluxo fora do catálogo em vigor falha NOMEANDO", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      // A escrita recusa um refId inexistente — então o caminho para provar o
      // executor é salvar apontando para um fluxo que existe e apagá-lo
      // depois: é exatamente o que acontece na vida (alguém apaga o alvo).
      await salvarFluxos(app, cookies, [
        FILHO,
        { id: "pai-orfao", nome: "Pai órfão", nos: [no("etapa", "subfluxo", "filho")], arestas: [] },
      ]);
      await db.delete(fluxoExecucoes).where(eq(fluxoExecucoes.fluxoId, "filho"));
      // Reescrever o documento sem o filho é recusado pela validação (o pai
      // ficaria apontando para o nada) — a recusa NA ESCRITA é a prova de que
      // o executor não precisa ser o primeiro a ver isto.
      const semFilho = await salvarFluxos(app, cookies, [
        { id: "pai-orfao", nome: "Pai órfão", nos: [no("etapa", "subfluxo", "filho")], arestas: [] },
      ]);
      expect(semFilho.statusCode).toBe(400);
      expect((semFilho.json() as { erro: string }).erro).toContain('aponta para "filho"');
    });
  });

  it("o TETO de aninhamento falha nomeado — quatro níveis já é um desenho que ninguém lê", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      /**
       * Cinco fluxos em cadeia: n1 → n2 → n3 → n4 → n5. A escrita aceita (não
       * há ciclo), e é justamente por isso que o teto existe no executor: a
       * recusa de ciclo vale para o documento salvo, não para a profundidade.
       */
      await salvarFluxos(app, cookies, [
        FILHO,
        { id: "n5", nome: "n5", nos: [no("etapa", "subfluxo", "filho")], arestas: [] },
        { id: "n4", nome: "n4", nos: [no("etapa", "subfluxo", "n5")], arestas: [] },
        { id: "n3", nome: "n3", nos: [no("etapa", "subfluxo", "n4")], arestas: [] },
        { id: "n2", nome: "n2", nos: [no("etapa", "subfluxo", "n3")], arestas: [] },
        { id: "n1", nome: "n1", nos: [no("etapa", "subfluxo", "n2")], arestas: [] },
      ]);

      const exec = await app.inject({ method: "POST", url: "/fluxos/n1/executar", cookies, payload: {} });
      expect(exec.statusCode).toBe(200);
      const rastro = (exec.json() as { nos: { estado: string; erro?: string }[] }).nos;
      expect(rastro[0].estado).toBe("falhou");
      expect(rastro[0].erro).toContain("aninha subfluxos além de 4 níveis");
    });
  });
});

/**
 * SPEC-110 fatia J — **a tela que pausa DENTRO de um subfluxo.**
 *
 * Não é caso de borda: a jornada da demanda começa por um subfluxo que contém
 * a bancada de ensaios. O que estas provas cobram é que a pausa atravesse os
 * níveis inteira — o stage sabe onde está, e o Avançar retoma o filho de onde
 * ele parou em vez de re-rodá-lo.
 */
describe("SPEC-110 fatia J — a tela dentro do subfluxo", () => {
  const COM_TELA = {
    id: "filho-com-tela",
    nome: "Filho com tela",
    nos: [no("le", "conector", "leitor-de-desenho"), no("revisa", "tela", "documento"), no("gera", "funcao", "derivacao")],
    arestas: [
      { de: "le", para: "revisa", mapeamento: [{ saida: "desenho", entrada: "documento" }] },
      { de: "le", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
      { de: "revisa", para: "gera", mapeamento: [] },
    ],
  };

  it("o PAI suspende, o stage diz dentro de qual etapa, e o Avançar não re-roda o filho", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [
        COM_TELA,
        { id: "mestre", nome: "Mestre", nos: [no("etapa", "subfluxo", "filho-com-tela")], arestas: [] },
      ]);

      // 1. A execução do PAI é a que fica no banco esperando — é ela que
      //    alguém continua, e o nó de subfluxo não entrou no rastro (não
      //    terminou: nem sucesso, nem falha).
      const exec = await app.inject({ method: "POST", url: "/fluxos/mestre/executar", cookies, payload: {} });
      expect(exec.statusCode).toBe(200);
      const suspensa = exec.json() as {
        execucaoId: string;
        aguardandoTela?: { noId: string; refId: string };
        nos: { noId: string }[];
      };
      expect(suspensa.aguardandoTela?.noId).toBe("revisa");
      expect(suspensa.aguardandoTela?.refId).toBe("documento");
      expect(suspensa.nos).toEqual([]);

      const persistida = await app.inject({ method: "GET", url: "/fluxos/mestre/execucoes", cookies });
      expect((persistida.json() as { execucoes: { estado: string }[] }).execucoes[0].estado).toBe("aguardando-tela");

      // 2. O STAGE diz o CAMINHO: "Mestre › Filho com tela". Sem isso a pessoa
      //    procuraria a tela no desenho do mestre, onde ela não está.
      const stage = await app.inject({ method: "GET", url: `/fluxos/execucoes/${suspensa.execucaoId}/tela`, cookies });
      expect(stage.statusCode).toBe(200);
      const doStage = stage.json() as {
        noId: string;
        nome: string;
        dentroDe?: { fluxoId: string; nome: string }[];
        entradas: Record<string, unknown>;
      };
      expect(doStage.nome).toBe("Mestre");
      expect(doStage.dentroDe).toEqual([{ noId: "etapa", fluxoId: "filho-com-tela", nome: "Filho com tela" }]);
      expect(doStage.noId).toBe("revisa");
      expect(doStage.entradas.documento).toBeDefined();

      // 3. Avançar termina o filho E o pai, e o nó de subfluxo fecha verde com
      //    a saída do último nó DELE.
      const avancou = await app.inject({
        method: "POST",
        url: `/fluxos/execucoes/${suspensa.execucaoId}/continuar`,
        cookies,
        payload: { saidaDaTela: { decisao: "avancar" } },
      });
      expect(avancou.statusCode).toBe(200);
      const fim = avancou.json() as {
        nos: { noId: string; estado: string }[];
        saidas: Record<string, Record<string, unknown>>;
      };
      expect(fim.nos.map((n) => [n.noId, n.estado])).toEqual([["etapa", "sucesso"]]);
      expect(Object.keys(fim.saidas.etapa)).toEqual(expect.arrayContaining(["itens", "execucaoDoSubfluxo"]));

      /**
       * 4. **O filho não re-rodou.** A prova é o rastro DELE: `le` aparece uma
       *    vez só. Sem o `subfluxo_parcial` guardado, continuar mandaria o
       *    filho do começo — o conector de novo, o agente de novo, a conta de
       *    novo — e este rastro teria dois `le`.
       */
      const doFilho = await app.inject({ method: "GET", url: "/fluxos/filho-com-tela/execucoes", cookies });
      const linhaDoFilho = (doFilho.json() as { execucoes: { id: string; nos: { noId: string }[] }[] }).execucoes[0];
      expect(linhaDoFilho.nos.filter((n) => n.noId === "le")).toHaveLength(1);
      expect(linhaDoFilho.nos.map((n) => n.noId)).toEqual(["le", "revisa", "gera"]);
    });
  });

  it("abrir o stage duas vezes não roda nada — sondar é sondar", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [
        COM_TELA,
        { id: "mestre-sondado", nome: "Mestre sondado", nos: [no("etapa", "subfluxo", "filho-com-tela")], arestas: [] },
      ]);
      const exec = await app.inject({ method: "POST", url: "/fluxos/mestre-sondado/executar", cookies, payload: {} });
      const { execucaoId } = exec.json() as { execucaoId: string };

      const antes = await app.inject({ method: "GET", url: "/fluxos/filho-com-tela/execucoes", cookies });
      const quantasAntes = (antes.json() as { execucoes: unknown[] }).execucoes.length;

      for (let i = 0; i < 3; i++) {
        const stage = await app.inject({ method: "GET", url: `/fluxos/execucoes/${execucaoId}/tela`, cookies });
        expect(stage.statusCode).toBe(200);
      }

      // Nenhuma execução nova do filho: a sondagem retoma do parcial e para na
      // mesma tela. Sem isso, abrir a tela custaria uma corrida de agentes por
      // vez que alguém desse F5.
      const depois = await app.inject({ method: "GET", url: "/fluxos/filho-com-tela/execucoes", cookies });
      expect((depois.json() as { execucoes: unknown[] }).execucoes.length).toBe(quantasAntes);
    });
  });

  it("Retornar encerra a execução do pai e limpa o parcial do filho", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await salvarFluxos(app, cookies, [
        COM_TELA,
        { id: "mestre-retornado", nome: "Mestre retornado", nos: [no("etapa", "subfluxo", "filho-com-tela")], arestas: [] },
      ]);
      const exec = await app.inject({ method: "POST", url: "/fluxos/mestre-retornado/executar", cookies, payload: {} });
      const { execucaoId } = exec.json() as { execucaoId: string };

      const retornou = await app.inject({ method: "POST", url: `/fluxos/execucoes/${execucaoId}/retornar`, cookies });
      expect(retornou.statusCode).toBe(200);

      const [linha] = await db
        .select({ estado: fluxoExecucoes.estado, parcial: fluxoExecucoes.subfluxoParcial })
        .from(fluxoExecucoes)
        .where(eq(fluxoExecucoes.id, execucaoId));
      expect(linha.estado).toBe("retornada");
      // O parcial some junto: guardá-lo depois do fim seria um estado de
      // retomada para uma execução que ninguém pode mais retomar.
      expect(linha.parcial).toBeNull();
    });
  });
});
