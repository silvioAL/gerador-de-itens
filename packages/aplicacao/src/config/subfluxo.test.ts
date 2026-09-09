import { describe, expect, it } from "vitest";
import { cicloEntreFluxos, contratoDoSubfluxo, validarEscritaFluxos, type Fluxo } from "./fluxos.js";
import { funcaoDoSistema } from "./funcoes.js";
import { telaDoSistema } from "./telas.js";
import { dadoDoSistema } from "./projeto.js";

/**
 * SPEC-110 fatia J (D16) — **um fluxo inteiro como um nó.**
 *
 * *"quais fluxos estão relacionados ao quê? … faria mais sentido ter um fluxo
 * maior com pools ou algo assim"*. A relação entre fluxos era conhecimento de
 * quem os desenhou; aqui ela vira desenho.
 */

/** O contrato de um nó, pelas mesmas fontes que a tela usa. */
const contratoDoNo = (no: { tipo: string; refId: string }) => {
  if (no.tipo === "funcao") return funcaoDoSistema(no.refId) ?? null;
  if (no.tipo === "tela") return telaDoSistema(no.refId) ?? null;
  if (no.tipo === "projeto") return dadoDoSistema(no.refId) ?? null;
  return null;
};

const fluxo = (id: string, nos: Fluxo["nos"], arestas: Fluxo["arestas"] = []): Fluxo => ({ id, nome: id, nos, arestas });
const no = (id: string, tipo: string, refId: string): Fluxo["nos"][number] =>
  ({ id, tipo, refId, posicao: { x: 0, y: 0 }, parametros: {} }) as Fluxo["nos"][number];

describe("o contrato de um fluxo visto de fora", () => {
  it("a ENTRADA é o que o fluxo não produz — e o gatilho não conta", () => {
    /**
     * `ensaio` precisa de `desenho`, e ninguém dentro deste fluxo o produz:
     * logo o subfluxo precisa recebê-lo. O gatilho fica de fora porque quem
     * dispara um subfluxo é o pai — o gatilho do filho não dispara nada.
     */
    const f = fluxo("so-ensaio", [no("gatilho", "gatilho", "manual"), no("ensaio", "funcao", "ensaio")], [
      { de: "gatilho", para: "ensaio", mapeamento: [] },
    ]);
    // Com a aresta do gatilho, `ensaio` TEM produtor — e some da entrada.
    expect(contratoDoSubfluxo(f, contratoDoNo).entrada.map((c) => c.chave)).toEqual([]);

    // Sem produtor nenhum, ele aparece: é o que o pai tem de alimentar.
    const solto = fluxo("solto", [no("ensaio", "funcao", "ensaio")]);
    expect(contratoDoSubfluxo(solto, contratoDoNo).entrada.map((c) => c.chave)).toContain("desenho");
  });

  it("a SAÍDA é a do último nó da ordem — o que o fluxo entrega ao terminar", () => {
    const f = fluxo(
      "deriva",
      [no("demanda", "projeto", "demanda-ler"), no("gera", "funcao", "derivacao")],
      [{ de: "demanda", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }]
    );
    const contrato = contratoDoSubfluxo(f, contratoDoNo);
    expect(contrato.saida.map((c) => c.chave)).toEqual(["itens", "avisos", "conformidade"]);
  });

  it("fluxo com CICLO não tem contrato — um subfluxo sobre ele nunca rodaria", () => {
    const f = fluxo(
      "circular",
      [no("a", "funcao", "derivacao"), no("b", "funcao", "ensaio")],
      [
        { de: "a", para: "b", mapeamento: [] },
        { de: "b", para: "a", mapeamento: [] },
      ]
    );
    expect(contratoDoSubfluxo(f, contratoDoNo)).toEqual({ entrada: [], saida: [] });
  });

  it("a mesma chave pedida por dois nós entra UMA vez", () => {
    // Senão o painel do subfluxo ofereceria "desenho" duas vezes, e a pessoa
    // teria de adivinhar qual dos dois alimenta qual nó.
    const f = fluxo("dois-pedem", [no("um", "funcao", "derivacao"), no("dois", "funcao", "ensaio")]);
    const chaves = contratoDoSubfluxo(f, contratoDoNo).entrada.map((c) => c.chave);
    expect(chaves.filter((c) => c === "desenho")).toHaveLength(1);
  });
});

describe("o ciclo entre FLUXOS", () => {
  it("A → B → A é recusado, com a MESMA frase do ciclo entre nós", () => {
    const documento = {
      fluxos: [
        fluxo("a", [no("chama-b", "subfluxo", "b")]),
        fluxo("b", [no("chama-a", "subfluxo", "a")]),
      ],
    };
    expect(cicloEntreFluxos(documento.fluxos)).not.toBeNull();
    expect(() => validarEscritaFluxos(documento)).toThrow(/^Ciclo: /);
    expect(() => validarEscritaFluxos(documento)).toThrow(/não pode voltar a quem o chamou/);
  });

  it("um subfluxo que aponta para o PRÓPRIO fluxo é recusado nomeando", () => {
    const documento = { fluxos: [fluxo("eu", [no("eu-mesmo", "subfluxo", "eu")])] };
    expect(() => validarEscritaFluxos(documento)).toThrow(/referencia o PRÓPRIO fluxo/);
  });

  it("cadeia sem volta passa — A → B → C não é ciclo", () => {
    const documento = {
      fluxos: [
        fluxo("a", [no("vai", "subfluxo", "b")]),
        fluxo("b", [no("vai", "subfluxo", "c")]),
        fluxo("c", [no("fim", "funcao", "derivacao")]),
      ],
    };
    expect(cicloEntreFluxos(documento.fluxos)).toBeNull();
    expect(() => validarEscritaFluxos(documento)).not.toThrow();
  });

  it("subfluxo para um fluxo que não existe é recusado — nem declarado, nem de fábrica", () => {
    const documento = { fluxos: [fluxo("meu", [no("chama", "subfluxo", "fantasma")])] };
    expect(() => validarEscritaFluxos(documento)).toThrow(/aponta para "fantasma", que não existe/);
  });

  it("subfluxo para uma FÁBRICA passa — ela existe sem estar declarada", () => {
    // A esteira e o ensaio existem no catálogo em vigor sem linha no
    // documento; recusá-los faria o fluxo-mestre ser insalvável.
    const documento = { fluxos: [fluxo("mestre", [no("etapa", "subfluxo", "ensaio-de-cenarios")])] };
    expect(() => validarEscritaFluxos(documento)).not.toThrow();
  });
});
