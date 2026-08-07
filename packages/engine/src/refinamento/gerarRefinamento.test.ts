import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "../config/types.js";
import type { Aresta, No } from "../model/types.js";
import {
  gerarChecklistProcesso,
  gerarChecklistTecnico,
  gerarCiclosDeTeste,
  gerarVolumetria,
} from "./gerarRefinamento.js";

const regras: RegrasConfig = {
  tipos: ["História", "Task", "Débito Técnico"],
  tamanhos: ["PP", "P", "M", "G"],
  porTech: {
    Backend: {
      checklistTecnico: [
        { texto: "DLQ configurada e monitorada", contextos: ["Backend-mensagens"] },
        { texto: "Índice criado para as queries novas", contextos: ["Backend-dados"] },
        { texto: "Nome do serviço segue o padrão do time", contextos: [] },
      ],
      testes: [
        {
          tipo: "Teste de contrato",
          validacao: "Payload publicado bate com o schema acordado",
          contextos: ["Backend-mensagens"],
          dev: true,
          hlg: true,
        },
        {
          tipo: "Teste de carga",
          validacao: "Fila absorve pico de 2x o volume médio",
          contextos: ["Backend-mensagens rabbitmq"],
          dev: false,
          hlg: true,
        },
      ],
      volumetria: { contextos: ["Backend-chamadas http"] },
    },
  },
};

function noTecnico(parcial: Partial<No> = {}): No {
  return {
    id: "n1", type: "mongo", x: 0, y: 0, label: "db", status: "novo",
    spec: {}, specNA: {}, ...parcial,
  };
}
const semArestasTecnico: Aresta[] = [];

describe("gerarChecklistTecnico", () => {
  it("inclui requisitos sem contexto sempre, e com contexto só quando bate (casamento parcial)", () => {
    const md = gerarChecklistTecnico(regras, ["Backend"], ["Backend-mensagens rabbitmq"], [noTecnico()], semArestasTecnico);
    expect(md).toContain("DLQ configurada e monitorada");
    expect(md).toContain("Nome do serviço segue o padrão do time");
    expect(md).not.toContain("Índice criado");
  });

  it("achado real: agente de IA que valida os itens (Confluence) exige o marcador '<- ✍️ especificar' em toda linha, sem formato de checklist ([ ])", () => {
    const md = gerarChecklistTecnico(regras, ["Backend"], ["Backend-mensagens rabbitmq"], [noTecnico()], semArestasTecnico);
    expect(md).toContain("- DLQ configurada e monitorada <- ✍️ especificar");
    expect(md).toContain("- Nome do serviço segue o padrão do time <- ✍️ especificar");
    expect(md).not.toContain("- [ ]");
  });

  it("tech sem entrada em porTech não gera bloco (nem quebra)", () => {
    const md = gerarChecklistTecnico(regras, ["Mobile"], ["qualquer"], [noTecnico()], semArestasTecnico);
    expect(md).toBe("");
  });

  it("contexto de dados só traz o requisito de dados", () => {
    const md = gerarChecklistTecnico(regras, ["Backend"], ["Backend-dados"], [noTecnico()], semArestasTecnico);
    expect(md).toContain("Índice criado");
    expect(md).not.toContain("DLQ configurada");
  });

  it("achado real: item de migração só faz sentido pra recurso que já existe — não aparece pra um mongo novo", () => {
    const regrasComMigracao: RegrasConfig = {
      tipos: [], tamanhos: [],
      porTech: {
        Backend: {
          checklistTecnico: [
            { texto: "Verificar índice para as queries novas", contextos: ["Backend-dados"] },
            { texto: "Definir plano de migração e rollback do schema", contextos: ["Backend-dados"], when: { nodeStatus: "existente" } },
          ],
          testes: [],
        },
      },
    };
    const mdNovo = gerarChecklistTecnico(regrasComMigracao, ["Backend"], ["Backend-dados"], [noTecnico({ status: "novo" })], semArestasTecnico);
    expect(mdNovo).toContain("Verificar índice");
    expect(mdNovo).not.toContain("plano de migração");

    const mdExistente = gerarChecklistTecnico(regrasComMigracao, ["Backend"], ["Backend-dados"], [noTecnico({ status: "existente" })], semArestasTecnico);
    expect(mdExistente).toContain("Verificar índice");
    expect(mdExistente).toContain("plano de migração");
  });

  it("sem nó de origem, item condicionado por status não aparece — mesma disciplina do checklist de processo", () => {
    const regrasComMigracao: RegrasConfig = {
      tipos: [], tamanhos: [],
      porTech: {
        Backend: {
          checklistTecnico: [
            { texto: "Definir plano de migração", contextos: [], when: { nodeStatus: "existente" } },
          ],
          testes: [],
        },
      },
    };
    const md = gerarChecklistTecnico(regrasComMigracao, ["Backend"], [], [], semArestasTecnico);
    expect(md).toBe("");
  });
});

describe("gerarCiclosDeTeste", () => {
  it("separa testes DEV e HLG, respeitando o casamento de contexto", () => {
    const md = gerarCiclosDeTeste(regras, ["Backend"], ["Backend-mensagens rabbitmq"]);
    expect(md).toContain("_DEV:_");
    expect(md).toContain("Teste de contrato");
    expect(md).toContain("_HLG:_");
    expect(md).toContain("Teste de carga");
  });

  it("contexto kafka não ativa o teste de carga específico do rabbitmq", () => {
    const md = gerarCiclosDeTeste(regras, ["Backend"], ["Backend-mensagens kafka"]);
    expect(md).toContain("Teste de contrato");
    expect(md).not.toContain("Teste de carga");
  });
});

describe("gerarVolumetria", () => {
  it("contexto que ativa volumetria gera o bloco fixo, sempre em branco, com o marcador", () => {
    const md = gerarVolumetria(regras, ["Backend"], ["Backend-chamadas http"]);
    expect(md).toBe(
      [
        "- Response time: ___ <- ✍️ especificar",
        "- Max error: ___ <- ✍️ especificar",
        "- RPS (Requisições por segundo): ___ <- ✍️ especificar",
        "- Test duration: ___ <- ✍️ especificar",
      ].join("\n")
    );
  });

  it("contexto que não bate não gera bloco nenhum", () => {
    expect(gerarVolumetria(regras, ["Backend"], ["Backend-mensagens rabbitmq"])).toBe("");
  });

  it("tech sem volumetria configurada nunca gera bloco", () => {
    expect(gerarVolumetria(regras, ["Mobile"], ["Backend-chamadas http"])).toBe("");
  });
});

describe("gerarChecklistProcesso", () => {
  function no(parcial: Partial<No> = {}): No {
    return {
      id: "n1", type: "service", x: 0, y: 0, label: "srv", status: "novo",
      spec: {}, specNA: {}, ...parcial,
    };
  }
  const semArestas: Aresta[] = [];

  const regrasProcesso: RegrasConfig = {
    tipos: [], tamanhos: [],
    porTech: {
      Backend: {
        checklistTecnico: [],
        checklistProcesso: [
          { texto: "Levantar massa de HLG", contextos: [] },
          { texto: "Configurar mock", contextos: ["Backend-chamadas http"] },
          { texto: "Publicar contrato do endpoint novo", contextos: [],
            when: { allOf: [
              { nodeType: ["service"] },
              { listaContem: { field: "endpoints", sub: "action", equals: "novo" } } ] } },
          { texto: "Confirmar ambiente de teste do provedor", contextos: [], when: { nodeType: ["external"] } },
        ],
        testes: [],
      },
    },
  };

  it("usa '- [ ]', não o marcador do técnico — é coisa pra marcar como feita, não pra especificar", () => {
    const md = gerarChecklistProcesso(regrasProcesso, ["Backend"], [], [no()], semArestas);
    expect(md).toContain("- [ ] Levantar massa de HLG");
    expect(md).not.toContain("✍️");
  });

  it("item sem when aparece sempre que tech+contexto baterem", () => {
    const md = gerarChecklistProcesso(regrasProcesso, ["Backend"], ["Backend-chamadas http"], [no()], semArestas);
    expect(md).toContain("Configurar mock");
  });

  it("nodeType: item de external não aparece num nó service, e vice-versa", () => {
    const emService = gerarChecklistProcesso(regrasProcesso, ["Backend"], [], [no()], semArestas);
    expect(emService).not.toContain("ambiente de teste do provedor");

    const emExternal = gerarChecklistProcesso(regrasProcesso, ["Backend"], [], [no({ type: "external" })], semArestas);
    expect(emExternal).toContain("ambiente de teste do provedor");
  });

  it("listaContem: só aparece quando algum item da lista tem o sub-campo com o valor pedido", () => {
    const semEndpointNovo = no({
      spec: { endpoints: { valor: [{ method: "GET", path: "/x", action: "alterar" }], origem: "manual" } },
    });
    expect(gerarChecklistProcesso(regrasProcesso, ["Backend"], [], [semEndpointNovo], semArestas))
      .not.toContain("Publicar contrato");

    const comEndpointNovo = no({
      spec: { endpoints: { valor: [
        { method: "GET", path: "/x", action: "alterar" },
        { method: "POST", path: "/y", action: "novo" },
      ], origem: "manual" } },
    });
    expect(gerarChecklistProcesso(regrasProcesso, ["Backend"], [], [comEndpointNovo], semArestas))
      .toContain("Publicar contrato");
  });

  it("atividade de aresta: basta UM dos nós de origem satisfazer (source ou target)", () => {
    const nos = [no({ id: "n1", type: "service" }), no({ id: "n2", type: "external" })];
    const md = gerarChecklistProcesso(regrasProcesso, ["Backend"], [], nos, semArestas);
    expect(md).toContain("ambiente de teste do provedor");
  });

  it("sem nó de origem, item condicionado não aparece — condição que não dá pra avaliar não é assumida verdadeira", () => {
    const md = gerarChecklistProcesso(regrasProcesso, ["Backend"], [], [], semArestas);
    expect(md).toContain("Levantar massa de HLG");
    expect(md).not.toContain("ambiente de teste do provedor");
  });

  it("tech sem checklistProcesso não gera bloco (nem quebra)", () => {
    expect(gerarChecklistProcesso(regras, ["Backend"], [], [no()], semArestas)).toBe("");
  });
});
