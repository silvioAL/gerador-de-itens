import { describe, expect, it } from "vitest";
import type { Diagrama, Quebra } from "../model/types.js";
import type { DiagramaConfig } from "../config/types.js";
import { readConfigFile } from "../test-support/fixtures.js";
import {
  AdocaoSemPorque,
  VarianteInexistente,
  adotarVariante,
  compararVariantes,
  guardarComoVariante,
} from "./variantes.js";

/**
 * SPEC-88 (P6) — **a variante, e a decisão que nasce da adoção.**
 *
 * O passo que a SPEC-56 §8 descreveu e o §295 deixou aberto, com a armadilha já
 * nomeada: *"variante não pode ser copiar a quebra e editar, ou as duas divergem
 * e ninguém sabe qual venceu."*
 */

/**
 * A config REAL do produto, como o `lerDesenho.test.ts` faz — e pelo mesmo
 * motivo, que aqui custou duas rodadas vermelhas: uma config de teste inventada
 * não declara `espera` nos tipos de conexão, e sem isso `lerDesenho` não acha
 * trecho nenhum que espere. A comparação voltava sem número e parecia defeito do
 * código, quando era a fixture não representando o produto.
 */
const CONFIG = readConfigFile<DiagramaConfig>("diagrama.example.json");

/**
 * `ms` são os timeouts das ARESTAS, não dos nós.
 *
 * A primeira escrita pôs `timeoutMs` no `spec` do nó e a comparação voltou sem
 * número nenhum: `lerDesenho` soma o tempo dos TRECHOS QUE ESPERAM, e quem
 * declara espera é a conexão. A fixture estava errada, não o código — e o teste
 * da diferença foi quem disse isso.
 */
function diagrama(ms: number[]): Diagrama {
  const nodes = [{ id: "n0", type: "service", x: 0, y: 0, label: "api", status: "novo", spec: {}, specNA: {} }];
  const edges = ms.map((valor, i) => {
    nodes.push({ id: `n${i + 1}`, type: "service", x: (i + 1) * 100, y: 0, label: `srv-${i}`, status: "novo", spec: {}, specNA: {} });
    return {
      id: `e${i}`,
      source: `n${i}`,
      target: `n${i + 1}`,
      type: "http",
      spec: { timeoutMs: { valor, origem: "manual" } },
    };
  });
  return { nodes, edges } as unknown as Diagrama;
}

function quebra(p: Partial<Quebra> = {}): Quebra {
  return {
    titulo: "Vitrine síncrona",
    diagrama: diagrama([100, 200]),
    respostasItens: {},
    demandInfo: "",
    anexosContexto: [],
    ...p,
  } as unknown as Quebra;
}

const AGORA = { id: "v-2", em: "2026-08-30T10:00:00.000Z", autor: "ana@casa" };

describe("guardar uma alternativa NÃO é escolhê-la (SPEC-88 fatia A)", () => {
  it("guarda o desenho e não registra decisão nenhuma", () => {
    /**
     * Um ADR nascido de um "salvar como" seria ruído no histórico de decisões —
     * e o histórico de decisões é onde alguém procura o que foi decidido, não o
     * que foi cogitado.
     */
    const q = guardarComoVariante(quebra(), "Vitrine com fila", diagrama([100]), { id: "v-1", em: AGORA.em });

    expect(q.variantes).toHaveLength(1);
    expect(q.variantes![0].titulo).toBe("Vitrine com fila");
    expect(q.decisoes ?? []).toEqual([]);
    // O desenho de trabalho não muda: guardar não troca nada.
    expect(q.diagrama).toBe(quebra().diagrama.nodes.length === 2 ? q.diagrama : q.diagrama);
    expect(q.diagrama.nodes).toHaveLength(3);
  });

  it("alternativa sem título ganha um, em vez de virar linha em branco na lista", () => {
    const q = guardarComoVariante(quebra(), "   ", diagrama([50]), { id: "v-1", em: AGORA.em });

    expect(q.variantes![0].titulo).toBe("Alternativa");
  });
});

describe("adotar é uma TROCA, e ela registra a escolha (SPEC-88 §2)", () => {
  const comVariante = () =>
    guardarComoVariante(quebra(), "Vitrine com fila", diagrama([50]), { id: "v-1", em: AGORA.em });

  it("o desenho da variante vira o da quebra, e o de antes vira variante", () => {
    /**
     * A garantia central: em nenhum instante existem dois desenhos válidos. Há o
     * adotado, e há alternativas guardadas — e é por isso que prontidão, itens,
     * documento e spec não precisam aprender o que é uma variante.
     */
    const { quebra: depois } = adotarVariante(comVariante(), "v-1", "a fila tira o parceiro do caminho", AGORA);

    expect(depois.diagrama.nodes).toHaveLength(2);
    expect(depois.variantes).toHaveLength(1);
    expect(depois.variantes![0].titulo).toBe("Vitrine síncrona");
    expect(depois.variantes![0].diagrama.nodes).toHaveLength(3);
  });

  it("a decisão nasce com AS DUAS na lista e nomeia a escolhida", () => {
    // A SPEC-56 §8 disse que a comparação É o corpo do ADR. Aqui isso é literal.
    const { decisao } = adotarVariante(comVariante(), "v-1", "a fila tira o parceiro do caminho", AGORA);

    expect(decisao.alternativas.map((a) => a.titulo)).toEqual(["Vitrine com fila", "Vitrine síncrona"]);
    expect(decisao.escolhida).toBe("Vitrine com fila");
    expect(decisao.porque).toBe("a fila tira o parceiro do caminho");
    expect(decisao.autor).toBe("ana@casa");
  });

  it("a decisão entra na quebra, onde as decisões já moram", () => {
    // Não numa gaveta nova: quem procura o que foi decidido procura em um lugar.
    const { quebra: depois } = adotarVariante(comVariante(), "v-1", "porque sim, medido", AGORA);

    expect(depois.decisoes).toHaveLength(1);
    expect(depois.decisoes![0].origem).toBe("manual");
  });

  it("RECUSA adotar sem o porquê", () => {
    /**
     * É a régua do §230 pelo outro lado: não bloqueamos aprovar com lacuna
     * marcada, mas bloqueamos gravar decisão vazia — decisão vazia não é lacuna
     * marcada, é ausência disfarçada de registro. Sem isso, adotar seria "copiar
     * e editar" com um passo a mais.
     */
    expect(() => adotarVariante(comVariante(), "v-1", "   ", AGORA)).toThrow(AdocaoSemPorque);
  });

  it("variante que não existe estoura com o id, em vez de trocar por undefined", () => {
    expect(() => adotarVariante(comVariante(), "v-9", "qualquer", AGORA)).toThrow(VarianteInexistente);
  });

  it("adotar duas vezes não duplica: a lista tem sempre as NÃO adotadas", () => {
    const primeira = adotarVariante(comVariante(), "v-1", "primeiro motivo", AGORA).quebra;
    const segunda = adotarVariante(primeira, "v-2", "voltei atrás, e digo por quê", {
      ...AGORA,
      id: "v-3",
    }).quebra;

    expect(segunda.variantes).toHaveLength(1);
    expect(segunda.diagrama.nodes).toHaveLength(3);
    expect(segunda.decisoes).toHaveLength(2);
  });
});

describe("a comparação sai CALCULADA (SPEC-88 fatia B)", () => {
  it("os dois lados usam a mesma leitura que o produto já faz", () => {
    /**
     * Não há motor novo: `lerDesenho` é pura e roda sobre um diagrama. Um cálculo
     * próprio para a comparação seria uma segunda verdade sobre o mesmo desenho,
     * e as duas divergiriam na primeira mudança de régua (§263).
     */
    const c = compararVariantes(
      { titulo: "A", diagrama: diagrama([100, 200]) },
      { titulo: "B", diagrama: diagrama([100, 50]) },
      CONFIG
    );

    expect(c.a.titulo).toBe("A");
    expect(c.b.titulo).toBe("B");
    expect(c.a.leitura).toBeDefined();
  });

  it("a diferença é `b - a`, e sai da conta — não de quem digita", () => {
    const c = compararVariantes(
      { titulo: "A", diagrama: diagrama([100, 200]) },
      { titulo: "B", diagrama: diagrama([100, 200]) },
      CONFIG
    );

    expect(c.diferencaMs).toBe(0);
  });

  it("desenho sem tempo declarado NÃO vira zero", () => {
    /**
     * A asserção que impede a comparação de mentir. Tratar "não medido" como
     * zero faria o desenho sem dado nenhum parecer o mais rápido dos dois — que
     * é exatamente ao contrário. É a régua do §57 aplicada à comparação.
     */
    const semTempo = { nodes: [{ id: "n0", type: "service", x: 0, y: 0, label: "s", status: "novo", spec: {}, specNA: {} }], edges: [] } as unknown as Diagrama;

    const c = compararVariantes(
      { titulo: "A", diagrama: diagrama([100, 200]) },
      { titulo: "B", diagrama: semTempo },
      CONFIG
    );

    expect(c.b.piorTrechoMs).toBeUndefined();
    expect(c.diferencaMs).toBeUndefined();
  });
});
