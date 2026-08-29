import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig, Token } from "../config/types.js";
import type { Diagrama } from "../model/types.js";
import { avaliarConformidade } from "./conformidade.js";
import { derivar } from "../derive/derivar.js";

/**
 * SPEC-79 fatia C — **a fatia que torna o ponto verde.**
 *
 * A SPEC diz, no §2, qual é o critério: *um desenho que contraria o design
 * system do time tem que produzir violação, do mesmo jeito que um desenho que
 * contraria um padrão de arquitetura produz hoje. Se não deriva item, não está
 * verde.*
 *
 * As fatias A e B são formulário sem esta: tokens guardados que ninguém confere
 * e um tipo de nó que ninguém mede. É aqui que o design system deixa de ser
 * documentação e vira régua — e é aqui que ele se sujeita à mesma exigência que
 * o produto faz a toda medida sua: **ter uma regra explícita atrás, que a pessoa
 * possa contestar.**
 */

const TOKENS: Token[] = [
  { nome: "cor.texto.padrao", valor: "#0f172a", valorEscuro: "#e5e7eb", grupo: "cor" },
  { nome: "cor.fundo.painel", valor: "#ffffff", valorEscuro: "#0f172a", grupo: "cor" },
  { nome: "espaco.2", valor: "8px", grupo: "espaco" },
];

const config: DiagramaConfig = {
  nodeTypes: {
    tela: {
      label: "Tela",
      derives: "service",
      techs: ["Frontend"],
      contextos: [],
      spec: [
        { key: "corDoTexto", label: "Cor do texto", type: "text", required: true },
        { key: "corDeFundo", label: "Cor de fundo", type: "text", required: true },
        { key: "espacamento", label: "Espaçamento", type: "text", required: false },
      ],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

const regras: RegrasConfig = {
  porTech: {
    Frontend: {
      checklistTecnico: [
        {
          texto: "Texto legível sobre o fundo",
          contextos: [],
          porque: "abaixo de 4.5 a leitura falha para parte das pessoas, e não é opinião",
          checagem: { campo: "corDoTexto", operador: "contraste-gte", valorDe: "corDeFundo", valor: 4.5 },
        },
        {
          texto: "Espaçamento sai do sistema, não do olho",
          contextos: [],
          checagem: { campo: "espacamento", operador: "pertence-aos-tokens" },
        },
      ],
      testes: [],
    },
  },
} as unknown as RegrasConfig;

function tela(spec: Record<string, string>): Diagrama {
  return {
    nodes: [
      {
        id: "t1",
        type: "tela",
        status: "novo",
        label: "Vitrine",
        x: 0,
        y: 0,
        spec: Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, { valor: v, origem: "manual" }])),
        specNA: {},
      },
    ],
    edges: [],
  } as unknown as Diagrama;
}

describe("o design system vira violação, como qualquer outro padrão (SPEC-79 fatia C)", () => {
  it("contraste abaixo da régua é VIOLAÇÃO, e a frase diz o número", () => {
    // Cinza claro sobre branco: o caso clássico que passa no olho de quem
    // desenhou no monitor bom e falha para quem lê no celular no sol.
    const violacoes = avaliarConformidade(
      tela({ corDoTexto: "#9ca3af", corDeFundo: "#ffffff", espacamento: "espaco.2" }),
      config,
      regras,
      [],
      TOKENS
    );

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].campo).toBe("corDoTexto");
    expect(violacoes[0].esperado).toBe("contraste ≥ 4.5");
    // O número medido, e não só "falhou": sem ele ninguém sabe o quanto mudar.
    expect(Number(violacoes[0].atual)).toBeLessThan(4.5);
    expect(violacoes[0].porque).toContain("não é opinião");
  });

  it("e contraste acima da régua passa em silêncio", () => {
    const violacoes = avaliarConformidade(
      tela({ corDoTexto: "#0f172a", corDeFundo: "#ffffff", espacamento: "espaco.2" }),
      config,
      regras,
      [],
      TOKENS
    );

    expect(violacoes).toEqual([]);
  });

  it("valor fora dos tokens é VIOLAÇÃO — é o que torna 'use o sistema' cobrável", () => {
    const violacoes = avaliarConformidade(
      tela({ corDoTexto: "#0f172a", corDeFundo: "#ffffff", espacamento: "7px" }),
      config,
      regras,
      [],
      TOKENS
    );

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].campo).toBe("espacamento");
    expect(violacoes[0].esperado).toBe("um token declarado");
    expect(violacoes[0].atual).toBe("7px");
  });

  it("time SEM tokens configurados não é acusado — a régua se cala", () => {
    /**
     * O caso que decide se a régua é adotada ou desligada no primeiro dia.
     * Cobrar pertencimento a uma lista que ninguém declarou acusaria todo
     * desenho de todo time que ainda não configurou design system — e a
     * primeira reação a uma ferramenta que reclama de tudo é silenciá-la.
     */
    const violacoes = avaliarConformidade(
      tela({ corDoTexto: "#0f172a", corDeFundo: "#ffffff", espacamento: "7px" }),
      config,
      regras,
      [],
      []
    );

    expect(violacoes).toEqual([]);
  });

  it("cor que o motor não sabe ler faz a checagem se calar, não acusar", () => {
    /**
     * `var(--painel)` é cor perfeitamente válida cujo VALOR o motor não tem.
     * Acusar aqui seria reclamar de desenho certo — e o §239 já estabeleceu a
     * disciplina: campo que não dá para interpretar faz a checagem se calar.
     */
    const violacoes = avaliarConformidade(
      tela({ corDoTexto: "var(--texto)", corDeFundo: "var(--painel)", espacamento: "espaco.2" }),
      config,
      regras,
      [],
      TOKENS
    );

    expect(violacoes).toEqual([]);
  });

  it("campo vazio também se cala — 'ainda não preenchi' não é 'está errado'", () => {
    const violacoes = avaliarConformidade(
      tela({ corDoTexto: "", corDeFundo: "#ffffff", espacamento: "espaco.2" }),
      config,
      regras,
      [],
      TOKENS
    );

    expect(violacoes).toEqual([]);
  });

  it("e a violação de design system é CONTESTÁVEL, como toda outra", () => {
    /**
     * O §242: contrariar o padrão de propósito é decisão, e a exceção registrada
     * some do vermelho sem sumir do histórico. Se a régua visual não aceitasse
     * exceção, ela seria a única medida do produto que não se pode contestar —
     * e o `CONCEITO.md` diz, em voz alta, que medida incontestável vira ruído ou
     * dogma.
     */
    const violacoes = avaliarConformidade(
      tela({ corDoTexto: "#9ca3af", corDeFundo: "#ffffff", espacamento: "espaco.2" }),
      config,
      regras,
      [{ noId: "t1", campo: "corDoTexto", motivo: "texto decorativo, não é conteúdo", autor: "ana", em: "2026-08-29T10:00:00.000Z" }] as never,
      TOKENS
    );

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].excecao).toBeDefined();
  });
});

describe("e a violação de design system CHEGA ao backlog (SPEC-79 fatia D)", () => {
  it("um desenho que contraria o design system deriva item de trabalho", () => {
    /**
     * **O critério que a SPEC-79 §2 declara para o ponto ficar verde**, e a
     * razão de este teste existir separado dos outros: até esta rodada,
     * `derivarConformidade` chamava `avaliarConformidade` SEM tokens. As
     * violações apareceriam na tela de prontidão e não virariam item nenhum —
     * régua que acusa e não gera trabalho é régua que o time aprende a ignorar.
     *
     * *"Se não deriva item, não está verde."*
     */
    const atividades = derivar(tela({ corDoTexto: "#9ca3af", corDeFundo: "#ffffff", espacamento: "espaco.2" }), config, {
      regras,
      tokens: TOKENS,
    });

    const doPadrao = atividades.filter((a) => a.chave.includes("::padrao::"));
    expect(doPadrao).toHaveLength(1);
    expect(doPadrao[0].chave).toBe("t1::padrao::corDoTexto");
  });

  it("sem tokens, o PERTENCIMENTO se cala — mas o CONTRASTE não, e é certo que não", () => {
    /**
     * A distinção que a primeira escrita deste teste errou, e que vale escrever:
     * as duas checagens do design system dependem de coisas diferentes.
     *
     * **Pertencimento precisa da lista** — cobrar "use um token declarado" de
     * quem não declarou nenhum acusaria todo mundo. Cala.
     *
     * **Contraste não precisa de nada além das duas cores.** Ele é
     * auto-contido: o time escreveu a regra, o desenho tem as cores, a conta
     * fecha. Calar aqui seria condicionar uma medida que já é possível a uma
     * configuração que não tem nada a ver com ela.
     */
    const atividades = derivar(tela({ corDoTexto: "#9ca3af", corDeFundo: "#ffffff", espacamento: "7px" }), config, {
      regras,
    });

    const doPadrao = atividades.filter((a) => a.chave.includes("::padrao::"));
    expect(doPadrao.map((a) => a.chave)).toEqual(["t1::padrao::corDoTexto"]);
  });

  it("e sem REGRA declarada não deriva nada — a régua é do time, não nossa", () => {
    // O controle negativo de verdade: quem não escreveu a regra não é medido
    // por ela. É a mesma disciplina do §239 e do §240.
    const atividades = derivar(tela({ corDoTexto: "#9ca3af", corDeFundo: "#ffffff", espacamento: "7px" }), config, {
      tokens: TOKENS,
    });

    expect(atividades.filter((a) => a.chave.includes("::padrao::"))).toEqual([]);
  });
});
