import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Aresta, Diagrama, No } from "../model/types.js";
import { avaliarTopologia, violacoesDeFormaAceitas, violacoesDeFormaEmAberto } from "./topologia.js";
import { validateRegras } from "../config/validator.js";

const config: DiagramaConfig = {
  nodeTypes: {
    fila: { label: "Fila Rabbit", derives: "queue", techs: ["Backend"], contextos: [], spec: [] },
    service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
    app: { label: "App", derives: "app", techs: ["Mobile"], contextos: [], spec: [] },
    banco: { label: "Tabela SQL", derives: "db", techs: ["Backend"], contextos: [], spec: [] },
  },
  edgeTypes: {
    consome: { label: "consome" },
    escreve: { label: "escreve" },
    le: { label: "lê" },
  },
  edgeRules: {},
};

function no(id: string, type: string, label = id): No {
  return { id, type, x: 0, y: 0, label, status: "novo", spec: {}, specNA: {} };
}
function aresta(id: string, source: string, target: string, type: string): Aresta {
  return { id, source, target, type };
}
function diagrama(nodes: No[], edges: Aresta[] = []): Diagrama {
  return { nodes, edges };
}

const FILA_SEM_CONSUMIDOR: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: {},
  topologia: [
    {
      id: "t-fila-consumidor",
      texto: "Toda fila tem consumidor",
      porque: "Fila sem quem consuma acumula em silêncio até estourar o disco.",
      checagem: { tipo: "exige-conexao", tipoNo: "fila", direcao: "sai", tipoAresta: "consome" },
    },
  ],
};

const APP_NAO_FALA_COM_BANCO: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: {},
  topologia: [
    {
      id: "t-app-banco",
      texto: "O app não fala direto com o banco",
      porque: "Toda escrita passa por um serviço, que é onde a regra de negócio mora.",
      checagem: { tipo: "proibe-conexao", deTipoNo: "app", paraTipoNo: "banco" },
    },
  ],
};

describe("avaliarTopologia — a régua sobre a FORMA (SPEC-63)", () => {
  it("sem regra de forma, não mede nada", () => {
    const d = diagrama([no("q1", "fila")]);

    expect(avaliarTopologia(d, config)).toEqual([]);
  });

  it("fila sem consumidor: cada nó está completo e a mensagem não chega a lugar nenhum", () => {
    // É a classe de defeito que não mora em elemento nenhum nem em caminho
    // nenhum: mora na AUSÊNCIA de uma ligação.
    const d = diagrama([no("q1", "fila", "pedidos.q")]);

    const violacoes = avaliarTopologia(d, config, FILA_SEM_CONSUMIDOR);

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].noId).toBe("q1");
    expect(violacoes[0].arestaId).toBeUndefined();
    expect(violacoes[0].rotulo).toBe("pedidos.q");
    expect(violacoes[0].esperado).toContain("consome");
    expect(violacoes[0].atual).toBe("nenhuma");
    // §242 — o porquê é o que separa ensinar de cobrar.
    expect(violacoes[0].porque).toContain("acumula em silêncio");
  });

  it("fila COM consumidor não viola", () => {
    const d = diagrama([no("q1", "fila"), no("s1", "service")], [aresta("e1", "q1", "s1", "consome")]);

    expect(avaliarTopologia(d, config, FILA_SEM_CONSUMIDOR)).toEqual([]);
  });

  it("a DIREÇÃO e o TIPO da conexão importam — senão a régua diria sim para qualquer seta", () => {
    const direcaoErrada = diagrama([no("q1", "fila"), no("s1", "service")], [aresta("e1", "s1", "q1", "consome")]);
    expect(avaliarTopologia(direcaoErrada, config, FILA_SEM_CONSUMIDOR)).toHaveLength(1);

    const tipoErrado = diagrama([no("q1", "fila"), no("s1", "service")], [aresta("e1", "q1", "s1", "le")]);
    expect(avaliarTopologia(tipoErrado, config, FILA_SEM_CONSUMIDOR)).toHaveLength(1);
  });

  it("exigir conexão PARA um tipo específico não aceita conexão para outro", () => {
    const regras: RegrasConfig = {
      ...FILA_SEM_CONSUMIDOR,
      topologia: [
        {
          id: "t-fila-servico",
          texto: "Quem consome a fila é um serviço",
          checagem: { tipo: "exige-conexao", tipoNo: "fila", direcao: "sai", tipoNoOposto: "service" },
        },
      ],
    };
    const paraOutro = diagrama([no("q1", "fila"), no("b1", "banco")], [aresta("e1", "q1", "b1", "escreve")]);

    expect(avaliarTopologia(paraOutro, config, regras)).toHaveLength(1);
  });

  it("aresta proibida acusa a ARESTA, não o nó — é a seta que não devia existir", () => {
    const d = diagrama(
      [no("a1", "app", "App iOS"), no("b1", "banco", "tb_pedidos")],
      [aresta("e1", "a1", "b1", "escreve")]
    );

    const violacoes = avaliarTopologia(d, config, APP_NAO_FALA_COM_BANCO);

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].arestaId).toBe("e1");
    expect(violacoes[0].noId).toBeUndefined();
    expect(violacoes[0].rotulo).toContain("App iOS");
    expect(violacoes[0].rotulo).toContain("tb_pedidos");
  });

  it("o mesmo par por outro caminho NÃO viola — 'passa por um serviço' é a proibição direta", () => {
    // A SPEC recusou um operador `exige-intermediario` porque ele já é isto: o
    // caminho desejado não precisa ser afirmado, precisa ser o único que sobra.
    const d = diagrama(
      [no("a1", "app"), no("s1", "service"), no("b1", "banco")],
      [aresta("e1", "a1", "s1", "escreve"), aresta("e2", "s1", "b1", "escreve")]
    );

    expect(avaliarTopologia(d, config, APP_NAO_FALA_COM_BANCO)).toEqual([]);
  });

  it("nó EXISTENTE também é cobrado — o desenho é a verdade que a mesa mede", () => {
    // §4.1: "o consumidor existe, só não foi desenhado" é justamente o desenho
    // incompleto que esta ferramenta existe para revelar. Quem tem o caso
    // legítimo tem a válvula da exceção.
    const d = diagrama([{ ...no("q1", "fila"), status: "existente" }]);

    expect(avaliarTopologia(d, config, FILA_SEM_CONSUMIDOR)).toHaveLength(1);
  });
});

/**
 * SPEC-63 §3.2 — falhar alto. Regra que aponta para um tipo que não existe não
 * é regra frouxa: é regra que nunca dispara, e descobrir isso por silêncio é o
 * pior jeito.
 */
describe("validateRegras — a régua de forma que nunca dispararia", () => {
  const app = { techs: ["Backend", "Mobile"], contextos: [] } as unknown as Parameters<typeof validateRegras>[1];
  const comTopologia = (topologia: RegrasConfig["topologia"]): RegrasConfig => ({
    tipos: [],
    tamanhos: [],
    porTech: {},
    topologia,
  });

  it("tipo de componente inexistente é reprovado, com o caminho exato", () => {
    const erros = validateRegras(
      comTopologia([
        { id: "t1", texto: "x", checagem: { tipo: "exige-conexao", tipoNo: "inventado", direcao: "sai" } },
      ]),
      app,
      config
    );

    expect(erros.map((e) => e.campo)).toContain("topologia[0].checagem.tipoNo");
    expect(erros[0].mensagem).toContain("não existe em diagrama.json");
  });

  it("tipo de CONEXÃO inexistente é reprovado", () => {
    const erros = validateRegras(
      comTopologia([
        { id: "t1", texto: "x", checagem: { tipo: "exige-conexao", tipoNo: "fila", direcao: "sai", tipoAresta: "inventada" } },
      ]),
      app,
      config
    );

    expect(erros.map((e) => e.campo)).toContain("topologia[0].checagem.tipoAresta");
  });

  it("id repetido é reprovado — duas regras dividiriam as mesmas exceções", () => {
    const erros = validateRegras(
      comTopologia([
        { id: "t1", texto: "a", checagem: { tipo: "exige-conexao", tipoNo: "fila", direcao: "sai" } },
        { id: "t1", texto: "b", checagem: { tipo: "exige-conexao", tipoNo: "fila", direcao: "entra" } },
      ]),
      app,
      config
    );

    expect(erros.some((e) => e.mensagem.includes("está repetido"))).toBe(true);
  });

  it("id vazio é reprovado — é para ele que a exceção aponta", () => {
    const erros = validateRegras(
      comTopologia([{ id: "  ", texto: "x", checagem: { tipo: "proibe-conexao", deTipoNo: "app", paraTipoNo: "banco" } }]),
      app,
      config
    );

    expect(erros.some((e) => e.campo === "topologia[0].id")).toBe(true);
  });

  it("sem o diagrama, as outras validações rodam e as de forma se calam", () => {
    // Validar pela metade é melhor que exigir um argumento que a maioria dos
    // chamadores não tem por que conhecer.
    const erros = validateRegras(
      comTopologia([{ id: "t1", texto: "x", checagem: { tipo: "exige-conexao", tipoNo: "inventado", direcao: "sai" } }]),
      app
    );

    expect(erros).toEqual([]);
  });
});

/**
 * §242 aplicado à forma — a válvula que mantém o mecanismo vivo.
 */
describe("avaliarTopologia — a exceção com motivo", () => {
  const excecao = {
    noId: "q1",
    campo: "",
    regraId: "t-fila-consumidor",
    motivo: "o consumidor entra na próxima demanda, já combinado com o time de billing",
    autor: "ana@empresa",
    em: "2026-08-20T10:00:00.000Z",
  };

  it("a violação aceita sai do que COBRA, sem sair do histórico", () => {
    const d = diagrama([no("q1", "fila")]);

    const todas = avaliarTopologia(d, config, FILA_SEM_CONSUMIDOR, [excecao]);

    expect(todas).toHaveLength(1);
    expect(violacoesDeFormaEmAberto(todas)).toEqual([]);
    expect(violacoesDeFormaAceitas(todas)[0].excecao?.motivo).toContain("próxima demanda");
  });

  it("a exceção aponta para o ID da regra, não para o texto — renomear não a desliga", () => {
    const d = diagrama([no("q1", "fila")]);
    const renomeada: RegrasConfig = {
      ...FILA_SEM_CONSUMIDOR,
      topologia: [{ ...FILA_SEM_CONSUMIDOR.topologia![0], texto: "Toda fila precisa de alguém que a consuma" }],
    };

    expect(violacoesDeFormaEmAberto(avaliarTopologia(d, config, renomeada, [excecao]))).toEqual([]);
  });

  it("exceção de OUTRO elemento não silencia esta violação", () => {
    const d = diagrama([no("q1", "fila"), no("q2", "fila")]);

    const abertas = violacoesDeFormaEmAberto(avaliarTopologia(d, config, FILA_SEM_CONSUMIDOR, [excecao]));

    expect(abertas.map((v) => v.noId)).toEqual(["q2"]);
  });

  it("exceção de VALOR (com campo, sem regraId) não silencia violação de forma", () => {
    // As duas moram na mesma coleção; o que as separa é o par que identifica.
    const d = diagrama([no("q1", "fila")]);
    const deValor = { noId: "q1", campo: "timeoutMs", motivo: "x", autor: "ana", em: "2026-08-20T10:00:00.000Z" };

    expect(violacoesDeFormaEmAberto(avaliarTopologia(d, config, FILA_SEM_CONSUMIDOR, [deValor]))).toHaveLength(1);
  });

  it("aresta proibida também aceita exceção — a violação mora na seta, a exceção também", () => {
    const d = diagrama([no("a1", "app"), no("b1", "banco")], [aresta("e1", "a1", "b1", "escreve")]);
    const naAresta = {
      noId: "e1",
      campo: "",
      regraId: "t-app-banco",
      motivo: "legado que sai no próximo trimestre",
      autor: "ana",
      em: "2026-08-20T10:00:00.000Z",
    };

    expect(violacoesDeFormaEmAberto(avaliarTopologia(d, config, APP_NAO_FALA_COM_BANCO, [naAresta]))).toEqual([]);
  });
});
