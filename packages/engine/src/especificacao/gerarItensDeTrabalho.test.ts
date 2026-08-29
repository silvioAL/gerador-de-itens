import { describe, expect, it } from "vitest";
import type { Diagrama } from "../model/types.js";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import { derivar } from "../derive/derivar.js";
import { resolverDependencias } from "../dependency/dependencias.js";
import { gerarEspecificacaoEntrega } from "./gerarEspecificacaoEntrega.js";
import { gerarItensDeTrabalho } from "./gerarItensDeTrabalho.js";
import { MARCADOR_ESPECIFICAR } from "../refinamento/gerarRefinamento.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: [],
      spec: [{ key: "nome", label: "Nome do serviço", type: "text", required: true }],
    },
    mongo: {
      label: "Coleção Mongo",
      derives: "datastore",
      techs: ["Backend"],
      contextos: ["Backend-dados"],
      spec: [{ key: "collection", label: "Nome da coleção", type: "text", required: true }],
    },
  },
  edgeTypes: { writes: { label: "escreve", verbo: "escreve em", tamanhoPadrao: "P" } },
  edgeRules: { mongo: { valid: ["writes"], default: "writes" } },
};

const regras: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: {
    Backend: {
      checklistTecnico: [{ texto: "Logs relevantes emitidos", contextos: ["Backend-dados"] }],
      testes: [],
    },
  },
};

function diagramaBase(): Diagrama {
  return {
    nodes: [
      { id: "n1", type: "service", status: "novo", label: "srv-catalogo", x: 0, y: 0, spec: { nome: { valor: "srv-catalogo", origem: "manual" } }, specNA: {} },
      { id: "n2", type: "mongo", status: "novo", label: "produtos", x: 0, y: 0, spec: { collection: { valor: "produtos", origem: "manual" } }, specNA: {} },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2", type: "writes" }],
  };
}

describe("gerarItensDeTrabalho (SPEC-41 Parte B)", () => {
  it("um item por atividade, com o MESMO corpo que a especificação de entrega usa", () => {
    const diagrama = diagramaBase();
    const atividades = resolverDependencias(derivar(diagrama, config, {})).atividades;

    const itens = gerarItensDeTrabalho(atividades, diagrama, config, { regras });
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { regras });

    expect(itens).toHaveLength(atividades.length);
    for (const item of itens) {
      // Fonte única: cada corpo é literalmente uma seção do documento.
      expect(doc).toContain(item.corpoMarkdown);
      expect(item.titulo).not.toBe("");
    }
    expect(itens.map((i) => i.chave)).toEqual(atividades.map((a) => a.chave));
  });

  it("pendencias conta os '✍️ especificar' do corpo; responder um campo derruba a contagem", () => {
    const diagrama = diagramaBase();
    const atividades = resolverDependencias(derivar(diagrama, config, {})).atividades;
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const sem = gerarItensDeTrabalho(atividades, diagrama, config, { regras });
    const com = gerarItensDeTrabalho(atividades, diagrama, config, {
      regras,
      respostasItens: {
        [chaveMongo]: {
          "Backend::Logs relevantes emitidos": { valor: "sim, via Winston", origem: "manual" },
        },
      },
    });

    const antes = sem.find((i) => i.chave === chaveMongo)!;
    const depois = com.find((i) => i.chave === chaveMongo)!;
    expect(antes.pendencias).toBeGreaterThan(0);
    expect(depois.pendencias).toBe(antes.pendencias - 1);
    expect(depois.sugestoes).toBe(0);
  });

  it("sugestoes conta as marcas de sugerido — resposta da esteira não confirmada", () => {
    const diagrama = diagramaBase();
    const atividades = resolverDependencias(derivar(diagrama, config, {})).atividades;
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const itens = gerarItensDeTrabalho(atividades, diagrama, config, {
      regras,
      respostasItens: {
        [chaveMongo]: {
          "Backend::Logs relevantes emitidos": { valor: "sim, via Winston", origem: "sugerido", confirmado: false },
        },
      },
    });

    expect(itens.find((i) => i.chave === chaveMongo)!.sugestoes).toBe(1);
  });

  it("dependências saem legíveis, com a chave alvo quando existe", () => {
    const diagrama = diagramaBase();
    const atividades = resolverDependencias(derivar(diagrama, config, {})).atividades;

    const itens = gerarItensDeTrabalho(atividades, diagrama, config, {});
    const comDep = itens.filter((i) => i.dependencias.length > 0);
    expect(comDep.length).toBeGreaterThan(0);
    for (const dep of comDep.flatMap((i) => i.dependencias)) {
      expect(dep).toMatch(/^\w+( → .+)?$/);
    }
  });
});

/**
 * SPEC-73 fatia C — o Gherkin genérico entra na CONTA.
 *
 * Ele era o único dos quatro casos medidos que chegava ao card do tracker: a
 * exportação só manda itens com `pendencias === 0`, e ele não contava como
 * pendência nenhuma. Um cenário de teste que diz `Dado <contexto>` viajando
 * como se fosse escrito pelo time é o §248 na ponta mais cara.
 */
describe("o Gherkin genérico conta como pendência (SPEC-73 fatia C)", () => {
  it("tipo sem cenário configurado: a contagem SOBE por causa do esqueleto", () => {
    const diagrama = diagramaBase();
    const semCenario = gerarItensDeTrabalho(derivar(diagrama, config, {}), diagrama, config, {});

    // O item do serviço não tem `cenarioGherkinPadrao` no config deste teste,
    // então cai no esqueleto — e ele agora carrega o marcador.
    const doServico = semCenario.find((i) => i.chave.startsWith("n1"))!;
    expect(doServico.corpoMarkdown).toContain("Dado <contexto>");
    // O marcador colado à linha do esqueleto, e não em qualquer lugar do corpo:
    // afirmar só `toContain(MARCADOR)` passaria com o marcador de outro campo.
    expect(doServico.corpoMarkdown).toContain(`_(preencher com os cenários reais deste item)_ ${MARCADOR_ESPECIFICAR}`);
    // E FORA do bloco ```gherkin — dentro dele, quem colar o trecho numa
    // ferramenta de BDD recebe um arquivo que não parseia.
    const blocos = doServico.corpoMarkdown.match(/```gherkin[\s\S]*?```/g) ?? [];
    expect(blocos.some((b) => b.includes(MARCADOR_ESPECIFICAR))).toBe(false);
    expect(doServico.pendencias).toBeGreaterThan(0);
  });
});
