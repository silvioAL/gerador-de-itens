import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Atividade, Diagrama } from "../model/types.js";
import { readConfigFile } from "../test-support/fixtures.js";
import { revisarQuebra } from "./checagens.js";

/**
 * ACHADO REAL do usuário, rodando o produto: *"achei estranho 'nenhuma regra
 * cobre Backend' — no especialista, sendo que estamos falando de integrações
 * http, rabbit, kafka; precisamos revisar as configurações default."*
 *
 * Ele estava certo, e o diagnóstico não era o óbvio: a tech `Backend` TEM
 * regras. O que faltava era casamento por CONTEXTO em três pontos:
 *
 * 1. `Serviço` e `Job/Scheduler` têm `contextos: []`, e NENHUM teste usava
 *    `contextos: []` — o padrão "sem contexto = aplica sempre" existia no
 *    checklist e não nos testes. Os dois tipos mais genéricos do catálogo
 *    ficavam sem ciclo de teste algum.
 * 2. `Backend-topologia-mensageria` (Exchange Rabbit) não era declarado por
 *    teste nenhum.
 * 3. `Job/Scheduler` não tinha contexto próprio, então não recebia checklist
 *    nem volumetria específicos.
 *
 * Este teste existe para que a lacuna não volte em silêncio: um tipo de nó
 * novo nasce, ninguém escreve regra para o contexto dele, e o Especialista
 * fica sem trabalho — que na tela parece agente quebrado, não configuração
 * incompleta. Ele roda o REVISOR DE VERDADE (`revisarQuebra`) sobre a config
 * real, e não uma reimplementação da regra de casamento: se o casamento mudar,
 * o teste acompanha.
 */

const config = readConfigFile<DiagramaConfig>("diagrama.example.json");
const regras = readConfigFile<RegrasConfig>("regras.example.json");
const app = readConfigFile<{ techs: string[]; contextos: string[] }>("app.example.json");

/** Um item derivado de um nó daquele tipo — o mínimo que o revisor precisa. */
function atividadeDoTipo(tipo: string, i: number): Atividade {
  const t = config.nodeTypes[tipo];
  return {
    chave: `n${i}::ep0`,
    rotulo: String(i).padStart(2, "0"),
    tipo: "História",
    tamanho: "M",
    descricao: "",
    techs: t.techs ?? [],
    contextos: t.contextos ?? [],
    dependencias: [],
    origem: { nodeId: `n${i}` },
  } as unknown as Atividade;
}

function diagramaComTodosOsTipos(): { diagrama: Diagrama; atividades: Atividade[] } {
  const tipos = Object.keys(config.nodeTypes);
  const nodes = tipos.map((tipo, i) => ({
    id: `n${i}`,
    type: tipo,
    label: config.nodeTypes[tipo].label,
    x: i * 200,
    y: 0,
    status: "novo",
    spec: {},
    specNA: {},
  }));
  return {
    diagrama: { nodes, edges: [] } as unknown as Diagrama,
    atividades: tipos.map((tipo, i) => atividadeDoTipo(tipo, i)),
  };
}

describe("config padrão — todo tipo de nó tem regra que o cubra", () => {
  it("nenhum tipo de nó do catálogo fica sem ciclo de teste aplicável", () => {
    const { diagrama, atividades } = diagramaComTodosOsTipos();
    const achados = revisarQuebra(atividades, diagrama, config, regras);

    const semTeste = achados
      .filter((a) => a.regra === "sem-ciclo-de-teste")
      .map((a) => {
        const i = Number(a.atividadeChave.match(/^n(\d+)/)![1]);
        return Object.keys(config.nodeTypes)[i];
      });

    // A mensagem do erro cita os tipos, não só o número: quem quebrar isso
    // precisa saber PARA QUAL tipo escrever regra.
    expect(semTeste, `tipos sem ciclo de teste: ${semTeste.join(", ")}`).toEqual([]);
  });

  it("todo contexto declarado no app é usado por alguma regra — contexto órfão é opção que não faz nada", () => {
    const usados = new Set<string>();
    for (const porTech of Object.values(regras.porTech)) {
      for (const lista of [porTech.checklistTecnico ?? [], porTech.testes ?? [], porTech.checklistProcesso ?? []]) {
        for (const item of lista as { contextos?: string[] }[]) {
          for (const c of item.contextos ?? []) usados.add(c);
        }
      }
      for (const c of porTech.volumetria?.contextos ?? []) usados.add(c);
    }

    // Casamento parcial é a regra do engine ("Backend-mensagens" cobre
    // "Backend-mensagens rabbitmq"), então a checagem tem que ser parcial também.
    const orfaos = app.contextos.filter((c) => ![...usados].some((u) => u.includes(c) || c.includes(u)));
    expect(orfaos, `contextos sem regra nenhuma: ${orfaos.join(", ")}`).toEqual([]);
  });

  it("todo contexto usado por um tipo de nó existe na lista do app", () => {
    // O inverso do anterior: contexto que só existe no tipo de nó não aparece
    // como opção em lugar nenhum da configuração.
    const doApp = new Set(app.contextos);
    const faltando = new Set<string>();
    for (const t of Object.values(config.nodeTypes)) {
      for (const c of t.contextos ?? []) if (!doApp.has(c)) faltando.add(c);
    }
    expect([...faltando], `contextos ausentes de app.example.json: ${[...faltando].join(", ")}`).toEqual([]);
  });
});
