import { describe, expect, it } from "vitest";
import {
  DADOS_DO_SISTEMA,
  PROJETO_DO_SISTEMA,
  REF_DA_DEMANDA_GRAVAR,
  REF_DA_DEMANDA_LER,
  REF_DO_PROJETO,
  REFS_DE_DADOS,
  dadoDoSistema,
} from "./projeto.js";
import { fluxoDaEsteira, fluxoDaExportacao, fluxoDoEnsaio, fluxosDaPublicacao } from "./fluxos.js";

/** O exportador mínimo que faz as duas fábricas de destino existirem. */
const EXPORTADOR = {
  endpoint: "",
  rotulo: "",
  cabecalhos: {},
  destinos: [
    { id: "tracker", operacao: "itens" as const, endpoint: "https://x/itens", rotulo: "Tracker" },
    { id: "repo", operacao: "documento" as const, endpoint: "https://x/doc", rotulo: "Repo" },
  ],
};
const PAPEIS = [{ id: "po", nome: "PO", ativo: true, prompt: "", ordem: 1 }] as never;

/**
 * SPEC-110 fatia F (D10) — **a demanda desdobrada: o contrato como prova.**
 *
 * O que estes testes trancam não é "os dois registros existem" — é que eles
 * DECLARAM o que o executor faz. O contrato do nó fundido mentia (o executor
 * emitia quatro campos que ele não declarava, e a fábrica mapeava os quatro),
 * e uma mentira dessas só aparece quando alguém abre o painel de mapeamento e
 * não encontra o campo que a esteira usa.
 */

describe("os dois registros de dados da demanda", () => {
  it("a lista é fechada e o legado continua nela", () => {
    expect(DADOS_DO_SISTEMA.map((d) => d.id)).toEqual([REF_DA_DEMANDA_LER, REF_DA_DEMANDA_GRAVAR]);
    // O legado NÃO está em DADOS_DO_SISTEMA (ele não é oferecido na paleta),
    // mas está entre os refIds aceitos: fluxos salvos antes precisam continuar
    // salváveis.
    expect(REFS_DE_DADOS).toContain(REF_DO_PROJETO);
    expect(dadoDoSistema(REF_DO_PROJETO)).toBeUndefined();
  });

  it("ler só LÊ: nenhum campo de escrita na entrada", () => {
    const ler = dadoDoSistema(REF_DA_DEMANDA_LER)!;
    // `demandaId` é o único parâmetro — e é parâmetro, não fiação de escrita.
    expect(ler.entrada.map((c) => c.chave)).toEqual(["demandaId"]);
    for (const escrita of ["desenho", "resultados", "enviados", "linkExterno", "respostasItens"]) {
      expect(ler.entrada.map((c) => c.chave)).not.toContain(escrita);
    }
  });

  it("gravar só GRAVA: nenhuma saída de leitura", () => {
    const gravar = dadoDoSistema(REF_DA_DEMANDA_GRAVAR)!;
    for (const leitura of ["desenho", "itens", "itensProntos", "markdown", "volumetria", "filaDaEsteira"]) {
      expect(gravar.saida.map((c) => c.chave)).not.toContain(leitura);
    }
  });

  it("o contrato da LEITURA declara o que o executor sempre emitiu e nunca disse", () => {
    /**
     * Os quatro campos que o `PROJETO_DO_SISTEMA` omitia. `filaDaEsteira`,
     * `contextoEpico` e `contextoDoProduto` saem da leitura; `respostasItens`
     * entra na escrita. A fábrica da esteira mapeia os quatro — sem esta
     * declaração, o painel de mapeamento não os oferece a ninguém.
     */
    const chaves = dadoDoSistema(REF_DA_DEMANDA_LER)!.saida.map((c) => c.chave);
    expect(chaves).toContain("filaDaEsteira");
    expect(chaves).toContain("contextoEpico");
    expect(chaves).toContain("contextoDoProduto");
    expect(dadoDoSistema(REF_DA_DEMANDA_GRAVAR)!.entrada.map((c) => c.chave)).toContain("respostasItens");
    // A régua: o legado NÃO os declarava. Se um dia alguém os acrescentar lá,
    // este teste avisa que a duplicação voltou.
    for (const omitido of ["filaDaEsteira", "contextoEpico", "contextoDoProduto"]) {
      expect(PROJETO_DO_SISTEMA.saida.map((c) => c.chave)).not.toContain(omitido);
    }
  });

  it("todo campo mapeado pelas FÁBRICAS é um campo declarado", () => {
    /**
     * A prova que teria pego a mentira antiga sozinha: para cada aresta das
     * quatro fábricas, o campo de saída existe no contrato de quem produz e o
     * de entrada existe no contrato de quem consome. Vale só para os nós de
     * dados — os outros tipos têm registros próprios.
     */
    const contrato = (refId: string) => dadoDoSistema(refId);
    const problemas: string[] = [];
    const todos = [fluxoDaEsteira(PAPEIS), fluxoDaExportacao(EXPORTADOR), ...fluxosDaPublicacao(EXPORTADOR), fluxoDoEnsaio()].filter(
      (f): f is NonNullable<typeof f> => f !== null
    );
    // Uma fábrica que devolvesse null deixaria este teste verde sem olhar nada.
    expect(todos.length).toBe(4);
    for (const fluxo of todos) {
      const porId = new Map(fluxo.nos.map((n) => [n.id, n]));
      for (const aresta of fluxo.arestas) {
        const de = porId.get(aresta.de);
        const para = porId.get(aresta.para);
        for (const par of aresta.mapeamento) {
          const produtor = de && de.tipo === "projeto" ? contrato(de.refId) : null;
          if (produtor && !produtor.saida.some((c) => c.chave === par.saida)) {
            problemas.push(`${fluxo.id}: "${de!.id}" (${de!.refId}) não declara a saída "${par.saida}"`);
          }
          const consumidor = para && para.tipo === "projeto" ? contrato(para.refId) : null;
          if (consumidor && !consumidor.entrada.some((c) => c.chave === par.entrada)) {
            problemas.push(`${fluxo.id}: "${para!.id}" (${para!.refId}) não declara a entrada "${par.entrada}"`);
          }
        }
      }
    }
    expect(problemas).toEqual([]);
  });

  it("as fábricas dizem a direção no refId — a queixa M9 morta no desenho", () => {
    const direcoes = (fluxo: { nos: { id: string; tipo: string; refId: string }[] }) =>
      fluxo.nos.filter((n) => n.tipo === "projeto").map((n) => n.refId);
    expect(direcoes(fluxoDaExportacao(EXPORTADOR)!)).toEqual([REF_DA_DEMANDA_LER, REF_DA_DEMANDA_GRAVAR]);
    expect(direcoes(fluxosDaPublicacao(EXPORTADOR)[0])).toEqual([REF_DA_DEMANDA_LER, REF_DA_DEMANDA_GRAVAR]);
    expect(direcoes(fluxoDoEnsaio())).toEqual([REF_DA_DEMANDA_LER]);
    expect(direcoes(fluxoDaEsteira(PAPEIS)!)).toEqual([REF_DA_DEMANDA_LER, REF_DA_DEMANDA_GRAVAR]);
    // Nenhuma fábrica nasce mais com o componente antigo.
    for (const fluxo of [fluxoDaExportacao(EXPORTADOR)!, ...fluxosDaPublicacao(EXPORTADOR), fluxoDoEnsaio(), fluxoDaEsteira(PAPEIS)!]) {
      expect(direcoes(fluxo)).not.toContain(REF_DO_PROJETO);
    }
  });

  it("o rótulo curto do cartão cabe, e não repete a família", () => {
    for (const dado of DADOS_DO_SISTEMA) {
      expect(dado.rotuloCurto.length).toBeLessThanOrEqual(20);
      // Ele DIZ a direção — um rótulo que perdesse o verbo devolveria ao
      // canvas a ambiguidade que esta fatia veio matar…
      expect(dado.rotuloCurto).toMatch(/^(Ler|Gravar)$/);
      // …e NÃO repete "Demanda", que o cabeçalho do cartão já traz. A
      // validação visual mostrou os três cartões com a família por cima do
      // rótulo, e a repetição rouba a largura que o vizinho precisa.
      expect(dado.rotuloCurto).not.toMatch(/[Dd]emanda/);
      // O nome inteiro, esse sim, se basta sozinho — é o da paleta.
      expect(dado.nome).toMatch(/^Demanda — (ler|gravar)$/);
    }
  });
});
