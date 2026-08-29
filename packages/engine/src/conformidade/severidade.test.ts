import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Diagrama } from "../model/types.js";
import { avaliarConformidade } from "./conformidade.js";
import { derivar } from "../derive/derivar.js";

/**
 * SPEC-79 §5 — **régua nova nasce como aviso.**
 *
 * ## O defeito que este mecanismo existe para impedir
 *
 * O §318 tentou enviar regras de design system no template de fábrica, e o E2E
 * barrou: `abas-de-configuracao` codifica que uma instalação limpa nasce sem
 * grupo de Frontend. Não era teste velho — era o único aviso de que uma régua no
 * template muda, **em silêncio**, o que uma instalação limpa é.
 *
 * Sem severidade, enviar régua tem dois desfechos e os dois são ruins: ou não se
 * envia (e ninguém descobre o recurso), ou se envia e **o backlog de toda
 * organização cresce por uma régua que ela nunca escreveu**.
 */

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: [],
      spec: [{ key: "timeoutMs", label: "Timeout", type: "number", required: false }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

function regrasCom(severidade?: "aviso" | "erro"): RegrasConfig {
  return {
    porTech: {
      Backend: {
        checklistTecnico: [
          {
            texto: "Timeout curto em chamada externa",
            contextos: [],
            ...(severidade ? { severidade } : {}),
            checagem: { campo: "timeoutMs", operador: "lte", valor: 500 },
          },
        ],
        testes: [],
      },
    },
  } as unknown as RegrasConfig;
}

const diagrama: Diagrama = {
  nodes: [
    {
      id: "n1",
      type: "service",
      status: "novo",
      label: "srv",
      x: 0,
      y: 0,
      spec: { timeoutMs: { valor: 3000, origem: "manual" } },
      specNA: {},
    },
  ],
  edges: [],
} as unknown as Diagrama;

describe("aviso e erro (SPEC-79 §5)", () => {
  it("os dois APARECEM na prontidão — aviso não é silêncio", () => {
    /**
     * A distinção é sobre gerar trabalho, não sobre esconder. Uma régua que o
     * time não escreveu ainda assim informa: *"o seu desenho contraria isto"* é
     * útil mesmo quando não vira item.
     */
    expect(avaliarConformidade(diagrama, config, regrasCom("aviso"))).toHaveLength(1);
    expect(avaliarConformidade(diagrama, config, regrasCom("erro"))).toHaveLength(1);
  });

  it("e a severidade viaja NA violação, para a tela e a derivação não divergirem", () => {
    // Reler a config em dois lugares é como as duas divergem na primeira
    // mudança (§263) — e a divergência aqui seria muda.
    expect(avaliarConformidade(diagrama, config, regrasCom("aviso"))[0].severidade).toBe("aviso");
  });

  it("mas só `erro` vira ITEM DE TRABALHO", () => {
    const comErro = derivar(diagrama, config, { regras: regrasCom("erro") });
    const comAviso = derivar(diagrama, config, { regras: regrasCom("aviso") });

    expect(comErro.filter((a) => a.chave.includes("::padrao::"))).toHaveLength(1);
    expect(comAviso.filter((a) => a.chave.includes("::padrao::"))).toHaveLength(0);
  });

  it("AUSENTE é `erro` — o comportamento de sempre, e é o default de propósito", () => {
    /**
     * A escolha de default é a decisão mais importante deste campo. `aviso` como
     * default silenciaria régua que algum time já escreveu de propósito, e
     * **ninguém perceberia**: as cobranças simplesmente sumiriam do backlog.
     *
     * Um default que enfraquece o que já existe é pior que a ausência do campo.
     */
    const semSeveridade = derivar(diagrama, config, { regras: regrasCom() });

    expect(semSeveridade.filter((a) => a.chave.includes("::padrao::"))).toHaveLength(1);
    expect(avaliarConformidade(diagrama, config, regrasCom())[0].severidade).toBeUndefined();
  });

  it("aviso continua respeitando a exceção — a válvula vale para os dois", () => {
    // §242: se a exceção só valesse para `erro`, a pessoa aprenderia que umas
    // violações se aceitam e outras se ignoram, que é o §230 ao contrário.
    const violacoes = avaliarConformidade(diagrama, config, regrasCom("aviso"), [
      { noId: "n1", campo: "timeoutMs", motivo: "o parceiro não suporta menos", autor: "ana", em: "2026-08-29T10:00:00.000Z" },
    ] as never);

    expect(violacoes[0].excecao).toBeDefined();
  });
});
