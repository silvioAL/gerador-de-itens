import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Diagrama, No, Percurso, ValorSpec } from "../model/types.js";
import { avaliarPercursos } from "./conformidadeDePercurso.js";
import { derivar } from "../derive/derivar.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: [],
      spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }],
    },
    // Um tipo que NÃO declara o campo: nó desses no caminho não é omissão.
    banco: { label: "Banco", derives: "db", techs: ["Backend"], contextos: [], spec: [{ key: "engine", label: "Engine", type: "text" }] },
  },
  edgeTypes: {},
  edgeRules: {},
};

function no(id: string, tipo = "service", timeoutMs?: number): No {
  const spec: Record<string, ValorSpec> = {};
  if (timeoutMs !== undefined) spec.timeoutMs = { valor: timeoutMs, origem: "manual" };
  return { id, type: tipo, x: 0, y: 0, label: id, status: "novo", spec, specNA: {} };
}
function diagrama(nodes: No[]): Diagrama {
  return { nodes, edges: [] };
}
function percurso(nos: string[], confirmado = true): Percurso {
  return { id: `pc::${nos.join(">")}`, rotulo: nos.join(" → "), nos, origem: "inferido", confirmado };
}

const REGRA_SOMA: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: {},
  percursos: [
    {
      texto: "O caminho síncrono responde dentro do orçamento de latência",
      porque: "Cinco saltos dentro do padrão dão um caminho fora dele — é o que o cliente sente.",
      checagem: { campo: "timeoutMs", agregacao: "soma", operador: "lte", valor: 2000, unidade: "ms" },
    },
  ],
};

/**
 * SPEC-64 fatia A — a régua enxerga o que o caminho ATRAVESSA.
 *
 * A pergunta do usuário foi *"o que acontece quando o usuário altera um
 * conector?"*. Medindo, o achado foi outro e pior: `timeoutMs` é declarado em
 * `edgeTypes.http` e `edgeTypes.grpc`, a apuração media só `nodeTypes`, e a
 * régua que promete "a soma dos timeouts do percurso" devolvia **zero** num
 * caminho ligado por HTTP — silêncio onde havia o que somar.
 */
describe("avaliarPercursos — o caminho é nó, conexão, nó (SPEC-64)", () => {
  const comConexoes: DiagramaConfig = {
    nodeTypes: {
      service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
      externo: {
        label: "API Externa",
        derives: "external",
        techs: ["Backend"],
        contextos: [],
        spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }],
      },
    },
    edgeTypes: {
      http: { label: "HTTP", spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }] },
      le: { label: "lê" },
    },
    edgeRules: {},
  };

  function aresta(id: string, source: string, target: string, tipo = "http", timeoutMs?: number) {
    const spec: Record<string, ValorSpec> = {};
    if (timeoutMs !== undefined) spec.timeoutMs = { valor: timeoutMs, origem: "manual" };
    return { id, source, target, type: tipo, spec };
  }

  it("o timeout que mora na CONEXÃO entra na soma — era zero e silêncio", () => {
    const d: Diagrama = {
      nodes: [no("a", "service"), no("b", "service"), no("c", "service")],
      edges: [aresta("e1", "a", "b", "http", 1200), aresta("e2", "b", "c", "http", 1200)],
    };

    const { violacoes, naoMedidos } = avaliarPercursos(d, comConexoes, [percurso(["a", "b", "c"])], REGRA_SOMA);

    expect(naoMedidos).toEqual([]);
    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].atual).toContain("2400ms");
    // A conta diz de onde veio: "2 conexões", e não "5 elementos".
    expect(violacoes[0].atual).toContain("2 conexões");
  });

  it("nó e conexão somam JUNTOS — são dois lugares onde há espera", () => {
    const d: Diagrama = {
      nodes: [no("a", "service"), { ...no("ext", "externo"), spec: { timeoutMs: { valor: 400, origem: "manual" } } }],
      edges: [aresta("e1", "a", "ext", "http", 900)],
    };

    const { violacoes } = avaliarPercursos(d, comConexoes, [percurso(["a", "ext"])], REGRA_SOMA);

    expect(violacoes).toEqual([]); // 1300 ≤ 2000
    const solto = avaliarPercursos(
      d,
      comConexoes,
      [percurso(["a", "ext"])],
      { ...REGRA_SOMA, percursos: [{ ...REGRA_SOMA.percursos![0], checagem: { ...REGRA_SOMA.percursos![0].checagem, valor: 1000 } }] }
    );
    expect(solto.violacoes[0].atual).toContain("1300ms");
    expect(solto.violacoes[0].atual).toContain("1 nó e 1 conexão");
  });

  it("conexão cujo TIPO não declara o campo continua sendo silêncio legítimo", () => {
    // A diferença entre "não se aplica" e "aplica-se e está vazio" continua
    // sendo a fatia inteira — agora sobre o elemento certo.
    const d: Diagrama = {
      nodes: [no("a", "service"), no("b", "service")],
      edges: [aresta("e1", "a", "b", "le")],
    };

    expect(avaliarPercursos(d, comConexoes, [percurso(["a", "b"])], REGRA_SOMA)).toEqual({
      violacoes: [],
      naoMedidos: [],
    });
  });

  it("conexão que DECLARA e não preencheu vira não medido, com a conexão na lista", () => {
    const d: Diagrama = {
      nodes: [no("a", "service"), no("b", "service")],
      edges: [aresta("e1", "a", "b", "http")],
    };

    const { naoMedidos } = avaliarPercursos(d, comConexoes, [percurso(["a", "b"])], REGRA_SOMA);

    expect(naoMedidos[0].elementosSemValor).toEqual([{ tipo: "aresta", id: "e1", rotulo: "a → b" }]);
  });

  it("a DIREÇÃO importa: conexão no sentido contrário não entra no caminho", () => {
    // `source → target` é a direção lógica em todo o engine; `reversed` é só
    // como o canvas desenha a seta.
    const d: Diagrama = {
      nodes: [no("a", "service"), no("b", "service")],
      edges: [aresta("e1", "b", "a", "http", 5000)],
    };

    expect(avaliarPercursos(d, comConexoes, [percurso(["a", "b"])], REGRA_SOMA)).toEqual({
      violacoes: [],
      naoMedidos: [],
    });
  });

  it("par ligado por DUAS conexões que declaram o campo não é medido — e diz por quê", () => {
    // Escolher uma seria inventar; somar as duas inflaria o caminho. O desenho
    // é que não diz por onde a requisição passa (§248, terceira resposta).
    const d: Diagrama = {
      nodes: [no("a", "service"), no("b", "service")],
      edges: [aresta("e1", "a", "b", "http", 300), aresta("e2", "a", "b", "http", 900)],
    };

    const { violacoes, naoMedidos } = avaliarPercursos(d, comConexoes, [percurso(["a", "b"])], REGRA_SOMA);

    expect(violacoes).toEqual([]);
    expect(naoMedidos[0].motivo).toContain("mais de uma conexão");
    expect(naoMedidos[0].elementosSemValor).toEqual([]);
  });

  it("duas conexões, só uma declarando o campo: não há ambiguidade, e mede", () => {
    const d: Diagrama = {
      nodes: [no("a", "service"), no("b", "service")],
      edges: [aresta("e1", "a", "b", "http", 2500), aresta("e2", "a", "b", "le")],
    };

    const { violacoes, naoMedidos } = avaliarPercursos(d, comConexoes, [percurso(["a", "b"])], REGRA_SOMA);

    expect(naoMedidos).toEqual([]);
    expect(violacoes[0].atual).toContain("2500ms");
  });
});

describe("avaliarPercursos — a régua sobre o CAMINHO (SPEC-57 fatia E)", () => {
  it("sem regra de percurso, não mede nada", () => {
    const d = diagrama([no("a", "service", 400), no("b", "service", 400)]);

    expect(avaliarPercursos(d, config, [percurso(["a", "b"])])).toEqual({ violacoes: [], naoMedidos: [] });
  });

  it("cinco nós DENTRO do padrão dão um caminho FORA dele — é a fatia inteira", () => {
    // Cada 450ms passaria em qualquer checagem por nó (`≤ 500ms`). A soma não.
    const nos = ["a", "b", "c", "d", "e"];
    const d = diagrama(nos.map((id) => no(id, "service", 450)));

    const { violacoes } = avaliarPercursos(d, config, [percurso(nos)], REGRA_SOMA);

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].esperado).toBe("≤ 2000ms");
    // A conta aparece: sem ela a pessoa sabe que está fora e não de quanto.
    expect(violacoes[0].atual).toContain("2250ms");
    expect(violacoes[0].atual).toContain("5 nós");
    expect(violacoes[0].porque).toContain("é o que o cliente sente");
  });

  it("dentro do orçamento não vira violação", () => {
    const d = diagrama([no("a", "service", 400), no("b", "service", 400)]);

    expect(avaliarPercursos(d, config, [percurso(["a", "b"])], REGRA_SOMA).violacoes).toEqual([]);
  });

  it("percurso NÃO confirmado não é medido — regra 2", () => {
    const nos = ["a", "b", "c", "d", "e"];
    const d = diagrama(nos.map((id) => no(id, "service", 900)));

    expect(avaliarPercursos(d, config, [percurso(nos, false)], REGRA_SOMA).violacoes).toEqual([]);
  });

  it("campo faltando num nó do caminho NÃO produz verde falso — vira 'não medido'", () => {
    // Somar só o que existe daria 800ms e um verde. O verde falso é o pior
    // resultado possível de uma medição: ele encerra a pergunta.
    const d = diagrama([no("a", "service", 400), no("b", "service"), no("c", "service", 400)]);

    const { violacoes, naoMedidos } = avaliarPercursos(d, config, [percurso(["a", "b", "c"])], REGRA_SOMA);

    expect(violacoes).toEqual([]);
    expect(naoMedidos).toHaveLength(1);
    expect(naoMedidos[0].elementosSemValor.map((e) => e.id)).toEqual(["b"]);
    expect(naoMedidos[0].campo).toBe("timeoutMs");
  });

  it("nó cujo TIPO não tem o campo não é omissão — a régua o ignora e mede o resto", () => {
    // A diferença entre "não se aplica" e "aplica-se e está vazio" é o que
    // separa silêncio legítimo de verde falso.
    const d = diagrama([no("a", "service", 1200), no("db", "banco"), no("c", "service", 1200)]);

    const { violacoes, naoMedidos } = avaliarPercursos(d, config, [percurso(["a", "db", "c"])], REGRA_SOMA);

    expect(naoMedidos).toEqual([]);
    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].atual).toContain("2 nós");
  });

  it("nenhum nó do caminho declara o campo: silêncio, nem violação nem não-medido", () => {
    const d = diagrama([no("db1", "banco"), no("db2", "banco")]);

    expect(avaliarPercursos(d, config, [percurso(["db1", "db2"])], REGRA_SOMA)).toEqual({
      violacoes: [],
      naoMedidos: [],
    });
  });

  it("nó apagado depois da confirmação faz o caminho virar não medido, não inventado", () => {
    const d = diagrama([no("a", "service", 400)]);

    const { naoMedidos } = avaliarPercursos(d, config, [percurso(["a", "sumiu"])], REGRA_SOMA);

    expect(naoMedidos[0].elementosSemValor.map((e) => e.id)).toEqual(["sumiu"]);
  });

  it("`saltos` conta ARESTAS percorridas, não nós — `a → b` é um salto", () => {
    const regra: RegrasConfig = {
      tipos: [],
      tamanhos: [],
      porTech: {},
      percursos: [
        {
          texto: "No máximo 3 saltos entre a borda e o dado",
          checagem: { agregacao: "saltos", operador: "lte", valor: 3 },
        },
      ],
    };
    const nos = ["a", "b", "c", "d", "e"];
    const d = diagrama(nos.map((id) => no(id, "banco")));

    const { violacoes } = avaliarPercursos(d, config, [percurso(nos)], regra);

    // Cinco nós = quatro saltos. Contar nós e chamar de salto daria um
    // off-by-one num rótulo que a pessoa lê para calibrar a régua.
    expect(violacoes[0].atual).toBe("4 salto(s)");
    expect(violacoes[0].esperado).toBe("≤ 3");
  });

  it("`maximo` acusa o elo mais lento, não a soma", () => {
    const regra: RegrasConfig = {
      tipos: [],
      tamanhos: [],
      porTech: {},
      percursos: [
        { texto: "Nenhum elo sozinho passa de 500ms", checagem: { campo: "timeoutMs", agregacao: "maximo", operador: "lte", valor: 500, unidade: "ms" } },
      ],
    };
    const d = diagrama([no("a", "service", 100), no("b", "service", 900)]);

    const { violacoes } = avaliarPercursos(d, config, [percurso(["a", "b"])], regra);

    expect(violacoes[0].atual).toContain("maior de timeoutMs = 900ms");
  });
});


describe("derivarPercursos — a régua de caminho chegando ao ITEM (§249)", () => {
  const nos = ["a", "b", "c", "d", "e"];

  function comCaminho(valor: number) {
    return diagrama(nos.map((id) => no(id, "service", valor)));
  }

  it("um item por VIOLAÇÃO de caminho, não um por nó do caminho", () => {
    // Cinco itens fariam cinco pessoas cortarem 50ms cada uma sem ninguém
    // olhar o total — que é exatamente o defeito que esta fatia existe para ver.
    const atividades = derivar(comCaminho(450), config, {
      regras: REGRA_SOMA,
      percursos: [percurso(nos)],
    });
    const dePercurso = atividades.filter((a) => a.chave.includes("::percurso::"));

    expect(dePercurso).toHaveLength(1);
    expect(dePercurso[0].descricao).toContain("a → b → c → d → e");
    expect(dePercurso[0].descricao).toContain("≤ 2000ms");
    expect(dePercurso[0].descricao).toContain("2250ms");
  });

  it("o item de caminho NÃO tem origem — a ausência é a afirmação", () => {
    // Todo item deste projeto aponta para um nó ou uma aresta. Este não aponta
    // para nenhum, porque fixá-lo num nó culparia um componente que está, ele
    // mesmo, dentro do padrão.
    const [item] = derivar(comCaminho(450), config, { regras: REGRA_SOMA, percursos: [percurso(nos)] }).filter((a) =>
      a.chave.includes("::percurso::")
    );

    expect(item.origem).toEqual({});
    // E nunca Débito Técnico: o caminho é propriedade do desenho de agora.
    expect(item.tipo).toBe("Task");
  });

  it("caminho NÃO confirmado não gera item — derivar de palpite é gerar trabalho falso", () => {
    const atividades = derivar(comCaminho(450), config, {
      regras: REGRA_SOMA,
      percursos: [percurso(nos, false)],
    });

    expect(atividades.filter((a) => a.chave.includes("::percurso::"))).toEqual([]);
  });

  it("caminho dentro do padrão não gera item, e a derivação é a de antes", () => {
    const semRegra = derivar(comCaminho(100), config, {});
    const comRegra = derivar(comCaminho(100), config, { regras: REGRA_SOMA, percursos: [percurso(nos)] });

    expect(comRegra).toEqual(semRegra);
  });

  it("`naoMedidos` NÃO vira item — isso já é vermelho de completude no nó", () => {
    // Duas cobranças para o mesmo campo, em dois lugares, é como o backlog
    // derivado perde a confiança de quem o lê.
    const d = diagrama([no("a", "service", 400), no("b", "service"), no("c", "service", 400)]);

    const atividades = derivar(d, config, { regras: REGRA_SOMA, percursos: [percurso(["a", "b", "c"])] });

    expect(atividades.filter((a) => a.chave.includes("::percurso::"))).toEqual([]);
  });

  it("a chave é estável: rederivar o mesmo caminho não duplica o item", () => {
    const contexto = { regras: REGRA_SOMA, percursos: [percurso(nos)] };
    const primeira = derivar(comCaminho(450), config, contexto);
    const segunda = derivar(comCaminho(450), config, contexto);

    expect(primeira.map((a) => a.chave)).toEqual(segunda.map((a) => a.chave));
  });
});
