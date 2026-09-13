import { describe, expect, it } from "vitest";
import {
  PREFIXO_DO_FLUXO_DA_TELA,
  fluxosEmVigor,
  idDoFluxoDaTela,
  planoDoFluxo,
  telaDoFluxoImplicito,
  telasStandalone,
  validarEscritaFluxos,
} from "./fluxos.js";
import { normalizarPipelineAgentes } from "./normalizacao.js";

/**
 * SPEC-111 fatia A — **a tela que vale sozinha.**
 *
 * A promessa da SPEC-111 §2.1: *"uma screen declarada pode ser aberta e usada
 * direto da galeria e por link mandável"*. O desenho que a §3 previu —
 * *"standalone = fluxo implícito de um nó"* — se confirmou literal na medição
 * contra a SPEC-110 pronta: não há motor a escrever, há um fluxo a derivar.
 *
 * Estas provas guardam o que essa derivação promete: que ela existe por tela
 * declarada, que o plano para NA tela (é o que faz a execução esperar gente),
 * que ela não disputa id com fluxo nenhum, e que ela não vaza para onde não
 * deve.
 */

const DOC_TELAS = {
  telas: [
    {
      id: "aprovacao",
      nome: "Aprovação de despesa",
      icone: "🧾",
      blocos: [
        { tipo: "texto", markdown: "Confira e aprove." },
        { tipo: "campo", chave: "valor", rotulo: "Valor", entrada: "numero", obrigatorio: true },
      ],
    },
    { id: "feedback", nome: "Deixe seu feedback", blocos: [{ tipo: "campo", chave: "texto", rotulo: "O quê?", entrada: "texto" }] },
  ],
};

const PAPEIS = normalizarPipelineAgentes({ papeis: [] }).papeis;

describe("o fluxo implícito de uma tela declarada", () => {
  it("existe UM por tela, com o nome e o rosto dela", () => {
    const implicitos = telasStandalone(DOC_TELAS);
    expect(implicitos.map((f) => f.id)).toEqual([idDoFluxoDaTela("aprovacao"), idDoFluxoDaTela("feedback")]);
    expect(implicitos[0].nome).toBe("Aprovação de despesa");
    expect(implicitos[0].icone).toBe("🧾");
    // Sem ícone declarado, o fluxo não inventa um: a galeria põe o padrão.
    expect(implicitos[1].icone).toBeUndefined();
  });

  it("tem UM nó, que é a tela — e é isso que faz a execução esperar gente", () => {
    const [aprovacao] = telasStandalone(DOC_TELAS);
    expect(aprovacao.nos).toHaveLength(1);
    expect(aprovacao.nos[0]).toMatchObject({ id: "tela", tipo: "tela", refId: "tela:aprovacao" });
    expect(aprovacao.arestas).toEqual([]);
    // O plano começa NELE: a execução para no primeiro nó, que é a tela.
    expect(planoDoFluxo(aprovacao).ordem).toEqual(["tela"]);
  });

  it("NÃO tem gatilho — o gesto de abrir é a resposta de “quando isto roda?”", () => {
    // Um cartão de gatilho aqui seria um cartão a mais para a pessoa entender,
    // dizendo o que o próprio gesto já diz.
    expect(telasStandalone(DOC_TELAS)[0].nos.some((n) => n.tipo === "gatilho")).toBe(false);
  });

  it("é derivado e MARCADO como implícito: a galeria esconde o que já mostra como tela", () => {
    const [aprovacao] = telasStandalone(DOC_TELAS);
    expect(aprovacao.origem).toBe("fabrica");
    expect(aprovacao.implicito).toBe(true);
  });

  it("sem documento de telas, não há implícito nenhum", () => {
    expect(telasStandalone(undefined)).toEqual([]);
    expect(telasStandalone({ telas: [] })).toEqual([]);
  });
});

describe("o implícito no catálogo em vigor", () => {
  it("entra junto dos outros, sem sumir com ninguém", () => {
    const semTelas = fluxosEmVigor(PAPEIS, { fluxos: [] });
    const comTelas = fluxosEmVigor(PAPEIS, { fluxos: [] }, undefined, DOC_TELAS);
    expect(comTelas).toHaveLength(semTelas.length + 2);
    expect(comTelas.filter((f) => f.implicito).map((f) => f.id)).toEqual([
      idDoFluxoDaTela("aprovacao"),
      idDoFluxoDaTela("feedback"),
    ]);
  });

  it("não sombreia nem é sombreado: o id dele é impossível de escrever à mão", () => {
    // A escrita recusa `:` num id de fluxo declarado, então a colisão não é
    // improvável — é impossível. Aqui a prova das duas pontas.
    expect(() =>
      validarEscritaFluxos({ fluxos: [{ id: idDoFluxoDaTela("aprovacao"), nome: "tentativa", nos: [], arestas: [] }] })
    ).toThrow();

    const emVigor = fluxosEmVigor(PAPEIS, { fluxos: [] }, undefined, DOC_TELAS);
    const implicito = emVigor.find((f) => f.id === idDoFluxoDaTela("aprovacao"))!;
    expect(implicito.sombreiaFabrica).toBeUndefined();
  });

  it("o id leva de volta à tela, e só o do implícito responde", () => {
    expect(telaDoFluxoImplicito(idDoFluxoDaTela("aprovacao"))).toBe("aprovacao");
    expect(telaDoFluxoImplicito("esteira-de-agentes")).toBeNull();
    expect(idDoFluxoDaTela("x").startsWith(PREFIXO_DO_FLUXO_DA_TELA)).toBe(true);
  });
});
