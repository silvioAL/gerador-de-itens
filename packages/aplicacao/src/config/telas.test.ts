import { describe, expect, it } from "vitest";
import { executarFluxo } from "../casos-de-uso/fluxos.js";
import { noDeGatilhoManual, validarEscritaFluxos, type Fluxo } from "./fluxos.js";
import { ConfigInvalida } from "./normalizacao.js";
import {
  CAMPO_DA_DECISAO,
  TELAS_DO_SISTEMA,
  contratoDaTelaDeclarada,
  idDaTelaDeclarada,
  normalizarTelas,
  problemaNaSaidaDaTela,
  refIdDaTelaDeclarada,
  telaDoSistema,
  telaEmVigorPorRefId,
  telasEmVigor,
  validarEscritaTelas,
} from "./telas.js";

/**
 * SPEC-110 fatia B — **a tela como nó: o executor é GENTE.**
 *
 * O pedido do usuário, à letra: *"seria feita a conexão com essa screen, o
 * agente iria gerar o ensaio, e depois o usuário revisa, e decide avançar
 * para a derivação, ou retornar"*. As provas cobram as três consequências: a
 * execução SUSPENDE na tela levando o que ela mostra, o Avançar continua com
 * a decisão da pessoa, e a saída é validada contra o contrato declarado.
 */

const EXECUTORES = {
  conector: async () => ({}),
  agente: async () => ({}),
  funcao: async (no: { id: string }) => ({ leitura: { de: no.id }, itens: ["a", "b"] }),
  projeto: async () => ({ desenho: { diagrama: {} } }),
  transformacao: async () => ({}),
};

/** gatilho → funcao(produz) → TELA → funcao(depois) */
const FLUXO_COM_TELA: Fluxo = {
  id: "com-tela",
  nome: "Com tela",
  nos: [
    noDeGatilhoManual({ x: 0, y: 0 }),
    { id: "produz", tipo: "funcao", refId: "ensaio", posicao: { x: 200, y: 0 }, parametros: {} },
    { id: "revisa", tipo: "tela", refId: "bancada-de-ensaios", posicao: { x: 400, y: 0 }, parametros: {} },
    { id: "depois", tipo: "funcao", refId: "derivacao", posicao: { x: 600, y: 0 }, parametros: {} },
  ],
  arestas: [
    { de: "gatilho", para: "produz", mapeamento: [] },
    { de: "produz", para: "revisa", mapeamento: [{ saida: "leitura", entrada: "ensaio" }] },
    { de: "revisa", para: "depois", mapeamento: [] },
  ],
};

describe("TELAS_DO_SISTEMA (o registro fechado)", () => {
  it("as três telas do sistema são as que já existem no produto", () => {
    expect(TELAS_DO_SISTEMA.map((t) => t.id)).toEqual(["bancada-de-ensaios", "documento", "mesa"]);
    expect(telaDoSistema("nao-existe")).toBeUndefined();
  });

  it("TODA tela emite a decisão — é o que torna avançar/retornar fiável (D2)", () => {
    for (const tela of TELAS_DO_SISTEMA) {
      expect(tela.saida.map((c) => c.chave), tela.id).toContain(CAMPO_DA_DECISAO.chave);
    }
  });

  it("o cartão leva rótulo curto — a frase inteira esconde o vizinho (lição da fatia A)", () => {
    for (const tela of TELAS_DO_SISTEMA) {
      expect(tela.rotuloCurto.length, tela.id).toBeLessThan(22);
    }
  });
});

describe("problemaNaSaidaDaTela", () => {
  const bancada = telaDoSistema("bancada-de-ensaios")!;

  it("aceita a decisão do catálogo, e só ela", () => {
    expect(problemaNaSaidaDaTela(bancada, { decisao: "avancar" })).toBeNull();
    expect(problemaNaSaidaDaTela(bancada, { decisao: "retornar" })).toBeNull();
    expect(problemaNaSaidaDaTela(bancada, { decisao: "talvez" })).toMatch(/decisao/);
    expect(problemaNaSaidaDaTela(bancada, {})).toMatch(/decisao/);
  });

  it("campo obrigatório ausente é recusado NOMEANDO — não vira default (§9.3)", () => {
    const comObrigatorio = {
      saida: [CAMPO_DA_DECISAO, { chave: "motivo", rotulo: "Motivo", tipo: "texto" as const, obrigatorio: true }],
    };
    expect(problemaNaSaidaDaTela(comObrigatorio, { decisao: "avancar" })).toMatch(/"motivo"/);
    expect(problemaNaSaidaDaTela(comObrigatorio, { decisao: "avancar", motivo: "" })).toMatch(/"motivo"/);
    expect(problemaNaSaidaDaTela(comObrigatorio, { decisao: "avancar", motivo: "ok" })).toBeNull();
  });
});

describe("validarEscritaFluxos e a tela", () => {
  it("recusa tela fora do registro — nunca ganharia executor (§9.3)", () => {
    expect(() =>
      validarEscritaFluxos({
        fluxos: [{ id: "f", nome: "F", nos: [{ id: "t", tipo: "tela", refId: "inventada" }], arestas: [] }],
      })
    ).toThrow(ConfigInvalida);
  });

  it("aceita as do sistema", () => {
    expect(() =>
      validarEscritaFluxos({
        fluxos: [{ id: "f", nome: "F", nos: [{ id: "t", tipo: "tela", refId: "mesa" }], arestas: [] }],
      })
    ).not.toThrow();
  });
});

describe("o executor da tela (a suspensão que espera GENTE)", () => {
  it("SUSPENDE na tela, levando o que ela vai mostrar — e o que vem depois não roda", async () => {
    const r = await executarFluxo(FLUXO_COM_TELA, EXECUTORES);
    expect(r.aguardandoTela).toEqual({
      noId: "revisa",
      refId: "bancada-de-ensaios",
      entradas: { ensaio: { de: "produz" } },
    });
    // A tela NÃO está no rastro: ela não rodou, está esperando (a mesma régua
    // do gate — esperando não é falha nem pulo).
    expect(r.nos.map((n) => n.noId)).toEqual(["gatilho", "produz"]);
    // E o gate de confirmação continua sendo OUTRA coisa.
    expect(r.aguardandoEm).toBeUndefined();
  });

  it("o AVANÇAR continua com a decisão da pessoa como saída do nó", async () => {
    const primeira = await executarFluxo(FLUXO_COM_TELA, EXECUTORES);
    const r = await executarFluxo(FLUXO_COM_TELA, EXECUTORES, {
      retomarDe: {
        saidas: primeira.saidas,
        concluidos: primeira.nos.filter((n) => n.estado === "sucesso").map((n) => n.noId),
        saidaDaTela: { noId: "revisa", saida: { decisao: "avancar", ensaioAprovado: { ok: true } } },
      },
    });
    expect(r.aguardandoTela).toBeUndefined();
    expect(r.nos.map((n) => [n.noId, n.estado])).toEqual([
      ["revisa", "sucesso"],
      ["depois", "sucesso"],
    ]);
    // A saída da tela é a da PESSOA, e o rastro guarda o que ela viu.
    expect(r.saidas["revisa"]).toEqual({ decisao: "avancar", ensaioAprovado: { ok: true } });
    expect(r.nos.find((n) => n.noId === "revisa")?.entradas).toEqual({ ensaio: { de: "produz" } });
  });

  it("retomar SEM a decisão suspende na mesma tela — o nó não roda sozinho", async () => {
    const primeira = await executarFluxo(FLUXO_COM_TELA, EXECUTORES);
    const r = await executarFluxo(FLUXO_COM_TELA, EXECUTORES, {
      retomarDe: {
        saidas: primeira.saidas,
        concluidos: primeira.nos.filter((n) => n.estado === "sucesso").map((n) => n.noId),
      },
    });
    expect(r.aguardandoTela?.noId).toBe("revisa");
    expect(r.nos).toHaveLength(0);
  });

  it("a decisão de OUTRO nó não destrava esta tela", async () => {
    const r = await executarFluxo(FLUXO_COM_TELA, EXECUTORES, {
      retomarDe: { saidas: {}, concluidos: [], saidaDaTela: { noId: "outra", saida: { decisao: "avancar" } } },
    });
    expect(r.aguardandoTela?.noId).toBe("revisa");
  });

  it("duas telas na fiação param DUAS vezes — vários pontos de revisão são vários", async () => {
    const fluxo: Fluxo = {
      ...FLUXO_COM_TELA,
      nos: [
        ...FLUXO_COM_TELA.nos,
        { id: "revisa2", tipo: "tela", refId: "documento", posicao: { x: 800, y: 0 }, parametros: {} },
      ],
      arestas: [...FLUXO_COM_TELA.arestas, { de: "depois", para: "revisa2", mapeamento: [] }],
    };
    const primeira = await executarFluxo(fluxo, EXECUTORES);
    expect(primeira.aguardandoTela?.noId).toBe("revisa");
    const segunda = await executarFluxo(fluxo, EXECUTORES, {
      retomarDe: {
        saidas: primeira.saidas,
        concluidos: primeira.nos.filter((n) => n.estado === "sucesso").map((n) => n.noId),
        saidaDaTela: { noId: "revisa", saida: { decisao: "avancar" } },
      },
    });
    expect(segunda.aguardandoTela?.noId).toBe("revisa2");
  });
});

/**
 * SPEC-110 fatia C (D5) — **criar e editar telas é do usuário.**
 *
 * A régua da casa em duas metades (SPEC-35): a LEITURA tolera — o que não dá
 * para desenhar sai e o resto da tela continua de pé; a ESCRITA recusa
 * nomeando — porque o que a leitura descarta em silêncio some do documento
 * salvo, e a pessoa só descobre quando a tela abre sem o bloco que ela acabou
 * de criar.
 */
describe("normalizarTelas (a leitura tolerante)", () => {
  it("o exemplo da SPEC atravessa inteiro", () => {
    const tela = {
      id: "aprovacao",
      nome: "Aprovar a proposta",
      blocos: [
        { tipo: "texto", markdown: "Confira antes de seguir." },
        { tipo: "dado", chave: "proposta", rotulo: "Proposta", formato: "documento" },
        { tipo: "campo", chave: "obs", rotulo: "Observação", entrada: "texto", obrigatorio: true },
        { tipo: "acao", rotulo: "Aprovar", acao: "avancar" },
      ],
    };
    expect(normalizarTelas({ telas: [tela] }).telas).toEqual([tela]);
  });

  it("descarta bloco sem chave, tipo desconhecido e chave repetida — o que sobra é desenhável", () => {
    const { telas } = normalizarTelas({
      telas: [
        {
          id: "t",
          blocos: [
            { tipo: "dado", chave: "a", rotulo: "A", formato: "texto" },
            { tipo: "dado", rotulo: "sem chave", formato: "texto" },
            { tipo: "grafico", chave: "b" },
            { tipo: "campo", chave: "a", rotulo: "repetida", entrada: "texto" },
          ],
        },
      ],
    });
    expect(telas[0].blocos.map((b) => b.tipo)).toEqual(["dado"]);
    // Sem nome, o id serve — a tela não fica anônima na galeria.
    expect(telas[0].nome).toBe("t");
  });

  it("formato e entrada desconhecidos caem no padrão em vez de sumir", () => {
    const { telas } = normalizarTelas({
      telas: [{ id: "t", blocos: [{ tipo: "dado", chave: "a", formato: "holograma" }, { tipo: "campo", chave: "b", entrada: "midi" }] }],
    });
    expect(telas[0].blocos).toEqual([
      { tipo: "dado", chave: "a", rotulo: "a", formato: "texto" },
      { tipo: "campo", chave: "b", rotulo: "b", entrada: "texto" },
    ]);
  });
});

describe("contratoDaTelaDeclarada (o contrato NASCE dos blocos)", () => {
  const tela = {
    id: "t",
    nome: "T",
    blocos: [
      { tipo: "texto" as const, markdown: "oi" },
      { tipo: "dado" as const, chave: "proposta", rotulo: "Proposta", formato: "documento" as const },
      { tipo: "campo" as const, chave: "obs", rotulo: "Observação", entrada: "texto" as const, obrigatorio: true as const },
      { tipo: "campo" as const, chave: "nota", rotulo: "Nota", entrada: "numero" as const },
    ],
  };

  it("entrada = os blocos `dado`; saída = a decisão + os blocos `campo`", () => {
    const { entrada, saida } = contratoDaTelaDeclarada(tela);
    expect(entrada).toEqual([{ chave: "proposta", rotulo: "Proposta", tipo: "documento" }]);
    // A decisão vem PRIMEIRO e sempre (D2) — é o que torna avançar/retornar
    // fiável no desenho, seja a tela do sistema ou do time.
    expect(saida.map((c) => c.chave)).toEqual(["decisao", "obs", "nota"]);
    expect(saida.find((c) => c.chave === "nota")?.tipo).toBe("numero");
  });

  it("o obrigatório do bloco vira o obrigatório do contrato — é o que trava o Avançar", () => {
    const { saida } = contratoDaTelaDeclarada(tela);
    expect(problemaNaSaidaDaTela({ saida }, { decisao: "avancar" })).toMatch(/"obs"/);
    expect(problemaNaSaidaDaTela({ saida }, { decisao: "avancar", obs: "conferi" })).toBeNull();
  });
});

describe("telasEmVigor (declaradas + do sistema, no mesmo vocabulário)", () => {
  const doc = {
    telas: [{ id: "aprovacao", nome: "Aprovar", icone: "✅", blocos: [{ tipo: "campo", chave: "obs", entrada: "texto" }] }],
  };

  it("a declarada usa PREFIXO no refId — criar uma tela chamada 'mesa' não sequestra a do sistema", () => {
    const vigor = telasEmVigor({ telas: [{ id: "mesa", nome: "Minha mesa", blocos: [] }] });
    expect(vigor.find((t) => t.refId === "mesa")?.origem).toBe("sistema");
    expect(vigor.find((t) => t.refId === "tela:mesa")?.origem).toBe("declarada");
  });

  it("a declarada chega com contrato, blocos e o nome que a pessoa deu no cartão", () => {
    const t = telaEmVigorPorRefId("tela:aprovacao", doc)!;
    expect(t.origem).toBe("declarada");
    expect(t.rotuloCurto).toBe("Aprovar");
    expect(t.icone).toBe("✅");
    expect(t.saida.map((c) => c.chave)).toEqual(["decisao", "obs"]);
    expect(t.blocos).toHaveLength(1);
  });

  it("sem documento, só as do sistema — e elas não trazem blocos (são delegadas, não desenhadas)", () => {
    const vigor = telasEmVigor();
    expect(vigor.every((t) => t.origem === "sistema")).toBe(true);
    expect(vigor.every((t) => t.blocos === undefined)).toBe(true);
  });

  it("idDaTelaDeclarada só reconhece o que tem prefixo", () => {
    expect(idDaTelaDeclarada("tela:aprovacao")).toBe("aprovacao");
    expect(idDaTelaDeclarada("mesa")).toBeNull();
    expect(refIdDaTelaDeclarada("aprovacao")).toBe("tela:aprovacao");
  });
});

describe("validarEscritaTelas (a escrita recusa nomeando)", () => {
  const comBlocos = (blocos: unknown[]) => ({ telas: [{ id: "t", nome: "T", blocos }] });

  it("recusa id ausente e id repetido", () => {
    expect(() => validarEscritaTelas({ telas: [{ nome: "sem id" }] })).toThrow(/sem "id"/);
    expect(() => validarEscritaTelas({ telas: [{ id: "t" }, { id: "t" }] })).toThrow(/duas telas com o id/);
  });

  it("recusa bloco de tipo desconhecido — ele sumiria do documento salvo", () => {
    expect(() => validarEscritaTelas(comBlocos([{ tipo: "grafico" }]))).toThrow(/tipo desconhecido/);
  });

  it("recusa chave ausente e chave repetida — duas chaves iguais disputam o contrato", () => {
    expect(() => validarEscritaTelas(comBlocos([{ tipo: "dado", formato: "texto" }]))).toThrow(/sem "chave"/);
    expect(() =>
      validarEscritaTelas(
        comBlocos([
          { tipo: "dado", chave: "a", formato: "texto" },
          { tipo: "campo", chave: "a", entrada: "texto" },
        ])
      )
    ).toThrow(/repete a chave "a"/);
  });

  it("recusa escolha sem opções — não haveria o que escolher, e o obrigatório travaria para sempre", () => {
    expect(() => validarEscritaTelas(comBlocos([{ tipo: "campo", chave: "c", entrada: "escolha" }]))).toThrow(/sem opções/);
    expect(() =>
      validarEscritaTelas(comBlocos([{ tipo: "campo", chave: "c", entrada: "escolha", opcoes: ["sim", "nao"] }]))
    ).not.toThrow();
  });

  it("recusa DOIS acionadores da mesma decisão (D17a) — 'qual vale?' sem resposta silenciosa", () => {
    expect(() =>
      validarEscritaTelas(
        comBlocos([
          { tipo: "acao", rotulo: "Ok", acao: "avancar" },
          { tipo: "acao", rotulo: "Seguir", acao: "avancar" },
        ])
      )
    ).toThrow(/dois botões de "avancar"/);
    // Um de cada é o par que a D17 desenhou.
    expect(() =>
      validarEscritaTelas(
        comBlocos([
          { tipo: "acao", rotulo: "Ok", acao: "avancar" },
          { tipo: "acao", rotulo: "Voltar", acao: "retornar" },
        ])
      )
    ).not.toThrow();
  });

  it("recusa texto vazio — um bloco que não diz nada não aparece", () => {
    expect(() => validarEscritaTelas(comBlocos([{ tipo: "texto", markdown: "   " }]))).toThrow(/está vazio/);
  });

  it("documento sem `telas` passa: ausência não é erro (a régua da SPEC-35)", () => {
    expect(() => validarEscritaTelas({})).not.toThrow();
    expect(() => validarEscritaTelas({ telas: "isto não é lista" })).toThrow(ConfigInvalida);
  });
});
