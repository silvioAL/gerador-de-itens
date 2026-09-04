import { describe, expect, it } from "vitest";
import { diagnosticarConfig, resumirConfig, aplicarRegrasDeConexao } from "./diagnostico.js";

/**
 * SPEC-31 Fase 3 — o diagnóstico contra o caso real do JOURNEY §108.
 *
 * O `config/regras.json` que fez o Especialista técnico parecer quebrado tinha
 * zero `checklistTecnico` e doze `testes`, porque `checklistTecnico` não existia
 * na versão que o gerou. Nada nele estava corrompido — só velho.
 */
const REGRAS_DE_OUTRA_ERA = {
  porTech: {
    java: { testes: [{ texto: "unitário" }, { texto: "integração" }], volumetria: [{ texto: "TPS" }] },
    go: { testes: [{ texto: "unitário" }] },
  },
};

const REGRAS_DESTA_VERSAO = {
  porTech: {
    java: {
      checklistTecnico: [{ texto: "timeout" }, { texto: "retry" }],
      checklistProcesso: [{ texto: "code review" }],
      testes: [{ texto: "unitário" }],
      volumetria: [{ texto: "TPS" }],
    },
    go: { checklistTecnico: [{ texto: "context" }], testes: [{ texto: "unitário" }] },
  },
};

describe("diagnóstico de config desatualizada (SPEC-31 Fase 3)", () => {
  it("resume regras contando entradas por seção, somando todas as techs", () => {
    expect(resumirConfig("regras", REGRAS_DESTA_VERSAO)).toEqual({
      techs: 2,
      checklistTecnico: 3,
      checklistProcesso: 1,
      testes: 2,
      volumetria: 1,
      // §244 — o padrão conferível é ATRIBUTO do requisito, não seção. A
      // fixture desta versão não tem nenhum, e é justamente por isso que ele
      // precisa ser contado: config cheia de checklist e vazia de checagem era
      // invisível para o diagnóstico.
      requisitosConferiveis: 0,
      // SPEC-57 fatia E — a mesma lição, contada de primeira desta vez.
      regrasDePercurso: 0,
    });
  });

  it("fatia E — acusa a config sem nenhuma régua de PERCURSO", () => {
    // A lição do §244 aplicada antes de doer: `percursos` é lista nova no topo
    // de `regras`, o documento vive no banco desde a SPEC-36, e instalação
    // existente nunca relê o arquivo. Sem esta contagem, a fatia nasceria
    // dormente em 100% das instalações — de novo.
    const comPercurso = {
      porTech: {},
      percursos: [
        { texto: "cabe no orçamento", checagem: { campo: "timeoutMs", agregacao: "soma", operador: "lte", valor: 2000 } },
      ],
    };
    const diagnostico = diagnosticarConfig("regras", { porTech: {} }, comPercurso);

    expect(diagnostico.secoesVazias).toContainEqual({ secao: "regrasDePercurso", noTemplate: 1 });
    expect(diagnostico.mensagem).toContain("régua de percurso");
    expect(diagnostico.mensagem).toContain("mede o CAMINHO");
  });

  it("acusa a seção que a config de outra era não tem — o caso do §108", () => {
    const diagnostico = diagnosticarConfig("regras", REGRAS_DE_OUTRA_ERA, REGRAS_DESTA_VERSAO);

    expect(diagnostico.possivelmenteDesatualizada).toBe(true);
    expect(diagnostico.secoesVazias).toEqual([
      { secao: "checklistTecnico", noTemplate: 3 },
      { secao: "checklistProcesso", noTemplate: 1 },
    ]);
    expect(diagnostico.mensagem).toContain("checklist técnico (3 no padrão desta versão)");
    expect(diagnostico.atual.testes).toBe(3);
  });

  it("§244 — acusa a config que tem checklist mas nenhum padrão CONFERÍVEL", () => {
    // O caso real: toda instalação anterior à fatia B. O `checklistTecnico`
    // está cheio, então o diagnóstico antigo achava tudo em ordem — e a
    // conformidade nascia dormente, sem nada apontar.
    const comChecagem = {
      porTech: {
        Backend: {
          checklistTecnico: [
            { texto: "Timeout", contextos: [], checagem: { campo: "t", operador: "lte", valor: 1 } },
          ],
          checklistProcesso: [],
          testes: [],
        },
      },
    };
    const semChecagem = {
      porTech: {
        Backend: { checklistTecnico: [{ texto: "Timeout", contextos: [] }], checklistProcesso: [], testes: [] },
      },
    };

    const diagnostico = diagnosticarConfig("regras", semChecagem, comChecagem);

    expect(diagnostico.possivelmenteDesatualizada).toBe(true);
    expect(diagnostico.secoesVazias).toContainEqual({ secao: "requisitosConferiveis", noTemplate: 1 });
    expect(diagnostico.mensagem).toContain("padrão conferível");
    // E não acusa o checklist, que está lá: o alerta é sobre o que falta, não
    // sobre a config inteira.
    expect(diagnostico.secoesVazias.some((s) => s.secao === "checklistTecnico")).toBe(false);
  });

  it("config em dia não vira alerta", () => {
    const diagnostico = diagnosticarConfig("regras", REGRAS_DESTA_VERSAO, REGRAS_DESTA_VERSAO);

    expect(diagnostico.possivelmenteDesatualizada).toBe(false);
    expect(diagnostico.mensagem).toBeNull();
  });

  /**
   * A regra que evita o alerta que ninguém lê: config menor que o template é
   * escolha de time, não defeito. Só zero-contra-não-zero acusa.
   */
  it("config ENXUTA não vira alerta — só seção inteiramente vazia acusa", () => {
    const enxuta = { porTech: { java: { checklistTecnico: [{ texto: "timeout" }], checklistProcesso: [{ texto: "cr" }], testes: [{ texto: "u" }], volumetria: [{ texto: "t" }] } } };

    const diagnostico = diagnosticarConfig("regras", enxuta, REGRAS_DESTA_VERSAO);

    expect(diagnostico.possivelmenteDesatualizada).toBe(false);
    expect(diagnostico.atual.checklistTecnico).toBeLessThan(diagnostico.template.checklistTecnico);
  });

  it("config vazia acusa todas as seções que o template preenche", () => {
    const diagnostico = diagnosticarConfig("regras", { porTech: {} }, REGRAS_DESTA_VERSAO);

    expect(diagnostico.secoesVazias.map((s) => s.secao)).toEqual([
      "techs",
      "checklistTecnico",
      "checklistProcesso",
      "testes",
      "volumetria",
    ]);
  });

  it("serve para a outra chave: esteira sem papel ativo", () => {
    const semPapeis = diagnosticarConfig("pipeline-agentes", { papeis: [] }, { papeis: [{ id: "po", ativo: true }] });
    expect(semPapeis.secoesVazias.map((s) => s.secao)).toEqual(["papeis", "papeisAtivos"]);
  });

  it("documento ausente ou torto não derruba o diagnóstico", () => {
    expect(() => diagnosticarConfig("regras", null, REGRAS_DESTA_VERSAO)).not.toThrow();
    expect(() => diagnosticarConfig("regras", { porTech: "não é objeto" }, REGRAS_DESTA_VERSAO)).not.toThrow();
    expect(diagnosticarConfig("regras", undefined, REGRAS_DESTA_VERSAO).possivelmenteDesatualizada).toBe(true);
  });
});

/**
 * §354 / SPEC-102 fatia D — a resolução do diagrama, no BACKEND.
 *
 * Estes testes nasceram no `loadConfig.test.ts` do web, porque a mescla estava
 * no cliente. Vieram para cá com a regra: quem resolve configuração é o
 * servidor, e uma segunda resolução no navegador é a segunda fonte de verdade
 * que diverge na primeira mudança (§263).
 */
describe("aplicarRegrasDeConexao (SPEC-102 fatia D)", () => {
  const doArquivo = {
    edgeRules: {
      motor: { valid: ["http", "grpc"], default: "http" },
      rabbit: { valid: ["publishes"], default: "publishes" },
    },
  };

  it("o destino sobrescrito passa a nascer com o tipo declarado", () => {
    const r = aplicarRegrasDeConexao(doArquivo, {
      regras: { motor: { default: "interno", valid: ["interno", "http"] } },
    });
    expect(r.edgeRules.motor).toEqual({ valid: ["interno", "http"], default: "interno" });
  });

  it("o que a organização NÃO tocou continua vindo do arquivo", () => {
    // É o que faz correção de default numa versão nova chegar a quem não
    // sobrescreveu — copiar o catálogo para o documento congelaria isso.
    const r = aplicarRegrasDeConexao(doArquivo, {
      regras: { motor: { default: "interno", valid: ["interno"] } },
    });
    expect(r.edgeRules.rabbit).toEqual({ valid: ["publishes"], default: "publishes" });
  });

  it("documento vazio devolve o arquivo intacto — o comportamento de antes da fatia", () => {
    expect(aplicarRegrasDeConexao(doArquivo, { regras: {} })).toEqual(doArquivo);
    expect(aplicarRegrasDeConexao(doArquivo, null)).toEqual(doArquivo);
  });

  it("default fora dos válidos cai no primeiro válido — nunca se oferece o que a validação recusa", () => {
    const r = aplicarRegrasDeConexao(doArquivo, {
      regras: { motor: { default: "publishes", valid: ["interno", "http"] } },
    });
    expect(r.edgeRules.motor.default).toBe("interno");
  });

  it("lixo no documento não derruba nem entra — regra sem forma é ignorada", () => {
    const r = aplicarRegrasDeConexao(doArquivo, { regras: { motor: "nao é objeto", outro: null } });
    expect(r.edgeRules.motor).toEqual(doArquivo.edgeRules.motor);
  });
});
