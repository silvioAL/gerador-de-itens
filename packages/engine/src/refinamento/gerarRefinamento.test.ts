import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "../config/types.js";
import { gerarChecklistTecnico, gerarCiclosDeTeste } from "./gerarRefinamento.js";

const regras: RegrasConfig = {
  tipos: ["História", "Task", "Débito Técnico"],
  tamanhos: ["PP", "P", "M", "G"],
  porTech: {
    Backend: {
      requisitos: [
        { texto: "DLQ configurada e monitorada", tipo: "checklist", contextos: ["Backend-mensagens"] },
        { texto: "Índice criado para as queries novas", tipo: "checklist", contextos: ["Backend-dados"] },
        { texto: "Nome do serviço segue o padrão do time", tipo: "checklist", contextos: [] },
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
    },
  },
};

describe("gerarChecklistTecnico", () => {
  it("inclui requisitos sem contexto sempre, e com contexto só quando bate (casamento parcial)", () => {
    const md = gerarChecklistTecnico(regras, ["Backend"], ["Backend-mensagens rabbitmq"]);
    expect(md).toContain("DLQ configurada e monitorada");
    expect(md).toContain("Nome do serviço segue o padrão do time");
    expect(md).not.toContain("Índice criado");
  });

  it("tech sem entrada em porTech não gera bloco (nem quebra)", () => {
    const md = gerarChecklistTecnico(regras, ["Mobile"], ["qualquer"]);
    expect(md).toBe("");
  });

  it("contexto de dados só traz o requisito de dados", () => {
    const md = gerarChecklistTecnico(regras, ["Backend"], ["Backend-dados"]);
    expect(md).toContain("Índice criado");
    expect(md).not.toContain("DLQ configurada");
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
