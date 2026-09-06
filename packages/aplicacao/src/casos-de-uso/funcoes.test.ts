import { describe, expect, it } from "vitest";
import { derivar, resolverDependencias, type DiagramaConfig } from "@gerador/engine";
import { EntradaDaFuncaoInvalida, executarFuncao, type ContextoDasFuncoes } from "./funcoes.js";
import { FUNCOES_DO_SISTEMA } from "../config/funcoes.js";

/**
 * SPEC-107 fatia A — o executor de funções, na metade pura.
 *
 * O vocabulário aqui é MÍNIMO e local de propósito: o que se prova é o
 * contrato (obrigatório ausente barra, forma errada barra, §263 um executor
 * só) — a paridade com a config real é provada na rota e no E2E, contra o
 * mesmo banco que o botão da mesa usa.
 */
const CONFIG_MINIMA = {
  nodeTypes: {
    service: {
      label: "Serviço",
      techs: ["Backend"],
      contextos: ["Backend"],
      spec: [
        { key: "nome", label: "Nome", type: "text", required: true },
        { key: "linguagem", label: "Linguagem", type: "text" },
      ],
    },
  },
  edgeTypes: { http: { label: "HTTP" } },
  edgeRules: {},
} as unknown as DiagramaConfig;

const CONTEXTO: ContextoDasFuncoes = { diagramaConfig: CONFIG_MINIMA, tokens: [] };

const DESENHO = {
  diagrama: {
    nodes: [
      {
        id: "a",
        type: "service",
        x: 0,
        y: 0,
        label: "Aprovação",
        status: "novo",
        // `nome` obrigatório por preencher — derivar produz item de completude.
        spec: { linguagem: { valor: "Kotlin", origem: "manual" } },
        specNA: {},
      },
    ],
    edges: [],
  },
};

describe("o registro de funções (SPEC-107 fatia A)", () => {
  it("toda função declara contrato e governança — registro sem elas é meia-integração", () => {
    for (const funcao of FUNCOES_DO_SISTEMA) {
      expect(funcao.id).toBeTruthy();
      expect(funcao.nome).toBeTruthy();
      expect(funcao.governanca.nivel).toBe("operar");
      expect(funcao.governanca.recurso).toBe("fluxos.executar");
      const chaves = [...funcao.entrada, ...funcao.saida].map((c) => c.chave);
      expect(new Set(chaves).size).toBe(chaves.length);
    }
  });

  it("o rótulo é genérico (§2.3): nem 'engine' nem 'derivar' aparecem na interface", () => {
    for (const funcao of FUNCOES_DO_SISTEMA) {
      expect(funcao.nome.toLowerCase()).not.toContain("engine");
      expect(funcao.nome.toLowerCase()).not.toContain("derivar");
    }
  });
});

describe("executarFuncao — derivacao (modo b)", () => {
  it("§9.3 — desenho obrigatório ausente barra, com o nome do que faltou", () => {
    expect(() => executarFuncao("derivacao", {}, CONTEXTO)).toThrow(EntradaDaFuncaoInvalida);
    expect(() => executarFuncao("derivacao", {}, CONTEXTO)).toThrow(/"desenho".*não vira default/);
  });

  it("desenho sem a forma de desenho barra dizendo o que se esperava", () => {
    expect(() => executarFuncao("derivacao", { desenho: "um texto" }, CONTEXTO)).toThrow(/forma de um desenho/);
    expect(() => executarFuncao("derivacao", { desenho: { qualquer: 1 } }, CONTEXTO)).toThrow(/diagrama/);
  });

  it("função desconhecida barra — o registro é fechado", () => {
    expect(() => executarFuncao("telepatia", {}, CONTEXTO)).toThrow(/não conheço a função "telepatia"/);
  });

  it("§263 — a função devolve EXATAMENTE o que o motor devolve: um executor só, byte a byte", () => {
    const saida = executarFuncao("derivacao", { desenho: DESENHO }, CONTEXTO);
    const doMotor = resolverDependencias(derivar(DESENHO.diagrama as never, CONFIG_MINIMA, { tokens: [] }));

    expect(saida.itens).toEqual(doMotor.atividades);
    expect((saida.itens as unknown[]).length).toBeGreaterThan(0);
    expect(saida.conformidade).toEqual({
      podeDerivar: doMotor.podeDerivar,
      ciclos: doMotor.ciclos,
      conflitos: doMotor.conflitos,
    });
  });

  it("§5.4 — mesma fiação + mesmas entradas → mesmos itens (duas execuções, resultado idêntico)", () => {
    const primeira = executarFuncao("derivacao", { desenho: DESENHO }, CONTEXTO);
    const segunda = executarFuncao("derivacao", { desenho: DESENHO }, CONTEXTO);
    expect(segunda).toEqual(primeira);
  });
});

describe("executarFuncao — ensaio", () => {
  it("sem cenário devolve a âncora de hoje; com cenário, o resultado dele junto", () => {
    const soHoje = executarFuncao("ensaio", { desenho: DESENHO }, CONTEXTO) as {
      leitura: { hoje: unknown; resultado?: unknown };
    };
    expect(soHoje.leitura.hoje).toBeDefined();
    expect(soHoje.leitura.resultado).toBeUndefined();

    const cenario = { id: "c1", nome: "bureau lento", ajustes: [] };
    const comCenario = executarFuncao("ensaio", { desenho: DESENHO, cenario }, CONTEXTO) as {
      leitura: { hoje: unknown; resultado?: { cenarioId: string } };
    };
    expect(comCenario.leitura.resultado?.cenarioId).toBe("c1");
  });

  it("§9.3 — o desenho continua obrigatório também aqui", () => {
    expect(() => executarFuncao("ensaio", { cenario: {} }, CONTEXTO)).toThrow(/"desenho"/);
  });
});
