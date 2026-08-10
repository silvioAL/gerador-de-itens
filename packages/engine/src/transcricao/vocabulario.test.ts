import { describe, expect, it } from "vitest";
import { montarVocabularioTranscricao } from "./vocabulario.js";

/**
 * SPEC-30 Fase 1a. Estes testes existem por causa de uma medição concreta:
 * com o Whisper `base` em CPU, a MESMA frase saiu
 *
 *   "fila do rabitém IKEA … com dedileta arquil e idem potência"   (sem isto)
 *   "fila do RabbitMQ … com dead letter queue e idempotência"      (com isto)
 *
 * O que se testa aqui não é o modelo — é o contrato do que vai pro prompt:
 * ordem (específico primeiro), ausência de repetição, e o teto.
 */
const config = {
  nodeTypes: {
    rabbitQueue: { label: "Fila Rabbit", spec: [] },
    camunda: { label: "Processo Camunda", spec: [] },
    fico: { label: "FICO", spec: [] },
  },
} as never;

const regras = {
  porTech: {
    Backend: { testes: [{ texto: "t", contextos: ["Backend-mensagens"] }] },
    Mobile: { testes: [] },
  },
} as never;

describe("montarVocabularioTranscricao (SPEC-30 Fase 1a)", () => {
  it("junta rótulos do diagrama, tipos de nó, techs e contextos", () => {
    const v = montarVocabularioTranscricao(config, regras, { rotulos: ["srv-proposta"] });

    for (const termo of ["srv-proposta", "Fila Rabbit", "Processo Camunda", "FICO", "Backend", "Backend-mensagens"]) {
      expect(v, termo).toContain(termo);
    }
  });

  it("inclui o jargão do ofício, que não está na config de ninguém", () => {
    const v = montarVocabularioTranscricao(config, regras);
    // "idempotência" e "dead letter queue" são exatamente os dois que o modelo
    // errou na medição — e não aparecem em `config/diagrama.json`.
    expect(v).toContain("idempotência");
    expect(v).toContain("dead letter queue");
  });

  it("põe o MAIS específico primeiro — é o que sobrevive se o teto cortar", () => {
    const v = montarVocabularioTranscricao(config, regras, { rotulos: ["srv-proposta"] });
    expect(v.indexOf("srv-proposta")).toBeLessThan(v.indexOf("Fila Rabbit"));
    expect(v.indexOf("Fila Rabbit")).toBeLessThan(v.indexOf("idempotência"));
  });

  it("não repete termo, mesmo com diferença de caixa", () => {
    const v = montarVocabularioTranscricao(config, regras, { rotulos: ["fila rabbit", "Fila Rabbit"] });
    // Uma ocorrência só: repetir gasta o orçamento de contexto sem ganho.
    expect(v.toLowerCase().split("fila rabbit").length - 1).toBe(1);
  });

  it("respeita o teto — passar dele faz o Whisper descartar o começo em silêncio", () => {
    const muitos = Array.from({ length: 400 }, (_, i) => `servico-numero-${i}`);
    const v = montarVocabularioTranscricao(config, regras, { rotulos: muitos });

    expect(v.length).toBeLessThanOrEqual(850);
    // Cortou pelo fim, não pelo começo: o primeiro rótulo continua lá.
    expect(v).toContain("servico-numero-0");
  });

  it("frase em português — o prompt também sinaliza idioma", () => {
    // Uma lista solta de termos em inglês empurraria a transcrição inteira pro
    // inglês, que é pior que errar uma sigla.
    expect(montarVocabularioTranscricao(config, regras)).toMatch(/^Vocabulário técnico/);
  });

  it("sem config nenhuma, ainda entrega o jargão do ofício", () => {
    const v = montarVocabularioTranscricao(undefined, undefined);
    expect(v).toContain("idempotência");
  });
});
