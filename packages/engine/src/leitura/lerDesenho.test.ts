import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "../config/types.js";
import type { Diagrama } from "../model/types.js";
import { readConfigFile } from "../test-support/fixtures.js";
import {
  arestaEspera,
  dispensasComEfeito,
  formatarDuracao,
  lerDesenho,
  marcasPorNo,
  resumirLeitura,
} from "./lerDesenho.js";

/**
 * SPEC-65 — o desenho lido em voz alta.
 *
 * Relato: *"o tempo geral das operações mapeadas, e se houver parte síncrona
 * ver o que interessa quanto a isso — precisa aparecer sem precisar abrir e
 * especificar tudo"*.
 *
 * O teste da fatia B roda sobre a config REAL do produto, e não sobre uma
 * config de teste: metade do valor desta leitura é ela funcionar com o que já
 * está declarado em `diagrama.example.json`, sem preparo nenhum.
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

describe("lerDesenho — o tempo, que só existe através do que espera", () => {
  it("soma o timeout da cadeia que espera, e diz o pior caso", () => {
    // api →http(300)→ srv →http(800)→ banco. Quem chama a api espera 1100ms
    // no pior caso, porque as duas chamadas são síncronas e encadeadas.
    const d = diagrama(
      [no("api", "service"), no("srv", "service"), no("db", "sql")],
      [
        aresta("e1", "api", "srv", "http", { timeoutMs: 300 }),
        aresta("e2", "srv", "db", "http", { timeoutMs: 800 }),
      ]
    );

    const leitura = lerDesenho(d, config);

    expect(leitura.tempoDoPiorTrecho?.ms).toBe(1100);
    expect(leitura.tempoDoPiorTrecho?.completo).toBe(true);
  });

  it("a soma PARA na conexão que não espera — o que vem depois ninguém sente", () => {
    // api →http(300)→ srv →publica→ fila →consome→ worker →http(5000)→ externo.
    // O worker leva 5s e quem chamou a api não espera por isso: o 5000 não
    // pode aparecer no tempo de resposta. Somar o caminho inteiro daria um
    // número que ninguém experimenta.
    const d = diagrama(
      [no("api", "service"), no("srv", "service"), no("fila", "rabbit"), no("worker", "service"), no("ext", "external")],
      [
        aresta("e1", "api", "srv", "http", { timeoutMs: 300 }),
        aresta("e2", "srv", "fila", "publishes"),
        aresta("e3", "fila", "worker", "consumes"),
        aresta("e4", "worker", "ext", "http", { timeoutMs: 5000 }),
      ]
    );

    const leitura = lerDesenho(d, config);

    // Dois trechos separados, e o mais lento é o do worker — mas eles são
    // trechos DIFERENTES, e nenhum deles vale 5300.
    expect(leitura.tempos.map((t) => t.ms)).toEqual([5000, 300]);
    expect(leitura.tempos.every((t) => t.ms !== 5300)).toBe(true);
  });

  it("elemento que declara o campo e não respondeu deixa a soma como PISO, não como total", () => {
    // §248 aqui: somar só o que existe e apresentar como total é um verde
    // falso, que é o pior resultado possível de uma medição.
    const d = diagrama(
      [no("api", "service"), no("srv", "service"), no("db", "sql")],
      [
        aresta("e1", "api", "srv", "http", { timeoutMs: 300 }),
        aresta("e2", "srv", "db", "http"),
      ]
    );

    const leitura = lerDesenho(d, config);

    expect(leitura.tempoDoPiorTrecho?.ms).toBe(300);
    expect(leitura.tempoDoPiorTrecho?.completo).toBe(false);
    expect(leitura.tempoDoPiorTrecho?.semValor).toEqual([
      { tipo: "aresta", id: "e2", rotulo: "srv → db" },
    ]);
  });

  it("o timeout do NÓ entra junto com o da conexão — external declara o seu", () => {
    // `external.timeoutMs` existe no catálogo e é do nó, não da seta. Uma
    // leitura que olhasse só arestas devolveria menos que a verdade — é o
    // mesmo defeito que o §285 achou na régua de percurso, do outro lado.
    const d = diagrama(
      [no("api", "service"), no("bureau", "external", { timeoutMs: 2000 })],
      [aresta("e1", "api", "bureau", "http", { timeoutMs: 500 })]
    );

    expect(lerDesenho(d, config).tempoDoPiorTrecho?.ms).toBe(2500);
  });
});

describe("lerDesenho — a sincronia", () => {
  it("conta as chamadas que esperam saindo do mesmo nó — o exemplo do relato", () => {
    // "um serviço recebendo uma chamada e fazendo diversas antes de responder".
    const d = diagrama(
      [no("api", "service"), no("a", "service"), no("b", "sql"), no("c", "rule")],
      [
        aresta("e1", "api", "a", "http"),
        aresta("e2", "api", "b", "writes"),
        aresta("e3", "api", "c", "validates"),
      ]
    );

    const leitura = lerDesenho(d, config);

    expect(leitura.fanOut).toHaveLength(1);
    expect(leitura.fanOut[0].rotulo).toBe("api");
    expect(leitura.fanOut[0].chamadas).toHaveLength(3);
  });

  it("publicar em fila NÃO é fan-out — três filas não seguram resposta nenhuma", () => {
    const d = diagrama(
      [no("api", "service"), no("f1", "rabbit"), no("f2", "rabbit"), no("f3", "rabbit")],
      [
        aresta("e1", "api", "f1", "publishes"),
        aresta("e2", "api", "f2", "publishes"),
        aresta("e3", "api", "f3", "publishes"),
      ]
    );

    expect(lerDesenho(d, config).fanOut).toEqual([]);
  });

  it("a conexão pode contrariar o padrão do tipo — quem respondeu `sincrono` sabe mais", () => {
    // `consumes` é assíncrono por padrão, e o campo `sincrono` existe desde a
    // SPEC-21. Ignorar a resposta da pessoa seria descartar o dado mais
    // confiável que existe sobre aquela conexão.
    const generica = aresta("e1", "fila", "worker", "consumes");
    const declarada = aresta("e2", "fila", "worker", "consumes", { sincrono: true });

    expect(arestaEspera(generica as never, config)).toBe(false);
    expect(arestaEspera(declarada as never, config)).toBe(true);
  });

  it("mede a profundidade da cadeia que espera, e aponta o fim dela", () => {
    const d = diagrama(
      [no("a", "service"), no("b", "service"), no("c", "service"), no("d", "external")],
      [
        aresta("e1", "a", "b", "http"),
        aresta("e2", "b", "c", "http"),
        aresta("e3", "c", "d", "http"),
      ]
    );

    const leitura = lerDesenho(d, config);

    expect(leitura.cadeiaMaisFunda?.saltos).toBe(3);
    expect(leitura.cadeiaMaisFunda?.fim.rotulo).toBe("d");
  });

  it("terceiro só conta DENTRO do que espera — externo alimentado por fila não segura ninguém", () => {
    const d = diagrama(
      [no("api", "service"), no("fila", "rabbit"), no("ext", "external")],
      [aresta("e1", "api", "fila", "publishes"), aresta("e2", "fila", "ext", "consumes")]
    );

    expect(lerDesenho(d, config).terceiros).toEqual([]);
  });

  it("terceiro no caminho de resposta aparece, com o trecho por onde pesa", () => {
    const d = diagrama(
      [no("api", "service"), no("bureau", "external")],
      [aresta("e1", "api", "bureau", "http")]
    );

    const leitura = lerDesenho(d, config);

    expect(leitura.terceiros).toHaveLength(1);
    expect(leitura.terceiros[0].rotulo).toBe("bureau");
  });
});

describe("lerDesenho — a lacuna que se declara", () => {
  it("tipo de conexão sem `espera` sai da conta E aparece na lista", () => {
    // §57 — leitura que ignorou parte do desenho sem dizer é pior que leitura
    // nenhuma. `binding` é topologia pura e não é chamada: nunca foi
    // classificado, e a leitura diz isso em vez de fingir que olhou tudo.
    const d = diagrama(
      [no("a", "service"), no("b", "service")],
      [aresta("e1", "a", "b", "binding")]
    );

    const leitura = lerDesenho(d, config);

    expect(leitura.conexoesNaoClassificadas).toEqual([{ tipo: "binding", quantas: 1 }]);
    expect(leitura.tempos).toEqual([]);
  });

  it("desenho todo classificado não inventa lacuna", () => {
    const d = diagrama([no("a", "service"), no("b", "sql")], [aresta("e1", "a", "b", "writes")]);

    expect(lerDesenho(d, config).conexoesNaoClassificadas).toEqual([]);
  });
});

describe("lerDesenho — sem preparo nenhum", () => {
  it("NÃO exige caminho confirmado nem régua configurada — é o pedido do relato", () => {
    // A régua de percurso (SPEC-57/64) só vale sobre caminho confirmado, e as
    // réguas do deploy vêm vazias (§286). Se a leitura herdasse qualquer uma
    // dessas condições ela não apareceria justamente em quem está desenhando
    // agora, que é a pessoa para quem ela existe.
    const d = diagrama(
      [no("api", "service"), no("db", "sql")],
      [aresta("e1", "api", "db", "http", { timeoutMs: 400 })]
    );

    // Nenhum percurso confirmado, nenhuma `RegrasConfig` passada.
    expect(lerDesenho(d, config).tempoDoPiorTrecho?.ms).toBe(400);
  });

  it("desenho vazio lê vazio, sem estourar", () => {
    const leitura = lerDesenho(diagrama([], []), config);

    expect(leitura.tempoDoPiorTrecho).toBeUndefined();
    expect(leitura.fanOut).toEqual([]);
    expect(leitura.terceiros).toEqual([]);
  });
});

describe("lerDesenho — o cenário que motivou a SPEC", () => {
  // `credito-completo` é, sem ter sido escolhido para isso, exatamente o
  // exemplo do relato: um serviço de entrada que dispara três saídas, e uma
  // cadeia até um bureau de terceiro. Medi nele que a faixa dizia
  // "VERDE 8 — pronta para derivar" e mais nada.
  const cenario = readConfigFile<{ diagrama?: Diagrama; quebra?: { diagrama: Diagrama } }>(
    "cenarios/credito-completo.json"
  );
  const d = (cenario.diagrama ?? cenario.quebra!.diagrama) as Diagrama;
  const leitura = lerDesenho(d, config);

  it("enxerga o fan-out do serviço de entrada — as três saídas do relato", () => {
    const api = leitura.fanOut.find((f) => f.rotulo === "srv-credito-api");
    expect(api?.chamadas).toHaveLength(3);
  });

  it("enxerga a cadeia que espera até o terceiro", () => {
    expect(leitura.cadeiaMaisFunda!.saltos).toBeGreaterThanOrEqual(3);
    expect(leitura.terceiros.map((t) => t.rotulo)).toContain("bureau-credito-nacional");
  });

  it("soma o que existe e diz que é PISO — o único tempo declarado é o do terceiro", () => {
    // Medido: o único `timeoutMs` do cenário é o do NÓ
    // `bureau-credito-nacional` (3000); a conexão `http` que leva até ele está
    // vazia. A leitura diz as duas coisas ao mesmo tempo — "pelo menos 3 s, e
    // falta 1 para fechar a conta" —, que é o §248 num caso real.
    //
    // Este é o ponto onde ela mais se distingue de uma régua: não reprova o
    // desenho por faltar número, e também não finge que a resposta é
    // instantânea.
    const t = leitura.tempoDoPiorTrecho!;
    expect(t.ms).toBe(3000);
    expect(t.completo).toBe(false);
    expect(t.semValor).toHaveLength(1);
    expect(resumirLeitura(leitura)).toBe("resposta ≥ 3,0 s");
  });
});

describe("marcasPorNo — a marca do canvas (fatia C)", () => {
  const fanOut = () =>
    diagrama(
      [no("api", "service"), no("a", "service"), no("b", "sql")],
      [aresta("e1", "api", "a", "http"), aresta("e2", "api", "b", "writes")]
    );

  it("a marca carrega o número, a frase e as conexões a acender", () => {
    // O número sozinho não ensina nada — quem lê "3" precisa saber que a
    // resposta é a soma das três.
    const [m] = marcasPorNo(lerDesenho(fanOut(), config));

    expect(m.noId).toBe("api");
    expect(m.numero).toBe(2);
    expect(m.titulo).toContain("a soma delas");
    expect(m.arestasIds).toEqual(["e1", "e2"]);
  });

  it("UMA marca por nó, mesmo sendo fan-out E começo de cadeia", () => {
    // Duas marcas no mesmo canto viram enfeite, e enfeite é o que se para de
    // ver. O fan-out ganha: o canto de um nó fala do nó.
    const d = diagrama(
      [no("api", "service"), no("b", "service"), no("c", "service"), no("d", "sql"), no("e", "sql")],
      [
        aresta("e1", "api", "b", "http"),
        aresta("e2", "b", "c", "http"),
        aresta("e3", "c", "d", "http"),
        aresta("e4", "api", "e", "writes"),
      ]
    );

    const marcas = marcasPorNo(lerDesenho(d, config));
    expect(marcas.filter((m) => m.noId === "api")).toHaveLength(1);
    expect(marcas.find((m) => m.noId === "api")!.tipo).toBe("fan-out");
  });

  it("dispensar cala o PAR (nó, tipo), não o nó inteiro", () => {
    // Silenciar tudo de um nó de uma vez é o que transforma sinal em ruído
    // aceito.
    const semCala = marcasPorNo(lerDesenho(fanOut(), config));
    const calada = marcasPorNo(lerDesenho(fanOut(), config), [{ noId: "api", tipo: "fan-out" }]);
    const outroTipo = marcasPorNo(lerDesenho(fanOut(), config), [{ noId: "api", tipo: "cadeia" }]);

    expect(semCala).toHaveLength(1);
    expect(calada).toHaveLength(0);
    expect(outroTipo).toHaveLength(1);
  });
});

describe("dispensasComEfeito — o §283 aplicado às leituras", () => {
  it("lista a dispensa que ainda cala alguma coisa, com o que ela cala", () => {
    const d = diagrama(
      [no("api", "service"), no("a", "service"), no("b", "sql")],
      [aresta("e1", "api", "a", "http"), aresta("e2", "api", "b", "writes")]
    );

    const caladas = dispensasComEfeito(lerDesenho(d, config), [
      { noId: "api", tipo: "fan-out", autor: "alguem@time" },
    ]);

    expect(caladas).toHaveLength(1);
    expect(caladas[0].dispensa.autor).toBe("alguem@time");
    expect(caladas[0].marca.titulo).toContain("chamadas que esperam");
  });

  it("dispensa de leitura que sumiu do desenho NÃO aparece — ela não cala nada", () => {
    // O registro fica na quebra; a tela só mostra o que tem efeito. Listar
    // dispensas mortas encheria a lista de fantasmas do desenho de ontem.
    const d = diagrama([no("api", "service"), no("a", "service")], [aresta("e1", "api", "a", "http")]);

    expect(dispensasComEfeito(lerDesenho(d, config), [{ noId: "api", tipo: "fan-out" }])).toEqual([]);
  });
});

describe("formatarDuracao", () => {
  it("abaixo de um segundo fala em ms; acima, em segundos", () => {
    expect(formatarDuracao(350)).toBe("350 ms");
    expect(formatarDuracao(1100)).toBe("1,1 s");
    expect(formatarDuracao(12400)).toBe("12 s");
  });
});

describe("resumirLeitura — a frase que se lê sem abrir nada", () => {
  const ler = (nodes: unknown[], edges: unknown[]) => resumirLeitura(lerDesenho(diagrama(nodes, edges), config));

  it("com os números completos, diz o teto da resposta", () => {
    expect(
      ler(
        [no("a", "service"), no("b", "sql")],
        [aresta("e1", "a", "b", "http", { timeoutMs: 1100 })]
      )
    ).toBe("resposta até 1,1 s");
  });

  it("com números pela metade, o '≥' impede ler a soma como total", () => {
    // §248 na largura de um caractere.
    expect(
      ler(
        [no("a", "service"), no("b", "service"), no("c", "sql")],
        [aresta("e1", "a", "b", "http", { timeoutMs: 300 }), aresta("e2", "b", "c", "http")]
      )
    ).toBe("resposta ≥ 300 ms");
  });

  it("SEM número nenhum ainda diz o que sabe — é o estado de quem acabou de desenhar", () => {
    // Medido no `credito-completo`: nenhum timeout preenchido. Um chip que só
    // soubesse falar de milissegundos ficaria mudo justamente para a pessoa
    // que esta leitura existe para atender.
    expect(
      ler(
        [no("a", "service"), no("b", "service"), no("c", "service"), no("d", "sql")],
        [aresta("e1", "a", "b", "http"), aresta("e2", "b", "c", "http"), aresta("e3", "c", "d", "http")]
      )
    ).toBe("3 saltos que esperam");
  });

  it("sem cadeia funda, cai no fan-out", () => {
    expect(
      ler(
        [no("a", "service"), no("b", "sql"), no("c", "rule")],
        [aresta("e1", "a", "b", "writes"), aresta("e2", "a", "c", "validates")]
      )
    ).toBe("2 chamadas antes de responder");
  });

  it("sem nada a dizer, NÃO devolve frase — chip que aparece sempre vira moldura", () => {
    expect(ler([no("a", "service"), no("f", "rabbit")], [aresta("e1", "a", "f", "publishes")])).toBeUndefined();
    expect(ler([], [])).toBeUndefined();
  });
});
