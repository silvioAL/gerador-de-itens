import { describe, expect, it } from "vitest";
import { fluxoDoPdca, planoDoFluxo, validarEscritaFluxos, type FluxoEmVigor } from "./fluxos.js";
import { funcaoDoSistema } from "./funcoes.js";
import { telaDoSistema } from "./telas.js";
import type { PapelConfigurado } from "./normalizacao.js";

/**
 * SPEC-110 fatia G (D13) — **o ciclo de melhoria como desenho.**
 *
 * O que estes testes trancam não é "o fluxo existe" — é que ele é FIÁVEL: cada
 * campo mapeado existe no contrato das duas pontas, a revisão humana está no
 * caminho (e não pendurada de lado), e nenhum nó escreve configuração direto.
 */

const PAPEIS: PapelConfigurado[] = [
  { id: "po", nome: "PO", ativo: true, ordem: 1, preambulo: "" } as never,
  { id: "qa", nome: "QA", ativo: true, ordem: 2, preambulo: "" } as never,
];

const contratoDoNo = (fluxo: FluxoEmVigor, id: string) => {
  const no = fluxo.nos.find((n) => n.id === id)!;
  if (no.tipo === "funcao") return funcaoDoSistema(no.refId)!;
  if (no.tipo === "tela") return telaDoSistema(no.refId)!;
  return null;
};

describe("o fluxo de fábrica do PDCA", () => {
  it("sem papel ativo não existe — fluxo de fábrica quebrado é pior que fluxo nenhum", () => {
    expect(fluxoDoPdca([])).toBeNull();
    expect(fluxoDoPdca([{ id: "po", nome: "PO", ativo: false, ordem: 1, preambulo: "" } as never])).toBeNull();
  });

  it("a fiação é gatilho → (feedbacks + config) → agente → TELA → propor → aplicar", () => {
    const fluxo = fluxoDoPdca(PAPEIS)!;
    const ordem = planoDoFluxo(fluxo).ordem;
    // O gatilho abre; a tela vem ANTES de propor e aplicar. É a ordem que
    // torna o ciclo revisável em vez de automático.
    expect(ordem[0]).toBe("gatilho");
    expect(ordem.indexOf("revisao")).toBeLessThan(ordem.indexOf("propoe"));
    expect(ordem.indexOf("propoe")).toBeLessThan(ordem.indexOf("aplica"));
    expect(ordem.indexOf("po")).toBeLessThan(ordem.indexOf("revisao"));
  });

  it("a revisão está NO CAMINHO — tirar a tela não deixa o aplicar rodar sozinho", () => {
    /**
     * A prova da D13: a tela é um GATE, não um enfeite. Se ela estivesse
     * pendurada de lado, a execução chegaria em `aplica` sem ninguém ter
     * olhado — e o produto teria automação cega mexendo em regra de time.
     */
    const fluxo = fluxoDoPdca(PAPEIS)!;
    const chegamNoAplica = new Set<string>();
    const caminharAte = (destino: string) => {
      const pendentes = [destino];
      while (pendentes.length) {
        const atual = pendentes.pop()!;
        for (const a of fluxo.arestas.filter((x) => x.para === atual)) {
          if (chegamNoAplica.has(a.de)) continue;
          chegamNoAplica.add(a.de);
          pendentes.push(a.de);
        }
      }
    };
    caminharAte("aplica");
    expect(chegamNoAplica.has("revisao")).toBe(true);
  });

  it("todo campo mapeado existe nos DOIS contratos", () => {
    /**
     * O defeito que isto tranca é o mais barato de cometer e o mais caro de
     * achar: uma aresta que aponta para um campo que o contrato não declara
     * roda "com sucesso" e entrega nada — a tela abre vazia e ninguém sabe
     * por quê.
     */
    const fluxo = fluxoDoPdca(PAPEIS)!;
    const problemas: string[] = [];
    for (const aresta of fluxo.arestas) {
      const de = contratoDoNo(fluxo, aresta.de);
      const para = contratoDoNo(fluxo, aresta.para);
      for (const par of aresta.mapeamento) {
        if (de && !de.saida.some((c) => c.chave === par.saida)) {
          problemas.push(`"${aresta.de}" não declara a saída "${par.saida}"`);
        }
        if (para && !para.entrada.some((c) => c.chave === par.entrada)) {
          problemas.push(`"${aresta.para}" não declara a entrada "${par.entrada}"`);
        }
      }
    }
    expect(problemas).toEqual([]);
  });

  it("a tela recebe as TRÊS coisas: o que motivou, o que se propõe e como está hoje", () => {
    // Aprovar sem ver a configuração de hoje é aprovar no escuro.
    const fluxo = fluxoDoPdca(PAPEIS)!;
    const entradasDaRevisao = fluxo.arestas
      .filter((a) => a.para === "revisao")
      .flatMap((a) => a.mapeamento.map((m) => m.entrada))
      .sort();
    expect(entradasDaRevisao).toEqual(["configuracaoAtual", "feedbacks", "proposta"]);
  });

  it("nenhum nó escreve configuração direto — só PROPÕE (D13)", () => {
    const fluxo = fluxoDoPdca(PAPEIS)!;
    const escritores = fluxo.nos.filter((n) => n.tipo === "funcao" && n.refId.startsWith("config-")).map((n) => n.refId);
    expect(escritores.sort()).toEqual(["config-aplicar-ajuste", "config-ler", "config-propor-ajuste"]);
    // E o que aplica recebe o id de quem PROPÔS — não uma chave de config.
    const paraAplica = fluxo.arestas.filter((a) => a.para === "aplica").flatMap((a) => a.mapeamento);
    expect(paraAplica).toEqual([{ saida: "solicitacaoId", entrada: "solicitacaoId" }]);
  });

  it("o desenho de fábrica passa pela régua de escrita da casa", () => {
    // Um fluxo de fábrica que a própria escrita recusaria seria insalvável no
    // instante em que alguém o editasse.
    expect(() => validarEscritaFluxos({ fluxos: [fluxoDoPdca(PAPEIS)!] })).not.toThrow();
  });

  it("usa o primeiro papel ATIVO, e ele é quem propõe", () => {
    const fluxo = fluxoDoPdca([
      { id: "arquiteto", nome: "Arquiteto", ativo: false, ordem: 1, preambulo: "" } as never,
      ...PAPEIS,
    ])!;
    expect(fluxo.nos.some((n) => n.id === "arquiteto")).toBe(false);
    expect(fluxo.nos.find((n) => n.tipo === "agente")!.refId).toBe("po");
  });
});
