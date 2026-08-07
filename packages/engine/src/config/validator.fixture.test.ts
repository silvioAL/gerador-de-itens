import { describe, expect, it } from "vitest";
import type { AppConfig, DiagramaConfig, RegrasConfig } from "./types.js";
import { validateConfig, validateRegras } from "./validator.js";
import { readConfigFile } from "../test-support/fixtures.js";

const app = readConfigFile<AppConfig>("app.example.json");
const diagrama = readConfigFile<DiagramaConfig>("diagrama.example.json");
const regras = readConfigFile<RegrasConfig>("regras.example.json");

describe("validateConfig — config/diagrama.example.json + config/app.example.json", () => {
  it("não reporta nenhum erro para a config de exemplo", () => {
    expect(validateConfig(diagrama, app)).toEqual([]);
  });

  it("recusa tech referenciada em nodeTypes que não existe em app.json, apontando o campo", () => {
    const quebrada: DiagramaConfig = {
      ...diagrama,
      nodeTypes: {
        ...diagrama.nodeTypes,
        rabbit: { ...diagrama.nodeTypes.rabbit, techs: ["TechInexistente"] },
      },
    };
    const erros = validateConfig(quebrada, app);
    expect(erros).toEqual([
      { campo: "nodeTypes.rabbit.techs", mensagem: 'tech "TechInexistente" não existe em app.json' },
    ]);
  });

  it("recusa contexto inexistente", () => {
    const quebrada: DiagramaConfig = {
      ...diagrama,
      nodeTypes: {
        ...diagrama.nodeTypes,
        rabbit: { ...diagrama.nodeTypes.rabbit, contextos: ["contexto-fantasma"] },
      },
    };
    const erros = validateConfig(quebrada, app);
    expect(erros).toContainEqual({
      campo: "nodeTypes.rabbit.contextos",
      mensagem: 'contexto "contexto-fantasma" não existe em app.json',
    });
  });

  it("recusa default com {{campo}} que não existe no spec do mesmo tipo", () => {
    const quebrada: DiagramaConfig = {
      ...diagrama,
      nodeTypes: {
        ...diagrama.nodeTypes,
        rabbit: {
          ...diagrama.nodeTypes.rabbit,
          spec: [
            ...diagrama.nodeTypes.rabbit.spec,
            { key: "campoNovo", label: "x", type: "text", default: "{{campoFantasma}}" },
          ],
        },
      },
    };
    const erros = validateConfig(quebrada, app);
    expect(erros).toContainEqual({
      campo: "nodeTypes.rabbit.spec.campoNovo.default",
      mensagem: 'default referencia "{{campoFantasma}}", que não existe no spec de "rabbit"',
    });
  });

  it("recusa edgeRules apontando para tipo de nó inexistente", () => {
    const quebrada: DiagramaConfig = {
      ...diagrama,
      edgeRules: { ...diagrama.edgeRules, "tipo-fantasma": { valid: ["http"] } },
    };
    const erros = validateConfig(quebrada, app);
    expect(erros).toContainEqual({
      campo: "edgeRules.tipo-fantasma",
      mensagem: 'edgeRules referencia o tipo de nó "tipo-fantasma", que não existe em nodeTypes',
    });
  });

  it("recusa operador de when desconhecido", () => {
    const quebrada: DiagramaConfig = {
      ...diagrama,
      nodeTypes: {
        ...diagrama.nodeTypes,
        rabbit: {
          ...diagrama.nodeTypes.rabbit,
          spec: [
            ...diagrama.nodeTypes.rabbit.spec,
            {
              key: "campoCondicional",
              label: "x",
              type: "text",
              when: { operadorInventado: true } as never,
            },
          ],
        },
      },
    };
    const erros = validateConfig(quebrada, app);
    expect(erros.some((e) => e.mensagem.includes("operador de condição desconhecido"))).toBe(true);
  });

  it("recusa when.field referenciando uma chave que não existe no spec do tipo", () => {
    const quebrada: DiagramaConfig = {
      ...diagrama,
      nodeTypes: {
        ...diagrama.nodeTypes,
        rabbit: {
          ...diagrama.nodeTypes.rabbit,
          spec: [
            ...diagrama.nodeTypes.rabbit.spec,
            { key: "campoCondicional", label: "x", type: "text", when: { field: "campoFantasma", equals: true } },
          ],
        },
      },
    };
    const erros = validateConfig(quebrada, app);
    expect(erros).toContainEqual({
      campo: "nodeTypes.rabbit.spec.campoCondicional.when",
      mensagem: 'when.field referencia "campoFantasma", que não existe no spec deste tipo de nó',
    });
  });
});

describe("validateRegras — config/regras.example.json + config/app.example.json", () => {
  it("não reporta nenhum erro para a config de exemplo", () => {
    expect(validateRegras(regras, app)).toEqual([]);
  });

  it("recusa tech em porTech que não existe em app.json", () => {
    const quebrada: RegrasConfig = {
      ...regras,
      porTech: { ...regras.porTech, TechFantasma: { checklistTecnico: [], testes: [] } },
    };
    const erros = validateRegras(quebrada, app);
    expect(erros).toContainEqual({
      campo: "porTech.TechFantasma",
      mensagem: 'tech "TechFantasma" não existe em app.json',
    });
  });

  it("recusa contexto de requisito que não bate com nada em app.json", () => {
    const quebrada: RegrasConfig = {
      ...regras,
      porTech: {
        Backend: {
          ...regras.porTech.Backend,
          checklistTecnico: [
            ...regras.porTech.Backend.checklistTecnico,
            { texto: "x", contextos: ["contexto-fantasma"] },
          ],
        },
      },
    };
    const erros = validateRegras(quebrada, app);
    expect(erros.some((e) => e.mensagem.includes('contexto "contexto-fantasma"'))).toBe(true);
  });
});
