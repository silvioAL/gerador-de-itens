import { describe, expect, it } from "vitest";
import { comoDecisao, lacunasDaDecisaoImportada, statusDe } from "./leitorDeAdr.js";

const AGORA = "2026-08-29T10:00:00.000Z";

describe("o ADR importado nunca vira decisão local (SPEC-81 fatia C)", () => {
  it("chega marcado como extraído, e dizendo DE ONDE", () => {
    /**
     * A recusa central da SPEC-81 §5. Se a casa tem repositório de ADR, ele é a
     * fonte — um produto que absorve a decisão alheia e a reapresenta como sua
     * corrompe o registro dos dois lados.
     */
    const decisao = comoDecisao({ id: "ADR-014", titulo: "Fila em vez de chamada síncrona", link: "https://adr/14" }, AGORA);

    expect(decisao.origem).toBe("extraido");
    expect(decisao.importadoDe).toBe("https://adr/14");
  });

  it("sem link, o identificador da casa serve de endereço", () => {
    // Repositório de ADR em markdown num git não tem URL por decisão. O id é o
    // que existe, e é melhor que nada: some `importadoDe` significaria "decisão
    // local", que é o que esta fatia existe para impedir.
    expect(comoDecisao({ id: "ADR-014", titulo: "x" }, AGORA).importadoDe).toBe("ADR-014");
  });

  it("o autor é quem DECIDIU, não quem importou", () => {
    // Pôr aqui o nome de quem clicou "importar" atribuiria a decisão à pessoa
    // errada, para sempre.
    expect(comoDecisao({ id: "a", titulo: "x", autor: "ana" }, AGORA).autor).toBe("ana");
    expect(comoDecisao({ id: "a", titulo: "x" }, AGORA).autor).toBe("importado");
  });

  it("nada é INVENTADO — o que a casa não registrou fica vazio", () => {
    /**
     * É a SPEC-80 §2 aplicada a dado alheio: preencher com texto plausível
     * produziria uma decisão com aparência de fundamentada e conteúdo nenhum.
     */
    const decisao = comoDecisao({ id: "ADR-1", titulo: "só o título" }, AGORA);

    expect(decisao.contexto).toBeUndefined();
    expect(decisao.alternativas).toEqual([]);
    expect(decisao.escolhida).toBe("");
    expect(decisao.porque).toBe("");
  });

  it("e o que ficou vazio é LACUNA CONTÁVEL", () => {
    const decisao = comoDecisao({ id: "ADR-1", titulo: "só o título" }, AGORA);

    expect(lacunasDaDecisaoImportada(decisao)).toEqual(["contexto", "alternativas", "escolhida", "porque"]);
  });

  it("ADR completo não tem lacuna nenhuma", () => {
    const decisao = comoDecisao(
      {
        id: "ADR-14",
        titulo: "Fila em vez de chamada síncrona",
        contexto: "O bureau responde em segundos no pico.",
        alternativas: [{ titulo: "Chamada síncrona", consequencia: "o cliente espera o bureau" }],
        escolhida: "Fila",
        porque: "desacopla o tempo do parceiro do tempo do cliente",
      },
      AGORA
    );

    expect(lacunasDaDecisaoImportada(decisao)).toEqual([]);
  });

  it("o status NUNCA sobe de força: o que não se reconhece vira `proposta`", () => {
    /**
     * Presumir "aceita" daria peso a uma decisão que ninguém aqui conferiu — e
     * força indevida é exatamente o defeito que a SPEC-80 §2 nomeia. `proposta`
     * é o mais fraco dos três, e é o certo para o desconhecido.
     */
    expect(statusDe("accepted")).toBe("aceita");
    expect(statusDe("Aceita")).toBe("aceita");
    expect(statusDe("superseded")).toBe("substituida");
    expect(statusDe("em revisão pelo comitê")).toBe("proposta");
    expect(statusDe(undefined)).toBe("proposta");
  });

  it("ADR substituído chega substituído — não volta a valer aqui", () => {
    // A segunda prova da fatia: uma decisão que a casa aposentou não pode
    // ressuscitar do lado de cá com força de vigente.
    const decisao = comoDecisao({ id: "ADR-7", titulo: "x", status: "superseded", substituidaPor: "ADR-14" }, AGORA);

    expect(decisao.status).toBe("substituida");
    expect(decisao.substituidaPor).toBe("ADR-14");
  });

  it("não nasce ancorado em elemento nenhum", () => {
    // O vínculo com o desenho nasce quando o ADR VIRA desenho (fatia D). Um ADR
    // importado antes de existir desenho não tem a que se ancorar, e inventar
    // uma âncora seria pior que não ter.
    const decisao = comoDecisao({ id: "a", titulo: "x" }, AGORA);

    expect(decisao.noId).toBeUndefined();
    expect(decisao.arestaId).toBeUndefined();
  });
});
