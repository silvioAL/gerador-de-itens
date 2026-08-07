import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "../config/types.js";
import { gerarChecklistTecnico, gerarCiclosDeTeste, gerarVolumetria } from "./gerarRefinamento.js";

const regras: RegrasConfig = {
  tipos: ["História", "Task", "Débito Técnico"],
  tamanhos: ["PP", "P", "M", "G"],
  porTech: {
    Backend: {
      requisitos: [
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

describe("gerarChecklistTecnico", () => {
  it("inclui requisitos sem contexto sempre, e com contexto só quando bate (casamento parcial)", () => {
    const md = gerarChecklistTecnico(regras, ["Backend"], ["Backend-mensagens rabbitmq"]);
    expect(md).toContain("DLQ configurada e monitorada");
    expect(md).toContain("Nome do serviço segue o padrão do time");
    expect(md).not.toContain("Índice criado");
  });

  it("achado real: agente de IA que valida os itens (Confluence) exige o marcador '<- ✍️ especificar' em toda linha, sem formato de checklist ([ ])", () => {
    const md = gerarChecklistTecnico(regras, ["Backend"], ["Backend-mensagens rabbitmq"]);
    expect(md).toContain("- DLQ configurada e monitorada <- ✍️ especificar");
    expect(md).toContain("- Nome do serviço segue o padrão do time <- ✍️ especificar");
    expect(md).not.toContain("- [ ]");
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
