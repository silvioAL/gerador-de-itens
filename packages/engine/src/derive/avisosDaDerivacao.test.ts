import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Diagrama, No, ValorSpec } from "../model/types.js";
import { avisosDaDerivacao } from "./avisosDaDerivacao.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: ["Backend-chamadas http"],
      spec: [{ key: "timeoutMs", label: "Timeout", type: "number" }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

function no(id: string, timeoutMs?: number): No {
  const spec: Record<string, ValorSpec> = {};
  if (timeoutMs !== undefined) spec.timeoutMs = { valor: timeoutMs, origem: "manual" };
  return { id, type: "service", x: 0, y: 0, label: id, status: "novo", spec, specNA: {} };
}
const diagrama: Diagrama = { nodes: [no("n1", 900), no("n2", 900)], edges: [] };

const REGRAS: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: {
    Backend: {
      checklistTecnico: [
        {
          texto: "timeout curto",
          contextos: ["Backend-chamadas http"],
          checagem: { campo: "timeoutMs", operador: "lte", valor: 500 },
        },
      ],
      testes: [],
    },
  },
  percursos: [
    { texto: "orçamento", checagem: { campo: "timeoutMs", agregacao: "soma", operador: "lte", valor: 1000, unidade: "ms" } },
  ],
};

const DECISAO = {
  id: "d1",
  noId: "n1",
  titulo: "Fila em vez de síncrono",
  alternativas: [{ titulo: "A" }, { titulo: "B" }],
  escolhida: "A",
  porque: "desacopla",
  status: "aceita" as const,
  origem: "manual" as const,
  autor: "ana",
  em: "2026-08-16T10:00:00.000Z",
};

describe("avisosDaDerivacao — o que se está ignorando ao derivar (§261)", () => {
  it("desenho limpo não produz aviso nenhum — o silêncio aqui é merecido", () => {
    expect(avisosDaDerivacao({ nodes: [no("n1")], edges: [] }, config)).toEqual([]);
  });

  it("necessidade órfã aparece; componente sem necessidade NÃO", () => {
    // Elemento sem propósito é informativo por decisão do §230 (infraestrutura
    // legítima existe). Cobrá-lo aqui pintaria todo desenho de amarelo.
    const avisos = avisosDaDerivacao(diagrama, config, {
      necessidades: [
        { id: "r1", texto: "sem dono", origem: "manual", atendidaPor: [] },
        { id: "r2", texto: "com dono", origem: "manual", atendidaPor: ["n1"] },
      ],
    });

    expect(avisos.filter((a) => a.dimensao === "proposito")).toHaveLength(1);
    expect(avisos[0].texto).toContain("1 necessidade(s)");
  });

  it("violação de padrão NÃO vira aviso — ela vira ITEM, e o clique a resolve", () => {
    // A régua que evita o diálogo virar ruído: avisar sobre o que a derivação
    // está prestes a tratar (§240) ensina a fechá-lo sem ler.
    const avisos = avisosDaDerivacao(diagrama, config, { regras: REGRAS });

    expect(avisos).toEqual([]);
  });

  it("caminho fora da régua também NÃO vira aviso — vira item (§249)", () => {
    const confirmado = {
      id: "pc::n1>n2",
      rotulo: "n1 → n2",
      nos: ["n1", "n2"],
      origem: "inferido" as const,
      confirmado: true,
    };

    const avisos = avisosDaDerivacao(diagrama, config, { regras: REGRAS, percursos: [confirmado] });

    expect(avisos.filter((a) => a.dimensao === "caminho")).toEqual([]);
  });

  it("caminho que NÃO DÁ PARA MEDIR vira aviso — esse não vira item nenhum", () => {
    // §249 decidiu que "falta campo" não gera item, porque já é vermelho de
    // completude no nó. Sem este aviso ele some do fluxo de derivação inteiro.
    const confirmado = {
      id: "pc::n1>n2",
      rotulo: "n1 → n2",
      nos: ["n1", "n2"],
      origem: "inferido" as const,
      confirmado: true,
    };

    const avisos = avisosDaDerivacao({ nodes: [no("n1", 900), no("n2")], edges: [] }, config, {
      regras: REGRAS,
      percursos: [confirmado],
    });

    expect(avisos.filter((a) => a.dimensao === "caminho")[0].texto).toContain("não dá para medir");
  });

  it("caminho NÃO confirmado não vira aviso — ninguém olhou aquele caminho ainda", () => {
    const avisos = avisosDaDerivacao(diagrama, config, {
      regras: REGRAS,
      percursos: [{ id: "pc::n1>n2", rotulo: "n1 → n2", nos: ["n1", "n2"], origem: "inferido", confirmado: false }],
    });

    expect(avisos.some((a) => a.dimensao === "caminho")).toBe(false);
  });

  it("proposta pendente e decisão sem porquê são avisos, e são distintos", () => {
    const avisos = avisosDaDerivacao(diagrama, config, {
      decisoes: [
        { ...DECISAO, id: "d1", status: "proposta", origem: "sugerido" },
        { ...DECISAO, id: "d2", porque: "" },
      ],
    });

    const texto = avisos.filter((a) => a.dimensao === "decisao").map((a) => a.texto);
    expect(texto).toEqual(["1 decisão(ões) proposta(s) esperando alguém", "1 decisão(ões) registrada(s) sem o porquê"]);
  });

  it("cada dimensão só fala quando é USADA — a régua nova não acusa quem nunca a usou", () => {
    // Mesma disciplina do placar (§230, §239): sem necessidade declarada, sem
    // regra, sem percurso e sem decisão, derivar é o que sempre foi.
    expect(avisosDaDerivacao(diagrama, config, {})).toEqual([]);
  });
});
