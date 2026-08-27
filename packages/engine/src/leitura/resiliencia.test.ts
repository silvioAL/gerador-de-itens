import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "../config/types.js";
import type { Aresta, Diagrama } from "../model/types.js";
import { readConfigFile } from "../test-support/fixtures.js";
import { avaliarResiliencia, contradicoesAceitas, contradicoesEmAberto, insistenciaDe } from "./resiliencia.js";

/**
 * SPEC-68 — os padrões de resiliência como conta.
 *
 * Roda sobre a config REAL: metade do valor é a conta funcionar com os campos
 * que `diagrama.example.json` declara, sem preparo nenhum.
 */
const config = readConfigFile<DiagramaConfig>("diagrama.example.json");

function no(id: string, type: string, spec: Record<string, unknown> = {}) {
  return {
    id,
    type,
    label: id,
    x: 0,
    y: 0,
    status: "novo",
    spec: Object.fromEntries(Object.entries(spec).map(([k, valor]) => [k, { valor, origem: "manual" }])),
    specNA: {},
  };
}

function aresta(id: string, source: string, target: string, type: string, spec: Record<string, unknown> = {}) {
  return {
    id,
    source,
    target,
    type,
    spec: Object.fromEntries(Object.entries(spec).map(([k, valor]) => [k, { valor, origem: "manual" }])),
  };
}

function diagrama(nodes: unknown[], edges: unknown[]): Diagrama {
  return { nodes, edges } as unknown as Diagrama;
}

describe("insistenciaDe — por quanto tempo o sistema insiste", () => {
  it("timeout × tentativas + espera entre elas", () => {
    // 500 × 3 + 100 × 2 = 1700.
    const e = aresta("e1", "a", "b", "http", { timeoutMs: 500, tentativas: 3, esperaEntreMs: 100 });

    expect(insistenciaDe(e as never)).toMatchObject({ ms: 1700, tentativas: 3, insiste: true });
  });

  it("sem tentativas declaradas vale UMA — não declarar retry é declarar que não há", () => {
    const e = aresta("e1", "a", "b", "http", { timeoutMs: 500 });

    expect(insistenciaDe(e as never)).toMatchObject({ ms: 500, tentativas: 1, insiste: false });
  });

  it("sem timeout, não há o que multiplicar — e nada é inventado", () => {
    // §248: inventar o valor daria uma conta com cara de medida.
    expect(insistenciaDe(aresta("e1", "a", "b", "http", { tentativas: 3 }) as never)).toBeUndefined();
  });

  it("tentativas zero ou negativa é dado sujo, e vale UMA", () => {
    // Tratar `0` como "nenhuma tentativa" produziria insistência zero num
    // desenho que claramente chama alguém.
    expect(insistenciaDe(aresta("e1", "a", "b", "http", { timeoutMs: 400, tentativas: 0 }) as never)).toMatchObject({
      ms: 400,
      tentativas: 1,
    });
  });

  it("carrega se há disjuntor — é o que muda o conselho, não a conta", () => {
    const e = aresta("e1", "a", "b", "http", { timeoutMs: 300, tentativas: 2, disjuntor: true });

    expect(insistenciaDe(e as never)?.temDisjuntor).toBe(true);
  });
});

describe("avaliarResiliencia — o sistema desiste depois de quem chamou", () => {
  /** cliente →http(1000)→ api →http(500 × 3)→ bureau */
  const desenho = (spec: Record<string, unknown>) =>
    diagrama(
      [no("cliente", "service"), no("api", "service"), no("bureau", "external")],
      [
        aresta("entra", "cliente", "api", "http", { timeoutMs: 1000 }),
        aresta("sai", "api", "bureau", "http", spec),
      ]
    );

  it("acusa a conexão que insiste além da paciência de quem chama", () => {
    // A api insiste por 1500 ms numa requisição que o cliente abandonou em
    // 1000 ms: meio segundo de trabalho garantidamente jogado fora.
    const [c] = avaliarResiliencia(desenho({ timeoutMs: 500, tentativas: 3 }), config);

    expect(c.tipo).toBe("insistencia");
    expect(c.arestaId).toBe("sai");
    expect(c.atual).toContain("1500 ms");
    expect(c.esperado).toContain("1000 ms");
    expect(c.porque).toContain("Quem chamou já desistiu");
  });

  it("dentro da paciência, silêncio", () => {
    // 300 × 3 = 900, e o cliente espera 1000.
    expect(avaliarResiliencia(desenho({ timeoutMs: 300, tentativas: 3 }), config)).toEqual([]);
  });

  it("SEM retry não é contradição — a queixa aqui é sobre INSISTIR", () => {
    // Um timeout maior que a paciência de quem chama é escolha de desenho, e a
    // régua de percurso já sabe cobrar soma de tempo. Duas queixas para o mesmo
    // número seriam dois alarmes para o mesmo problema.
    expect(avaliarResiliencia(desenho({ timeoutMs: 3000 }), config)).toEqual([]);
  });

  it("sem a paciência declarada, NÃO acusa — a pergunta não foi feita", () => {
    // Comparar um número com uma suposição é como se produz o alarme que
    // ninguém respeita.
    const d = diagrama(
      [no("cliente", "service"), no("api", "service"), no("bureau", "external")],
      [
        aresta("entra", "cliente", "api", "http"),
        aresta("sai", "api", "bureau", "http", { timeoutMs: 500, tentativas: 5 }),
      ]
    );

    expect(avaliarResiliencia(d, config)).toEqual([]);
  });

  it("com vários chamadores, vale o MAIS impaciente", () => {
    // Basta um chamador impaciente para o trabalho extra ser jogado fora; a
    // média ou o maior esconderiam justamente o caso que dói.
    const d = diagrama(
      [no("a", "service"), no("b", "service"), no("api", "service"), no("x", "external")],
      [
        aresta("e1", "a", "api", "http", { timeoutMs: 5000 }),
        aresta("e2", "b", "api", "http", { timeoutMs: 800 }),
        aresta("sai", "api", "x", "http", { timeoutMs: 500, tentativas: 2 }),
      ]
    );

    const [c] = avaliarResiliencia(d, config);
    expect(c?.esperado).toContain("800 ms");
  });

  it("o conselho muda com o disjuntor, e o número não", () => {
    const sem = avaliarResiliencia(desenho({ timeoutMs: 500, tentativas: 3 }), config)[0];
    const com = avaliarResiliencia(desenho({ timeoutMs: 500, tentativas: 3, disjuntor: true }), config)[0];

    expect(sem.atual).toBe(com.atual);
    expect(sem.porque).toContain("Sem disjuntor");
    expect(com.porque).toContain("não encurta a primeira rajada");
  });

  it("conexão que não espera fica fora — publicar não segura ninguém", () => {
    const d = diagrama(
      [no("cliente", "service"), no("api", "service"), no("fila", "rabbit")],
      [
        aresta("entra", "cliente", "api", "http", { timeoutMs: 100 }),
        aresta("sai", "api", "fila", "publishes", { timeoutMs: 9000, tentativas: 9 }),
      ]
    );

    expect(avaliarResiliencia(d, config)).toEqual([]);
  });
});

describe("avaliarResiliencia — a Lei de Little", () => {
  it("acusa quando a concorrência necessária passa do pool declarado", () => {
    // 100 req/s × 300 ms = 30 simultâneas; o pool declara 10.
    const d = diagrama(
      [no("api", "service", { taxaEsperadaRps: 100, chamadasSimultaneas: 10 }), no("db", "sql")],
      [aresta("e1", "api", "db", "http", { timeoutMs: 300 })]
    );

    const [c] = avaliarResiliencia(d, config);

    expect(c.tipo).toBe("saturacao");
    expect(c.noId).toBe("api");
    expect(c.atual).toContain("30 necessárias");
    expect(c.esperado).toContain("10 chamadas simultâneas");
    expect(c.porque).toContain("Lei de Little");
  });

  it("pool suficiente é silêncio", () => {
    const d = diagrama(
      [no("api", "service", { taxaEsperadaRps: 10, chamadasSimultaneas: 10 }), no("db", "sql")],
      [aresta("e1", "api", "db", "http", { timeoutMs: 300 })]
    );

    expect(avaliarResiliencia(d, config)).toEqual([]);
  });

  it("o fan-out SOMA — quem espera as três segura a requisição pelas três", () => {
    // 50 req/s × (200+200+200) ms = 30 simultâneas.
    const d = diagrama(
      [no("api", "service", { taxaEsperadaRps: 50, chamadasSimultaneas: 20 }), no("a", "sql"), no("b", "sql"), no("c", "sql")],
      [
        aresta("e1", "api", "a", "http", { timeoutMs: 200 }),
        aresta("e2", "api", "b", "http", { timeoutMs: 200 }),
        aresta("e3", "api", "c", "http", { timeoutMs: 200 }),
      ]
    );

    expect(avaliarResiliencia(d, config)[0].atual).toContain("30 necessárias");
  });

  it("sem taxa OU sem pool, a conta não se faz — e nada se afirma", () => {
    const semTaxa = diagrama(
      [no("api", "service", { chamadasSimultaneas: 1 }), no("db", "sql")],
      [aresta("e1", "api", "db", "http", { timeoutMs: 5000 })]
    );
    const semPool = diagrama(
      [no("api", "service", { taxaEsperadaRps: 9999 }), no("db", "sql")],
      [aresta("e1", "api", "db", "http", { timeoutMs: 5000 })]
    );

    expect(avaliarResiliencia(semTaxa, config)).toEqual([]);
    expect(avaliarResiliencia(semPool, config)).toEqual([]);
  });

  it("desenho sem tempo nenhum não satura por divisão vazia", () => {
    const d = diagrama(
      [no("api", "service", { taxaEsperadaRps: 100, chamadasSimultaneas: 1 }), no("db", "sql")],
      [aresta("e1", "api", "db", "http")]
    );

    expect(avaliarResiliencia(d, config)).toEqual([]);
  });
});

/**
 * SPEC-70 fatia B — a saturação deixa de depender de alguém digitar a taxa
 * NÓ A NÓ.
 *
 * Era o custo que o usuário apontou: *"assim o usuário não precisa preencher"*.
 * O volume da demanda é dito uma vez e o grafo o carrega — e a Lei de Little,
 * que já era exata, passa a ter com o que fechar.
 */
describe("avaliarResiliencia — a taxa vinda do volume da demanda", () => {
  /** srv (pool 10) →http(1000ms)→ bureau. 100 req/s × 1 s = 100 simultâneas. */
  const desenho = () =>
    diagrama(
      [no("srv", "service", { chamadasSimultaneas: 10 }), no("bureau", "external")],
      [aresta("e1", "srv", "bureau", "http", { timeoutMs: 1000 })]
    );

  it("sem volume declarado, CALA — é o comportamento de antes desta SPEC", () => {
    // Ninguém digitou taxa em nó nenhum. A conta não se faz, e inventar um
    // número aqui seria o §248 na sua forma mais cara.
    expect(avaliarResiliencia(desenho(), config)).toEqual([]);
  });

  it("com o volume da demanda, o MESMO desenho acusa — sem tocar em nó nenhum", () => {
    const achados = avaliarResiliencia(desenho(), config, undefined, {
      volume: { quantidade: 100, por: "segundo" },
    });

    expect(achados).toHaveLength(1);
    expect(achados[0].tipo).toBe("saturacao");
    expect(achados[0].atual).toContain("100 necessárias");
    // A frase diz DE ONDE veio a taxa: apresentar o derivado como declarado
    // seria a ferramenta se atribuindo uma medição que ninguém fez.
    expect(achados[0].atual).toContain("vindo do volume da demanda");
  });

  it("volume pequeno não acusa — a conta é a conta, não um alarme", () => {
    // 5 req/s × 1 s = 5 simultâneas, e o pool é 10.
    expect(
      avaliarResiliencia(desenho(), config, undefined, { volume: { quantidade: 5, por: "segundo" } })
    ).toEqual([]);
  });

  it("DECLARADO vence derivado — quem mediu sabe mais que quem propagou", () => {
    // O serviço também recebe tráfego de fora do desenho: 300 req/s medidos,
    // contra os 5 que o volume da demanda propagaria.
    const d = diagrama(
      [no("srv", "service", { chamadasSimultaneas: 10, taxaEsperadaRps: 300 }), no("bureau", "external")],
      [aresta("e1", "srv", "bureau", "http", { timeoutMs: 1000 })]
    );

    const achados = avaliarResiliencia(d, config, undefined, { volume: { quantidade: 5, por: "segundo" } });

    expect(achados).toHaveLength(1);
    expect(achados[0].atual).toContain("300 req/s");
    // E não diz que veio do volume, porque não veio.
    expect(achados[0].atual).not.toContain("vindo do volume");
  });

  it("§5 — o fator do ensaio multiplica o volume, e o pico chega a todos de uma vez", () => {
    // 5 req/s não satura; 10× o volume satura. Ninguém digitou taxa em nó
    // nenhum, e o pico é uma condição do mundo, não de um componente.
    const semPico = avaliarResiliencia(desenho(), config, undefined, {
      volume: { quantidade: 5, por: "segundo" },
    });
    const comPico = avaliarResiliencia(desenho(), config, undefined, {
      volume: { quantidade: 5, por: "segundo" },
      fator: 10,
    });

    expect(semPico).toEqual([]);
    expect(comPico).toHaveLength(1);
    expect(comPico[0].atual).toContain("50 necessárias");
  });
});

/**
 * §307 — a válvula do §242 chega às contradições de resiliência.
 *
 * A SPEC-68 §4.1 dizia que elas vão ao placar ⚖ *"com o porquê e a válvula da
 * exceção, como toda violação desde o §239"*. Medido no §306: elas não iam a
 * lugar nenhum além da bancada, e a válvula não existia.
 *
 * A régua que isto guarda: **a válvula tem que ser a mesma em toda cobrança**.
 * Senão a pessoa aprende que umas violações se aceitam e outras se ignoram — e
 * é assim que o placar inteiro perde o sentido (§230).
 */
describe("contradições aceitas de propósito (§307)", () => {
  const desenho = () =>
    diagrama(
      [no("srv", "service", { chamadasSimultaneas: 10 }), no("bureau", "external")],
      [aresta("e1", "srv", "bureau", "http", { timeoutMs: 1000 })]
    );
  const volume = { quantidade: 100, por: "segundo" as const };

  it("a exceção MARCA, não apaga — some do vermelho, não do histórico", () => {
    const achados = avaliarResiliencia(desenho(), config, undefined, {
      volume,
      excecoes: [
        {
          noId: "srv",
          campo: "",
          contradicao: "saturacao",
          motivo: "o pico dura 2h/mês e o negócio aceita a fila",
          autor: "ana@empresa.com",
          em: "2026-08-27T10:00:00.000Z",
        },
      ],
    });

    expect(achados).toHaveLength(1);
    expect(achados[0].excecao?.motivo).toContain("o negócio aceita a fila");
    expect(contradicoesEmAberto(achados)).toEqual([]);
    expect(contradicoesAceitas(achados)).toHaveLength(1);
  });

  it("a chave é o par ELEMENTO + TIPO — aceitar a saturação não cala a insistência", () => {
    // Uma contradição não é identificada por campo (nasce da RELAÇÃO entre
    // dois) nem por regra do time (é aritmética). Confundir as duas faria um
    // "aceito" silenciar o que ninguém olhou.
    const d = diagrama(
      [no("srv", "service", { chamadasSimultaneas: 10 }), no("bureau", "external")],
      [aresta("e1", "srv", "bureau", "http", { timeoutMs: 1000 })]
    );

    const achados = avaliarResiliencia(d, config, undefined, {
      volume,
      excecoes: [
        { noId: "srv", campo: "", contradicao: "insistencia", motivo: "outra coisa", autor: "a", em: "2026-01-01" },
      ],
    });

    // A saturação do `srv` continua cobrando: a exceção era de outro tipo.
    expect(contradicoesEmAberto(achados)).toHaveLength(1);
    expect(contradicoesEmAberto(achados)[0].tipo).toBe("saturacao");
  });

  it("exceção de VALOR (sem `contradicao`) não interfere — são cobranças diferentes", () => {
    // §242 gravou exceções de campo muito antes desta; uma exceção de
    // `timeoutMs` não pode calar uma conta de concorrência.
    const achados = avaliarResiliencia(desenho(), config, undefined, {
      volume,
      excecoes: [{ noId: "srv", campo: "timeoutMs", motivo: "x", autor: "a", em: "2026-01-01" }],
    });

    expect(contradicoesEmAberto(achados)).toHaveLength(1);
  });
});
