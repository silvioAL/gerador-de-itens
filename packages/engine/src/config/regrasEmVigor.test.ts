import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "./types.js";
import { chaveDaRegra, regrasEmVigor } from "./regrasEmVigor.js";

/**
 * SPEC-86 fatia A — **as regras do time mais as do produto.**
 *
 * A demanda do usuário: *"o que tem é checklist por processo, mas uma das
 * demandas que precisamos atender também é estender para produto."*
 */

function regras(porTech: RegrasConfig["porTech"], extras: Partial<RegrasConfig> = {}): RegrasConfig {
  return { tipos: ["historia"], tamanhos: ["P", "M"], porTech, ...extras };
}

const DO_TIME = regras({
  Backend: {
    checklistTecnico: [
      { texto: "DLQ configurada", contextos: [] },
      { texto: "Idempotência no consumo", contextos: [] },
    ],
    checklistProcesso: [{ texto: "Abrir card de migração", contextos: [] }],
    testes: [{ tipo: "unitário", validacao: "cobertura mínima", contextos: [], dev: true, hlg: false }],
  },
});

describe("sem produto, nada muda (SPEC-86 fatia A)", () => {
  it("devolve O MESMO objeto do time — não uma cópia parecida", () => {
    /**
     * A garantia mais importante da fatia, e por isso ela compara identidade e
     * não conteúdo: quem não usa o eixo novo não pode pagar nada por ele, nem
     * uma reserialização. Comparar por trecho deixaria passar exatamente a
     * mudança que isto arrisca introduzir.
     */
    const semProduto = regrasEmVigor(DO_TIME);
    const comNulo = regrasEmVigor(DO_TIME, null);

    expect(semProduto.regras).toBe(DO_TIME);
    expect(comNulo.regras).toBe(DO_TIME);
    expect(semProduto.doProduto).toBe(0);
    expect(semProduto.origemDe).toEqual({});
  });
});

describe("o produto SOMA ao time, não substitui (SPEC-86 §1)", () => {
  it("um item novo do produto entra junto — os do time continuam todos lá", () => {
    /**
     * O coração da SPEC. O degrau `time → global` substitui porque responde à
     * mesma pergunta; aqui são perguntas diferentes — "como esta casa constrói"
     * e "o que é verdade sobre ESTE produto" —, e as duas valem.
     */
    const doProduto = regras({
      Backend: { checklistTecnico: [{ texto: "Acessibilidade AA conferida", contextos: [] }], testes: [] },
    });

    const { regras: vigor } = regrasEmVigor(DO_TIME, doProduto);

    expect(vigor.porTech.Backend.checklistTecnico.map((r) => r.texto)).toEqual([
      "DLQ configurada",
      "Idempotência no consumo",
      "Acessibilidade AA conferida",
    ]);
  });

  it("a ordem do time vem primeiro — quem lê o checklist aprendeu a ordem da casa", () => {
    // Embaralhar a cada produto novo custaria mais que o benefício de agrupar.
    const doProduto = regras({ Backend: { checklistTecnico: [{ texto: "SEO", contextos: [] }], testes: [] } });

    const { regras: vigor } = regrasEmVigor(DO_TIME, doProduto);

    expect(vigor.porTech.Backend.checklistTecnico[0].texto).toBe("DLQ configurada");
    expect(vigor.porTech.Backend.checklistTecnico.at(-1)!.texto).toBe("SEO");
  });

  it("uma tech que só o produto tem entra inteira", () => {
    const doProduto = regras({
      Frontend: { checklistTecnico: [{ texto: "Contraste conferido", contextos: [] }], testes: [] },
    });

    const { regras: vigor } = regrasEmVigor(DO_TIME, doProduto);

    expect(Object.keys(vigor.porTech).sort()).toEqual(["Backend", "Frontend"]);
    expect(vigor.porTech.Backend.checklistTecnico).toHaveLength(2);
  });

  it("o checklist de PROCESSO soma igual — é a demanda, dita com as palavras dela", () => {
    const doProduto = regras({
      Backend: { checklistTecnico: [], checklistProcesso: [{ texto: "Avisar o jurídico", contextos: [] }], testes: [] },
    });

    const { regras: vigor } = regrasEmVigor(DO_TIME, doProduto);

    expect(vigor.porTech.Backend.checklistProcesso!.map((i) => i.texto)).toEqual([
      "Abrir card de migração",
      "Avisar o jurídico",
    ]);
  });
});

describe("onde há conflito, o do produto vence — e a procedência diz (SPEC-86 §2)", () => {
  it("mesma frase: o item do produto substitui NO LUGAR, sem duplicar", () => {
    /**
     * A régua do §306 (*declarado vence herdado*) vale só onde há conflito, e
     * conflito aqui é dizer a mesma frase de dois lugares. Duplicar seria pedir
     * duas vezes a mesma coisa a quem refina.
     */
    const doProduto = regras({
      Backend: {
        checklistTecnico: [{ texto: "DLQ configurada", contextos: [], porque: "aqui a fila é de pagamento" }],
        testes: [],
      },
    });

    const { regras: vigor, origemDe } = regrasEmVigor(DO_TIME, doProduto);
    const tecnico = vigor.porTech.Backend.checklistTecnico;

    expect(tecnico).toHaveLength(2);
    expect(tecnico[0].porque).toBe("aqui a fila é de pagamento");
    expect(origemDe[chaveDaRegra("Backend", "checklistTecnico", "DLQ configurada")]).toBe("produto");
  });

  it("só o que é do produto entra na procedência — o resto não vira ruído", () => {
    // Marcar o que veio do time seria marcar quase tudo, e marca em tudo não
    // marca nada. Ausência na tabela significa "é do time".
    const doProduto = regras({ Backend: { checklistTecnico: [{ texto: "SEO", contextos: [] }], testes: [] } });

    const { origemDe, doProduto: quantos } = regrasEmVigor(DO_TIME, doProduto);

    expect(Object.keys(origemDe)).toEqual([chaveDaRegra("Backend", "checklistTecnico", "SEO")]);
    expect(quantos).toBe(1);
  });

  it("ciclo de teste se identifica pelo TIPO, não pela validação inteira", () => {
    /**
     * `TesteAutomatizado` não tem `texto`. Deixar um `JSON.stringify` decidir a
     * identidade faria o produto nunca sobrepor um ciclo do time — ele só
     * casaria se fosse byte a byte igual, que é quando não há o que sobrepor.
     */
    const doProduto = regras({
      Backend: {
        checklistTecnico: [],
        testes: [{ tipo: "unitário", validacao: "cobertura 90%", contextos: [], dev: true, hlg: true }],
      },
    });

    const { regras: vigor } = regrasEmVigor(DO_TIME, doProduto);

    expect(vigor.porTech.Backend.testes).toHaveLength(1);
    expect(vigor.porTech.Backend.testes[0].validacao).toBe("cobertura 90%");
  });

  it("as réguas de percurso e topologia também somam", () => {
    const doTime = regras({}, { percursos: [{ texto: "Latência do caminho", checagem: {} as never }] });
    const doProduto = regras({}, { topologia: [{ texto: "Fila sem consumidor" } as never] });

    const { regras: vigor, origemDe } = regrasEmVigor(doTime, doProduto);

    expect(vigor.percursos).toHaveLength(1);
    expect(vigor.topologia).toHaveLength(1);
    expect(origemDe[chaveDaRegra("*", "topologia", "Fila sem consumidor")]).toBe("produto");
  });
});

describe("o que o produto NÃO redefine (SPEC-86 §3)", () => {
  it("`tipos` e `tamanhos` continuam sendo o vocabulário do time", () => {
    /**
     * Um produto que os redefinisse criaria dialeto interno: o mesmo item
     * chamado de duas formas em dois lugares da mesma casa. O §306 já mediu o
     * custo de duas verdades.
     */
    const doProduto = regras({}, { tipos: ["epico-do-produto"], tamanhos: ["GG"] });

    const { regras: vigor } = regrasEmVigor(DO_TIME, doProduto);

    expect(vigor.tipos).toEqual(["historia"]);
    expect(vigor.tamanhos).toEqual(["P", "M"]);
  });
});

describe("o herdado NÃO congela (SPEC-86 fatia D)", () => {
  it("mudar a regra do time muda o que o produto vê, sem ninguém tocar no produto", () => {
    /**
     * A fatia que impede esta SPEC de criar o defeito que ela existe para
     * evitar. É o teste do §306 (`PipelineAgentesTab.test.tsx:144`) neste eixo:
     * se o produto guardasse uma CÓPIA do checklist do time, o número dele
     * pararia no tempo e ninguém notaria até a regra nova não cobrar nada.
     */
    const doProduto = regras({ Backend: { checklistTecnico: [{ texto: "SEO", contextos: [] }], testes: [] } });

    const antes = regrasEmVigor(DO_TIME, doProduto);
    expect(antes.regras.porTech.Backend.checklistTecnico).toHaveLength(3);

    const timeEvoluiu = regras({
      Backend: {
        ...DO_TIME.porTech.Backend,
        checklistTecnico: [...DO_TIME.porTech.Backend.checklistTecnico, { texto: "Trilha de auditoria", contextos: [] }],
      },
    });
    const depois = regrasEmVigor(timeEvoluiu, doProduto);

    expect(depois.regras.porTech.Backend.checklistTecnico.map((r) => r.texto)).toContain("Trilha de auditoria");
    expect(depois.regras.porTech.Backend.checklistTecnico).toHaveLength(4);
  });
});
