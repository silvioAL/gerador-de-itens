import { describe, expect, it } from "vitest";
import type { Atividade, Diagrama, ValorSpec } from "../model/types.js";
import type { RegrasConfig } from "../config/types.js";
import {
  TEMPLATE_PROMPT_UNICO_PADRAO,
  VARIAVEIS_PROMPT_UNICO,
  gerarPromptUnico,
  validarTemplatePromptUnico,
} from "./gerarPromptUnico.js";

const DIAGRAMA: Diagrama = { nodes: [], edges: [] };
const AGORA = new Date("2026-08-09T14:30:00");

function atividade(over: Partial<Atividade> = {}): Atividade {
  return {
    chave: "n1::ep0",
    rotulo: "Expor endpoint de checkout",
    tipo: "História",
    tamanho: "M",
    descricao: "Implementar srv-checkout",
    techs: ["java"],
    contextos: ["backend-api"],
    dependencias: [],
    origem: { nodeId: "n1" },
    ...over,
  } as Atividade;
}

const REGRAS: RegrasConfig = {
  porTech: {
    java: {
      checklistTecnico: [{ texto: "Configurar timeout do client", contextos: [] }],
      testes: [{ nome: "Contrato", contextos: [], dev: true, hlg: false }],
    },
  },
} as unknown as RegrasConfig;

describe("gerarPromptUnico (SPEC-25 §5.5 — a ponte com o fluxo real)", () => {
  it("não chama modelo nenhum: é texto pra colar, e funciona sem provedor conectado", () => {
    // O ponto da fase: enquanto o token não sai, este caminho já entrega.
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { agora: AGORA });
    expect(typeof prompt).toBe("string");
    expect(prompt).toContain("Expor endpoint de checkout");
  });

  it("numera os itens e traz tipo, tamanho, techs e contextos", () => {
    const prompt = gerarPromptUnico([atividade(), atividade({ chave: "n2::ep0", rotulo: "Publicar evento" })], DIAGRAMA, {
      agora: AGORA,
    });
    expect(prompt).toContain("1. [História][M] Expor endpoint de checkout");
    expect(prompt).toContain("2. [História][M] Publicar evento");
    expect(prompt).toContain("Techs: java | Contextos: backend-api");
  });

  it("dependência sai pelo NÚMERO do item, não pela chave interna", () => {
    // `n1::ep0` não significa nada pra quem lê o prompt, nem pro modelo.
    const prompt = gerarPromptUnico(
      [atividade(), atividade({ chave: "n2::ep0", dependencias: [{ type: "dependent", alvoChave: "n1::ep0" }] })],
      DIAGRAMA,
      { agora: AGORA }
    );
    expect(prompt).toContain("Depende de: item 1");
    expect(prompt).not.toContain("n1::ep0");
  });

  it("o que já foi escrito entra como 'já definido' — o modelo complementa, não reescreve", () => {
    const respostas: Record<string, Record<string, ValorSpec>> = {
      "n1::ep0": { _historiaUsuario: { valor: "Como cliente, quero fechar o pedido.", origem: "manual" } },
    };
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { respostasItens: respostas, agora: AGORA });
    expect(prompt).toContain("Já definido (não reescrever, só complementar)");
    expect(prompt).toContain("_historiaUsuario: Como cliente, quero fechar o pedido.");
  });

  it("sugestão NÃO confirmada fica de fora — palpite não pode virar decisão no prompt", () => {
    const respostas: Record<string, Record<string, ValorSpec>> = {
      "n1::ep0": {
        _confirmada: { valor: "texto aprovado", origem: "sugerido", confirmado: true },
        _palpite: { valor: "chute do modelo", origem: "sugerido" },
        _vazia: { valor: "   ", origem: "manual" },
      },
    };
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { respostasItens: respostas, agora: AGORA });
    expect(prompt).toContain("texto aprovado");
    expect(prompt).not.toContain("chute do modelo");
    expect(prompt).not.toContain("_vazia");
  });

  it("texto muito longo é truncado — senão os itens seguintes saem da janela do modelo", () => {
    const respostas: Record<string, Record<string, ValorSpec>> = {
      "n1::ep0": { _grande: { valor: "x".repeat(500), origem: "manual" } },
    };
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { respostasItens: respostas, agora: AGORA });
    expect(prompt).toContain("…");
    expect(prompt).not.toContain("x".repeat(400));
  });

  it("requisitos técnicos e ciclos de teste vêm DERIVADOS — o modelo não é consultado sobre eles", () => {
    // É a diferença registrada em §5.5: aqui o engine garante, não o modelo.
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { regras: REGRAS, agora: AGORA });
    expect(prompt).toContain("Configurar timeout do client");
    expect(prompt).toContain("Contrato");
    expect(prompt).toContain("use como está");
  });

  it("sem regras, diz que não há requisito em vez de deixar seção fantasma", () => {
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { agora: AGORA });
    expect(prompt).toContain("[Nenhum requisito técnico específico");
    expect(prompt).toContain("[Nenhum ciclo de teste específico");
  });

  it("agrega techs e contextos de TODOS os itens, sem repetir", () => {
    const prompt = gerarPromptUnico(
      [atividade(), atividade({ chave: "n2::ep0", techs: ["react", "java"], contextos: ["frontend"] })],
      DIAGRAMA,
      { agora: AGORA }
    );
    expect(prompt).toContain("java, react");
    expect(prompt).toContain("backend-api, frontend");
  });

  it("épico ausente vira marcador explícito, não string vazia silenciosa", () => {
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { agora: AGORA });
    expect(prompt).toContain("[INFORMAÇÕES DA DEMANDA NÃO INFORMADAS]");
    expect(prompt).toContain("[Nenhum contexto adicional informado]");
  });

  it("épico e contexto adicional entram quando existem", () => {
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, {
      demandInfo: "Reduzir o timeout do checkout para 150ms.",
      contextoAdicional: "Time já usa Resilience4j.",
      agora: AGORA,
    });
    expect(prompt).toContain("Reduzir o timeout do checkout para 150ms.");
    expect(prompt).toContain("Time já usa Resilience4j.");
  });

  it("quebra sem itens não gera prompt mudo — diz o que fazer", () => {
    const prompt = gerarPromptUnico([], DIAGRAMA, { agora: AGORA });
    expect(prompt).toContain("[Nenhum item derivado — desenhe o diagrama primeiro]");
  });

  it("é determinístico — duas gerações da mesma quebra dão exatamente o mesmo texto", () => {
    // Importa pra valer: dá pra comparar dois prompts e ver o que mudou no
    // desenho. Por isso o template PADRÃO não usa `{{timestamp}}`.
    expect(TEMPLATE_PROMPT_UNICO_PADRAO).not.toContain("{{timestamp}}");
    expect(gerarPromptUnico([atividade()], DIAGRAMA)).toBe(gerarPromptUnico([atividade()], DIAGRAMA));
  });

  it("quem QUISER data no template recebe, e `agora` a torna testável", () => {
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { template: "{{timestamp}}", agora: AGORA });
    expect(prompt).toContain("09/08/2026");
  });

  it("template customizado é respeitado — o do usuário é a fonte, não o nosso padrão", () => {
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, {
      template: "SÓ OS ITENS:\n{{itensBreakDownContent}}",
      agora: AGORA,
    });
    expect(prompt.startsWith("SÓ OS ITENS:")).toBe(true);
    expect(prompt).not.toContain("Você é um analista técnico");
  });

  it("variável desconhecida fica LITERAL — sumir com ela esconderia o erro de quem editou", () => {
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { template: "A: {{naoExiste}}", agora: AGORA });
    expect(prompt).toBe("A: {{naoExiste}}");
  });
});

describe("validarTemplatePromptUnico", () => {
  it("o template padrão é válido — nosso próprio default não pode citar variável inexistente", () => {
    expect(validarTemplatePromptUnico(TEMPLATE_PROMPT_UNICO_PADRAO)).toEqual([]);
  });

  it("aponta só as desconhecidas", () => {
    expect(validarTemplatePromptUnico("{{descricaoEpico}} {{inventada}} {{outra}}")).toEqual(["inventada", "outra"]);
  });

  it("todas as variáveis declaradas são de fato preenchidas pelo motor", () => {
    // Trava o par declaração↔implementação: declarar sem preencher deixaria
    // `{{variavel}}` cru no prompt colado.
    const template = VARIAVEIS_PROMPT_UNICO.map((v) => `[${v}]{{${v}}}`).join("\n");
    const prompt = gerarPromptUnico([atividade()], DIAGRAMA, { template, agora: AGORA });
    expect(prompt).not.toMatch(/\{\{/);
  });
});
