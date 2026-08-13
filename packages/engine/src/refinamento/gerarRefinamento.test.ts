import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "../config/types.js";
import type { Aresta, No, ValorSpec } from "../model/types.js";
import {
  gerarChecklistProcesso,
  gerarChecklistTecnico,
  gerarCiclosDeTeste,
  gerarVolumetria,
  listarPlaceholders,
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

  it("achado real: config/regras.json é editado à mão sem validação no app web — tech sem checklistTecnico não pode derrubar a tela inteira (TypeError em .filter de undefined)", () => {
    const regrasIncompletas = {
      tipos: [], tamanhos: [],
      porTech: {
        // Simula um regras.json real faltando o campo — nada no runtime do app
        // web valida isso (só packages/cli chama validateRegras), então o
        // engine precisa ser resiliente aqui, não assumir o formato correto.
        Backend: { testes: [] },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as RegrasConfig;

    expect(() => gerarChecklistTecnico(regrasIncompletas, ["Backend"], [], [noTecnico()], semArestasTecnico)).not.toThrow();
    expect(gerarChecklistTecnico(regrasIncompletas, ["Backend"], [], [noTecnico()], semArestasTecnico)).toBe("");
  });

  it("achado real: mesma resiliência pra tech sem 'testes' em gerarCiclosDeTeste", () => {
    const regrasIncompletas = {
      tipos: [], tamanhos: [],
      porTech: { Backend: { checklistTecnico: [] } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as RegrasConfig;

    expect(() => gerarCiclosDeTeste(regrasIncompletas, ["Backend"], [])).not.toThrow();
    expect(gerarCiclosDeTeste(regrasIncompletas, ["Backend"], [])).toBe("");
  });

  describe("respostas (Fase 1, SPEC-23)", () => {
    const respostaSugeridaNaoConfirmada: ValorSpec = { valor: "sim, via política X", origem: "sugerido", confirmado: false };
    const respostaSugeridaConfirmada: ValorSpec = { valor: "sim, via política X", origem: "sugerido", confirmado: true };
    const respostaManual: ValorSpec = { valor: "sim, via TTL de 7 dias", origem: "manual" };

    it("sem respostas, comportamento idêntico a antes (marcador sozinho)", () => {
      const md = gerarChecklistTecnico(regras, ["Backend"], ["Backend-mensagens rabbitmq"], [noTecnico()], semArestasTecnico);
      expect(md).toContain("- DLQ configurada e monitorada <- ✍️ especificar");
    });

    it("SPEC-41: sugestão não confirmada ENTRA no documento, com a marca de sugerido", () => {
      const md = gerarChecklistTecnico(
        regras, ["Backend"], ["Backend-mensagens rabbitmq"], [noTecnico()], semArestasTecnico,
        { "Backend::DLQ configurada e monitorada": respostaSugeridaNaoConfirmada }
      );
      expect(md).toContain("política X");
      expect(md).toContain("_(sugerido pela esteira — confirmar)_");
      expect(md).not.toContain("DLQ configurada e monitorada <- ✍️ especificar");
    });

    it("resposta manual aparece interpolada, SEM marcador sobrando (SPEC-41)", () => {
      const md = gerarChecklistTecnico(
        regras, ["Backend"], ["Backend-mensagens rabbitmq"], [noTecnico()], semArestasTecnico,
        { "Backend::DLQ configurada e monitorada": respostaManual }
      );
      expect(md).toContain("- DLQ configurada e monitorada: sim, via TTL de 7 dias");
      expect(md).not.toContain("TTL de 7 dias <- ✍️ especificar");
    });

    it("sugestão confirmada aparece interpolada, mesma régua da manual", () => {
      const md = gerarChecklistTecnico(
        regras, ["Backend"], ["Backend-mensagens rabbitmq"], [noTecnico()], semArestasTecnico,
        { "Backend::DLQ configurada e monitorada": respostaSugeridaConfirmada }
      );
      expect(md).toContain("- DLQ configurada e monitorada: sim, via política X");
      expect(md).not.toContain("política X <- ✍️ especificar");
      // Confirmada: sem a marca de sugerido — a régua é a da manual mesmo.
      expect(md).not.toContain("política X _(sugerido");
    });
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

  it("resposta confirmada substitui o '___' do campo, sem marcador sobrando (SPEC-41)", () => {
    const respostas = { "Backend::volumetria::Response time": { valor: "200ms p95", origem: "manual" as const } };
    const md = gerarVolumetria(regras, ["Backend"], ["Backend-chamadas http"], respostas);
    // SPEC-41: com resposta, o marcador NÃO sobra ao lado; campo vazio mantém.
    expect(md).toContain("- Response time: 200ms p95");
    expect(md).not.toContain("200ms p95 <- ✍️ especificar");
    expect(md).toContain("- Max error: ___ <- ✍️ especificar");
  });

  it("SPEC-41: resposta sugerida substitui o '___' com a marca de sugerido", () => {
    const respostas = { "Backend::volumetria::Response time": { valor: "200ms p95", origem: "sugerido" as const, confirmado: false } };
    const md = gerarVolumetria(regras, ["Backend"], ["Backend-chamadas http"], respostas);
    expect(md).toContain("- Response time: 200ms p95 _(sugerido pela esteira — confirmar)_");
  });
});

describe("listarPlaceholders (Fase 1, SPEC-23)", () => {
  it("lista os itens de checklist técnico aplicáveis, com chave namespaced por tech", () => {
    const placeholders = listarPlaceholders(regras, ["Backend"], ["Backend-mensagens rabbitmq"], [noTecnico()], semArestasTecnico);
    const chaves = placeholders.map((p) => p.chave);
    expect(chaves).toContain("Backend::DLQ configurada e monitorada");
    expect(chaves).toContain("Backend::Nome do serviço segue o padrão do time");
    expect(chaves).not.toContain("Backend::Índice criado para as queries novas");
    // Fase 1d-ii, SPEC-23: história de usuário e critérios de aceite estão
    // sempre presentes, além do checklist técnico da tech/contexto. SPEC-24:
    // contrato/regras de teste/cenário Gherkin também.
    expect(chaves).toContain("_historiaUsuario");
    expect(chaves).toContain("_criteriosAceite");
    expect(chaves).toContain("_contratoRequest");
    expect(chaves).toContain("_regrasTeste");
    expect(chaves).toContain("_cenarioFeature");
    expect(placeholders.filter((p) => p.secao === "checklistTecnico").length).toBeGreaterThan(0);
  });

  it("inclui os 4 campos fixos de volumetria quando aplicável, chave namespaced", () => {
    const placeholders = listarPlaceholders(regras, ["Backend"], ["Backend-chamadas http"], [noTecnico()], semArestasTecnico);
    const volumetria = placeholders.filter((p) => p.secao === "volumetria");
    expect(volumetria.map((p) => p.rotulo)).toEqual([
      "Response time", "Max error", "RPS (Requisições por segundo)", "Test duration",
    ]);
    expect(volumetria.every((p) => p.chave.startsWith("Backend::volumetria::"))).toBe(true);
  });

  it("mesma filtragem por when/contexto do checklist técnico — item de migração só aparece pra nó existente", () => {
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
    // Fase 1d-ii/SPEC-24 + SPEC-47: história, critérios, contrato (5 campos),
    // regras de teste, cenário Gherkin e entrega final sempre aparecem (10
    // placeholders fixos), independente do `when` do checklist técnico.
    const semNo = listarPlaceholders(regrasComMigracao, ["Backend"], [], [noTecnico({ status: "novo" })], semArestasTecnico);
    expect(semNo.filter((p) => p.secao === "checklistTecnico")).toHaveLength(0);
    expect(semNo).toHaveLength(10);

    const comNoExistente = listarPlaceholders(regrasComMigracao, ["Backend"], [], [noTecnico({ status: "existente" })], semArestasTecnico);
    expect(comNoExistente.filter((p) => p.secao === "checklistTecnico")).toHaveLength(1);
    expect(comNoExistente).toHaveLength(11);
  });

  it("história, critérios, contrato, regras de teste, cenário Gherkin e ENTREGA FINAL aparecem mesmo sem tech/regra configurada (SPEC-24/47)", () => {
    const placeholders = listarPlaceholders(regras, [], [], [], []);
    expect(placeholders).toHaveLength(10);
    expect(placeholders.map((p) => p.secao).sort()).toEqual([
      "cenarioFeature",
      "contrato",
      "contrato",
      "contrato",
      "contrato",
      "contrato",
      "criteriosAceite",
      "entregaFinal",
      "historiaUsuario",
      "regrasTeste",
    ]);
    expect(placeholders.map((p) => p.chave)).toEqual([
      "_historiaUsuario",
      "_criteriosAceite",
      "_contratoNoVinculado",
      "_contratoRequest",
      "_contratoResponse",
      "_contratoErros",
      "_contratoDependencias",
      "_regrasTeste",
      "_cenarioFeature",
      "_entregaFinal",
    ]);
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
