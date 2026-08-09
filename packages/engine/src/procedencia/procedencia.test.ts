import { describe, expect, it } from "vitest";
import type { Atividade, Diagrama } from "../model/types.js";
import {
  carimbarInsumos,
  hashCurto,
  insumosDivergentes,
  insumosDoItem,
  respostaDesatualizada,
} from "./procedencia.js";

const diagrama = (timeout = "300ms"): Diagrama => ({
  nodes: [
    {
      id: "n1",
      type: "service",
      label: "srv-checkout",
      x: 0,
      y: 0,
      spec: {
        nome: { valor: "srv-checkout", origem: "manual" },
        linguagem: { valor: "Java", origem: "manual" },
        vazio: { valor: "", origem: "manual" },
      },
    },
    {
      id: "n2",
      type: "service",
      label: "srv-fidelidade",
      x: 200,
      y: 0,
      spec: { timeout: { valor: timeout, origem: "manual" } },
    },
  ],
  edges: [
    {
      id: "e1",
      type: "http",
      source: "n1",
      target: "n2",
      spec: { retry: { valor: "3 tentativas", origem: "manual" } },
    },
  ],
});

const doNo: Atividade = {
  chave: "n1::setup",
  rotulo: "01",
  tipo: "História",
  tamanho: "M",
  descricao: "",
  techs: ["Backend"],
  contextos: [],
  dependencias: [],
  origem: { nodeId: "n1" },
} as unknown as Atividade;

const daAresta: Atividade = { ...doNo, chave: "e1::http", origem: { edgeId: "e1" } } as unknown as Atividade;

describe("hashCurto", () => {
  it("é estável e distingue textos diferentes — o mesmo valor sempre dá o mesmo hash", () => {
    expect(hashCurto("300ms")).toBe(hashCurto("300ms"));
    expect(hashCurto("300ms")).not.toBe(hashCurto("150ms"));
    // Sem node:crypto de propósito: o engine roda no browser também, e um hash
    // diferente entre ambientes marcaria tudo como desatualizado sem motivo.
    expect(typeof hashCurto("x")).toBe("string");
  });
});

describe("insumosDoItem (SPEC-26 Bloco 1)", () => {
  it("item de nó: pega a spec do nó de origem, ignora campo em branco e ordena estável", () => {
    const insumos = insumosDoItem(doNo, diagrama());
    expect(insumos.map((i) => i.rotulo)).toEqual(["srv-checkout.linguagem", "srv-checkout.nome"]);
    // Campo vazio fora: senão preencher um campo qualquer marcaria como
    // desatualizada uma resposta que nada tem a ver com ele.
    expect(insumos.some((i) => i.rotulo.endsWith(".vazio"))).toBe(false);
  });

  it("item de conexão: pega os dois nós das pontas E a spec da própria conexão", () => {
    const rotulos = insumosDoItem(daAresta, diagrama()).map((i) => i.rotulo);
    expect(rotulos).toContain("srv-checkout.nome");
    expect(rotulos).toContain("srv-fidelidade.timeout");
    // SPEC-21: mudar o retry da chamada tem que desatualizar quem falava dele.
    expect(rotulos).toContain("conexão http.retry");
  });

  it("o contexto do épico entra como insumo quando existe", () => {
    expect(insumosDoItem(doNo, diagrama(), "  reduzir o tempo de aprovação  ")).toContainEqual({
      rotulo: "contexto do épico",
      valor: "reduzir o tempo de aprovação",
    });
    expect(insumosDoItem(doNo, diagrama(), "   ").map((i) => i.rotulo)).not.toContain("contexto do épico");
  });
});

describe("insumosDivergentes", () => {
  it("desenho intacto: nada divergente", () => {
    const carimbo = carimbarInsumos(insumosDoItem(daAresta, diagrama()));
    expect(insumosDivergentes(carimbo, insumosDoItem(daAresta, diagrama()))).toEqual([]);
  });

  it("campo alterado depois da resposta: aponta QUAL insumo mudou, não só que algo mudou", () => {
    const carimbo = carimbarInsumos(insumosDoItem(daAresta, diagrama("300ms")));
    expect(insumosDivergentes(carimbo, insumosDoItem(daAresta, diagrama("150ms")))).toEqual([
      { rotulo: "srv-fidelidade.timeout", tipo: "alterado" },
    ]);
  });

  it("insumo que apareceu ou sumiu do desenho também conta", () => {
    const antes = insumosDoItem(doNo, diagrama());
    const carimbo = carimbarInsumos(antes);

    const semLinguagem = diagrama();
    delete semLinguagem.nodes[0].spec!.linguagem;
    expect(insumosDivergentes(carimbo, insumosDoItem(doNo, semLinguagem))).toEqual([
      { rotulo: "srv-checkout.linguagem", tipo: "removido" },
    ]);

    const comFramework = diagrama();
    comFramework.nodes[0].spec!.framework = { valor: "Spring Boot", origem: "manual" };
    expect(insumosDivergentes(carimbo, insumosDoItem(doNo, comFramework))).toEqual([
      { rotulo: "srv-checkout.framework", tipo: "novo" },
    ]);
  });

  it("resposta SEM carimbo (escrita antes deste mecanismo) não é acusada de nada", () => {
    // Alarme falso no primeiro uso seria pior que silêncio: sem carimbo não há
    // o que comparar, então não há afirmação a fazer.
    expect(insumosDivergentes(undefined, insumosDoItem(doNo, diagrama()))).toEqual([]);
    expect(respostaDesatualizada({ valor: "x", origem: "sugerido" }, insumosDoItem(doNo, diagrama()))).toBe(false);
  });

  it("respostaDesatualizada casa o carimbo gravado na própria resposta", () => {
    const resposta = {
      valor: "usa timeout de 300ms",
      origem: "sugerido" as const,
      baseadoEm: carimbarInsumos(insumosDoItem(daAresta, diagrama("300ms"))),
    };
    expect(respostaDesatualizada(resposta, insumosDoItem(daAresta, diagrama("300ms")))).toBe(false);
    expect(respostaDesatualizada(resposta, insumosDoItem(daAresta, diagrama("150ms")))).toBe(true);
  });
});
