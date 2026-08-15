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

  /**
   * §237 — o `type` do campo nunca foi conferido: um valor inventado passava,
   * o campo não renderizava, a prontidão não o cobrava e nada apontava o erro.
   * Config incorreta falhando ABERTA e em silêncio — o pior modo de falha, e o
   * que o "falhar alto" do CONTEXTO existe para impedir.
   */
  it("§239 — recusa checagem com operador inventado, ou sem valor para comparar", () => {
    // Regra conferível mal escrita nunca acusaria nada, e ninguém saberia que
    // o padrão declarado não está sendo conferido — falha aberta com cara de
    // padrão em vigor, que é pior que padrão nenhum.
    const comOperadorRuim: RegrasConfig = {
      ...regras,
      porTech: {
        ...regras.porTech,
        [Object.keys(regras.porTech)[0]]: {
          ...regras.porTech[Object.keys(regras.porTech)[0]],
          checklistTecnico: [
            { texto: "x", contextos: [], checagem: { campo: "timeout", operador: "menorzinho" as never, valor: 1 } },
          ],
        },
      },
    };
    const erros = validateRegras(comOperadorRuim, app);
    expect(erros.some((e) => e.mensagem.includes('operador "menorzinho" não existe'))).toBe(true);

    const semValor: RegrasConfig = {
      ...regras,
      porTech: {
        ...regras.porTech,
        [Object.keys(regras.porTech)[0]]: {
          ...regras.porTech[Object.keys(regras.porTech)[0]],
          checklistTecnico: [{ texto: "x", contextos: [], checagem: { campo: "timeout", operador: "lte" } }],
        },
      },
    };
    // §241 mudou a mensagem: o alvo passou a poder ser outro CAMPO, então
    // "precisa de um valor" virou "precisa de valor ou de valorDe".
    expect(
      validateRegras(semValor, app).some((e) => e.mensagem.includes('precisa de "valor" ou de "valorDe"'))
    ).toBe(true);
  });

  it("§241 — recusa checagem sem alvo, com dois alvos, ou multiplicando o nada", () => {
    const comChecagem = (checagem: unknown): RegrasConfig => ({
      ...regras,
      porTech: {
        ...regras.porTech,
        [Object.keys(regras.porTech)[0]]: {
          ...regras.porTech[Object.keys(regras.porTech)[0]],
          checklistTecnico: [{ texto: "x", contextos: [], checagem: checagem as never }],
        },
      },
    });

    // Nenhum alvo: nunca acusaria nada.
    expect(
      validateRegras(comChecagem({ campo: "ttl", operador: "gte" }), app).some((e) =>
        e.mensagem.includes('precisa de "valor" ou de "valorDe"')
      )
    ).toBe(true);

    // Dois alvos: a regra significaria coisas diferentes conforme quem lê.
    expect(
      validateRegras(comChecagem({ campo: "ttl", operador: "gte", valor: 1, valorDe: "backoff" }), app).some((e) =>
        e.mensagem.includes("escolha um alvo")
      )
    ).toBe(true);

    // Multiplicar sem ter o que multiplicar.
    expect(
      validateRegras(comChecagem({ campo: "ttl", operador: "gte", valor: 1, multiplicadoPor: "retry" }), app).some(
        (e) => e.mensagem.includes("não há o que multiplicar")
      )
    ).toBe(true);
  });

  it("recusa type de campo inventado, dizendo quais existem", () => {
    const quebrada: DiagramaConfig = {
      ...diagrama,
      nodeTypes: {
        ...diagrama.nodeTypes,
        rabbit: {
          ...diagrama.nodeTypes.rabbit,
          spec: [{ key: "inventado", label: "Inventado", type: "lixo" as never }],
        },
      },
    };

    const erros = validateConfig(quebrada, app);

    expect(erros).toHaveLength(1);
    expect(erros[0].campo).toBe("nodeTypes.rabbit.spec.inventado.type");
    expect(erros[0].mensagem).toContain('type "lixo" não existe');
    // A mensagem diz o que É válido: erro de config que não ensina o conserto
    // vira tentativa e erro no arquivo.
    expect(erros[0].mensagem).toContain("textarea");
    expect(erros[0].mensagem).toContain("lista");
  });

  it("recusa type inventado DENTRO de um itemSpec de lista", () => {
    // Mesmo sintoma, uma camada abaixo — e é onde passaria despercebido por
    // mais tempo, porque a lista em si renderiza.
    const quebrada: DiagramaConfig = {
      ...diagrama,
      nodeTypes: {
        ...diagrama.nodeTypes,
        rabbit: {
          ...diagrama.nodeTypes.rabbit,
          spec: [
            {
              key: "itens",
              label: "Itens",
              type: "lista",
              itemSpec: [{ key: "campo", label: "Campo", type: "chutado" as never }],
            },
          ],
        },
      },
    };

    const erros = validateConfig(quebrada, app);

    expect(erros).toHaveLength(1);
    expect(erros[0].campo).toBe("nodeTypes.rabbit.spec.itens.itemSpec.campo.type");
  });

  it("recusa type inventado em campo de ARESTA também", () => {
    const primeiroTipoDeAresta = Object.keys(diagrama.edgeTypes)[0];
    const quebrada: DiagramaConfig = {
      ...diagrama,
      edgeTypes: {
        ...diagrama.edgeTypes,
        [primeiroTipoDeAresta]: {
          ...diagrama.edgeTypes[primeiroTipoDeAresta],
          spec: [{ key: "x", label: "X", type: "nada" as never }],
        },
      },
    };

    expect(validateConfig(quebrada, app)[0].campo).toBe(
      `edgeTypes.${primeiroTipoDeAresta}.spec.x.type`
    );
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

  it("recusa default de campo de aresta (EdgeTypeConfig.spec, SPEC-21) referenciando chave inexistente", () => {
    const quebrada: DiagramaConfig = {
      ...diagrama,
      edgeTypes: {
        ...diagrama.edgeTypes,
        http: {
          ...diagrama.edgeTypes.http,
          spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "text", default: "{{campoFantasma}}" }],
        },
      },
    };
    const erros = validateConfig(quebrada, app);
    expect(erros).toContainEqual({
      campo: "edgeTypes.http.spec.timeoutMs.default",
      mensagem: 'default referencia "{{campoFantasma}}", que não existe no spec de "http"',
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
