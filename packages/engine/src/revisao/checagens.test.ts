import { describe, expect, it } from "vitest";
import type { Atividade, Diagrama, ValorSpec } from "../model/types.js";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import { resumirAchados, revisarQuebra } from "./checagens.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      spec: [
        { key: "nome", label: "Nome", type: "text", required: true },
        { key: "linguagem", label: "Linguagem", type: "text", required: true, permiteNA: true },
        { key: "observacao", label: "Observação", type: "text" },
      ],
    },
  },
  edgeTypes: {},
  edgeRules: {},
} as unknown as DiagramaConfig;

const regras: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: {
    Backend: {
      checklistTecnico: [],
      testes: [{ tipo: "unitário", validacao: "cobre o caminho feliz", contextos: ["Backend-http"], dev: true, hlg: false }],
      volumetria: { contextos: ["Backend-http"] },
    },
    Mobile: { checklistTecnico: [], testes: [] },
  },
};

function diagrama(spec: Record<string, ValorSpec> = {}, specNA?: Record<string, { motivo: string }>): Diagrama {
  return {
    nodes: [{ id: "n1", type: "service", label: "srv-checkout", x: 0, y: 0, spec, specNA }],
    edges: [],
  } as unknown as Diagrama;
}

function atividade(over: Partial<Atividade> = {}): Atividade {
  return {
    chave: "n1::setup",
    rotulo: "01",
    tipo: "História",
    tamanho: "M",
    descricao: "",
    techs: ["Backend"],
    contextos: ["Backend-http"],
    dependencias: [],
    origem: { nodeId: "n1" },
    ...over,
  } as unknown as Atividade;
}

const completo = { nome: { valor: "srv-checkout", origem: "manual" as const }, linguagem: { valor: "Java", origem: "manual" as const } };

describe("revisarQuebra (SPEC-26 Bloco 4a — o revisor determinístico)", () => {
  it("quebra saudável e respondida: nenhum achado de erro", () => {
    const respostas = {
      "n1::setup": Object.fromEntries(
        ["Response time", "Max error", "RPS (Requisições por segundo)", "Test duration"].map((c) => [
          `Backend::volumetria::${c}`,
          { valor: "200ms", origem: "manual" as const },
        ])
      ),
    };
    const achados = revisarQuebra([atividade()], diagrama(completo), config, regras, respostas);
    expect(achados.filter((a) => a.severidade === "erro")).toEqual([]);
    expect(achados.map((a) => a.regra)).not.toContain("volumetria-sem-valor");
  });

  it("dependência apontando pra item que não existe mais é ERRO — apagar um nó não avisa quem dependia dele", () => {
    const achados = revisarQuebra(
      [atividade({ dependencias: [{ type: "dependent", alvoChave: "n9::sumido" }] })],
      diagrama(completo),
      config
    );
    expect(achados).toContainEqual(
      expect.objectContaining({ regra: "dependencia-orfa", severidade: "erro", atividadeChave: "n1::setup" })
    );
  });

  it("BUG REAL: campo obrigatório INVISÍVEL (`when` não satisfeito) não pode ser cobrado", () => {
    // Relatado com print: todos os nós verdes no canvas e, ao mesmo tempo, 49
    // erros de "campo obrigatório em branco" na revisão. O caso concreto era
    // `migracao` ("Plano de migração"), `when: not(nodeStatus novo)`: num
    // desenho só de nós NOVOS o campo não existe — e era cobrado em todos.
    const configComWhen = {
      ...config,
      nodeTypes: {
        service: {
          ...config.nodeTypes.service,
          spec: [
            ...config.nodeTypes.service.spec,
            {
              key: "migracao",
              label: "Plano de migração",
              type: "text",
              required: true,
              when: { not: { nodeStatus: "novo" } },
            },
          ],
        },
      },
    } as unknown as DiagramaConfig;

    const novo = {
      nodes: [{ id: "n1", type: "service", label: "srv-checkout", x: 0, y: 0, status: "novo", spec: completo }],
      edges: [],
    } as unknown as Diagrama;
    expect(revisarQuebra([atividade()], novo, configComWhen).map((a) => a.regra)).not.toContain(
      "campo-obrigatorio-vazio"
    );

    // E no estado em que o campo EXISTE, continua sendo cobrado — a correção
    // não pode ter sido "parar de checar".
    const existente = {
      nodes: [{ id: "n1", type: "service", label: "srv-checkout", x: 0, y: 0, status: "existente", spec: completo }],
      edges: [],
    } as unknown as Diagrama;
    expect(revisarQuebra([atividade()], existente, configComWhen).map((a) => a.regra)).toContain(
      "campo-obrigatorio-vazio"
    );
  });

  it("campo obrigatório em branco é ERRO; marcado como N/A não é lacuna", () => {
    const semLinguagem = revisarQuebra([atividade()], diagrama({ nome: completo.nome }), config);
    expect(semLinguagem.map((a) => a.regra)).toContain("campo-obrigatorio-vazio");
    expect(semLinguagem.find((a) => a.regra === "campo-obrigatorio-vazio")!.mensagem).toContain("Linguagem");

    const comNA = revisarQuebra(
      [atividade()],
      diagrama({ nome: completo.nome }, { linguagem: { motivo: "serviço de terceiro" } }),
      config
    );
    expect(comNA.map((a) => a.regra)).not.toContain("campo-obrigatorio-vazio");
  });

  it("campo não obrigatório em branco não vira achado — ruído afogaria o sinal", () => {
    const achados = revisarQuebra([atividade()], diagrama(completo), config);
    expect(achados.map((a) => a.mensagem).join()).not.toContain("Observação");
  });

  it("volumetria exigida e sem valor vira AVISO, com o campo apontado", () => {
    const achados = revisarQuebra([atividade()], diagrama(completo), config, regras, {});
    const volumetria = achados.filter((a) => a.regra === "volumetria-sem-valor");
    expect(volumetria.length).toBeGreaterThan(0);
    expect(volumetria[0].severidade).toBe("aviso");
    expect(volumetria[0].campo).toContain("::volumetria::");
  });

  it("tech/contexto que NENHUM ciclo de teste cobre é aviso — o buraco é da configuração, e some por não gerar nada", () => {
    const achados = revisarQuebra([atividade({ techs: ["Mobile"], contextos: [] })], diagrama(completo), config, regras, {});
    expect(achados).toContainEqual(
      expect.objectContaining({ regra: "sem-ciclo-de-teste", severidade: "aviso" })
    );
    // Com tech coberta, não acusa.
    expect(revisarQuebra([atividade()], diagrama(completo), config, regras, {}).map((a) => a.regra)).not.toContain(
      "sem-ciclo-de-teste"
    );
  });

  it("item tamanho G sugere quebrar — regra que hoje depende do modelo obedecer", () => {
    const achados = revisarQuebra([atividade({ tamanho: "G" })], diagrama(completo), config, regras, {});
    expect(achados.map((a) => a.regra)).toContain("item-grande");
    expect(revisarQuebra([atividade({ tamanho: "P" })], diagrama(completo), config, regras, {}).map((a) => a.regra)).not.toContain(
      "item-grande"
    );
  });

  it("sem regras configuradas, só as checagens estruturais rodam (não inventa exigência que o time não tem)", () => {
    const achados = revisarQuebra([atividade({ tamanho: "G" })], diagrama(completo), config);
    expect(achados.map((a) => a.regra)).not.toContain("item-grande");
    expect(achados.map((a) => a.regra)).not.toContain("sem-ciclo-de-teste");
  });

  it("resumirAchados separa erro de aviso — é o que o cabeçalho da revisão mostra", () => {
    const achados = revisarQuebra(
      [atividade({ tamanho: "G", dependencias: [{ type: "dependent", alvoChave: "sumido" }] })],
      diagrama({ nome: completo.nome }),
      config,
      regras,
      {}
    );
    const { erros, avisos } = resumirAchados(achados);
    expect(erros).toBeGreaterThan(0);
    expect(avisos).toBeGreaterThan(0);
  });
});
