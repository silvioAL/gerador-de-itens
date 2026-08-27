import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "../config/types.js";
import type { Diagrama } from "../model/types.js";
import { readConfigFile } from "../test-support/fixtures.js";
import { descreverVolumetria, distribuirVolumetria, emRequisicoesPorSegundo } from "./volumetria.js";

/**
 * SPEC-70 fatia A — o volume dito uma vez, distribuído pelo grafo.
 */
const config = readConfigFile<DiagramaConfig>("diagrama.example.json");

function no(id: string, type = "service") {
  return { id, type, label: id, x: 0, y: 0, status: "novo", spec: {}, specNA: {} };
}

function aresta(id: string, source: string, target: string, type: string) {
  return { id, source, target, type, spec: {} };
}

function diagrama(nodes: unknown[], edges: unknown[]): Diagrama {
  return { nodes, edges } as unknown as Diagrama;
}

describe("emRequisicoesPorSegundo — a unidade do negócio vira a da conta", () => {
  it("converte o que a pessoa sabe dizer", () => {
    // "2 milhões por dia" é como o número chega; 23,15 req/s é como a Lei de
    // Little o usa. Obrigar a conversão na cabeça é onde ele entra errado.
    expect(emRequisicoesPorSegundo({ quantidade: 2_000_000, por: "dia" })).toBeCloseTo(23.148, 2);
    expect(emRequisicoesPorSegundo({ quantidade: 600, por: "minuto" })).toBe(10);
    expect(emRequisicoesPorSegundo({ quantidade: 50, por: "segundo" })).toBe(50);
  });

  it("zero e ausência não viram número — sem volume, nada se afirma", () => {
    // §248 — "0 req/s" propagado daria um mapa de zeros com cara de medição.
    expect(emRequisicoesPorSegundo(undefined)).toBeUndefined();
    expect(emRequisicoesPorSegundo({ quantidade: 0, por: "dia" })).toBeUndefined();
    expect(emRequisicoesPorSegundo({ quantidade: -5, por: "dia" })).toBeUndefined();
  });

  it("a frase mostra as DUAS: a unidade de quem escreveu e o req/s da conta", () => {
    // Esconder o req/s faria a acusação de saturação citar um número que não
    // está em lugar nenhum da tela.
    const frase = descreverVolumetria({ quantidade: 600, por: "minuto" })!;
    expect(frase).toContain("600 por minuto");
    expect(frase).toContain("10 req/s");
  });
});

describe("distribuirVolumetria — o passeio pelo grafo", () => {
  /** api →http→ srv →http→ bureau: uma corrente síncrona. */
  const corrente = () =>
    diagrama(
      [no("api"), no("srv"), no("bureau", "external")],
      [aresta("e1", "api", "srv", "http"), aresta("e2", "srv", "bureau", "http")]
    );

  it("a entrada recebe o volume, e a corrente inteira o carrega", () => {
    const porNo = distribuirVolumetria(corrente(), config, { quantidade: 100, por: "segundo" });

    expect(porNo.get("api")).toBe(100);
    expect(porNo.get("srv")).toBe(100);
    expect(porNo.get("bureau")).toBe(100);
  });

  it("o fan-out NÃO divide — cada chamada acontece uma vez por requisição", () => {
    // Dividir seria supor que a requisição escolhe um dos ramos. Ela faz os
    // dois: quem espera as duas segura a requisição pelas duas (§291).
    const d = diagrama(
      [no("api"), no("a"), no("b")],
      [aresta("e1", "api", "a", "http"), aresta("e2", "api", "b", "http")]
    );

    const porNo = distribuirVolumetria(d, config, { quantidade: 100, por: "segundo" });
    expect(porNo.get("a")).toBe(100);
    expect(porNo.get("b")).toBe(100);
  });

  it("nó chamado por DOIS caminhos soma — uma requisição de cada lado é uma de cada lado", () => {
    const d = diagrama(
      [no("api"), no("a"), no("b"), no("comum")],
      [
        aresta("e1", "api", "a", "http"),
        aresta("e2", "api", "b", "http"),
        aresta("e3", "a", "comum", "http"),
        aresta("e4", "b", "comum", "http"),
      ]
    );

    expect(distribuirVolumetria(d, config, { quantidade: 100, por: "segundo" }).get("comum")).toBe(200);
  });

  it("conexão ASSÍNCRONA não propaga — quem publica numa fila não segura a requisição", () => {
    // A Lei de Little conta quem SEGURA. É a mesma régua do `arestaEspera` que
    // o §291 fixou, e sem ela a fila herdaria uma taxa que não a atinge assim.
    //
    // O mesmo nó faz as duas coisas: chama o `srv` e publica na fila. É o caso
    // real, e é o que separa a régua de um teste que só olha um lado.
    const d = diagrama(
      [no("api"), no("srv"), no("fila", "rabbit")],
      [aresta("e1", "api", "srv", "http"), aresta("e2", "api", "fila", "publishes")]
    );

    const porNo = distribuirVolumetria(d, config, { quantidade: 100, por: "segundo" });
    expect(porNo.get("api")).toBe(100);
    expect(porNo.get("srv")).toBe(100);
    expect(porNo.get("fila")).toBeUndefined();
  });

  it("nó fora de qualquer corrente síncrona não vira porta da frente", () => {
    // A regra de entrada é "ninguém síncrono me chama E eu chamo alguém". Sem a
    // segunda metade, uma fila solta seria tratada como porta da frente e
    // receberia o volume inteiro — nada no desenho diz isso.
    const d = diagrama([no("fila", "rabbit")], []);

    expect(distribuirVolumetria(d, config, { quantidade: 100, por: "segundo" }).size).toBe(0);
  });

  it("o fator do ensaio multiplica o volume INTEIRO, e chega a todos de uma vez", () => {
    // §5 — pico de tráfego é condição do MUNDO, não propriedade de um
    // componente escolhido a dedo.
    const porNo = distribuirVolumetria(corrente(), config, { quantidade: 100, por: "segundo" }, 10);

    expect(porNo.get("api")).toBe(1000);
    expect(porNo.get("bureau")).toBe(1000);
  });

  it("sem volume declarado, o mapa vem VAZIO — não zerado", () => {
    // Um mapa de zeros seria uma medição inventada, e a saturação passaria a
    // absolver por um número que ninguém disse.
    expect(distribuirVolumetria(corrente(), config, undefined).size).toBe(0);
  });

  it("ciclo síncrono não trava — a guarda existe porque o desenho pode ter um", () => {
    const d = diagrama(
      [no("a"), no("b")],
      [aresta("e1", "a", "b", "http"), aresta("e2", "b", "a", "http")]
    );

    // Sem entrada (os dois recebem), nada a propagar — e o importante é que
    // isto RETORNA.
    expect(() => distribuirVolumetria(d, config, { quantidade: 10, por: "segundo" })).not.toThrow();
  });

  it("§9.1 — DUAS entradas recebem cada uma o volume inteiro", () => {
    // É uma escolha declarada, não uma dedução: dividir entre elas inventaria
    // uma distribuição que ninguém disse.
    const d = diagrama(
      [no("web"), no("mobile"), no("srv")],
      [aresta("e1", "web", "srv", "http"), aresta("e2", "mobile", "srv", "http")]
    );

    const porNo = distribuirVolumetria(d, config, { quantidade: 100, por: "segundo" });
    expect(porNo.get("web")).toBe(100);
    expect(porNo.get("mobile")).toBe(100);
    expect(porNo.get("srv")).toBe(200);
  });
});
