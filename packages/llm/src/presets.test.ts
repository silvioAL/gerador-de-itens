import { describe, expect, it } from "vitest";
import { ehSimulado, presetsDoModo, PRESETS_GATEWAY, WHISPER_DO_MODO } from "./presets.js";

/**
 * ACHADO REAL do usuário: escolheu o preset da Anthropic, salvou, e ao testar o
 * microfone levou "Este endereço não tem transcrição de áudio (HTTP 404)".
 *
 * A voz tinha ido para o endereço do CHAT porque nenhum preset de chat-only
 * traz `baseUrlTranscricao` — o que está certo (esses provedores não
 * transcrevem) e ainda assim deixava a pessoa sem saída, porque o Whisper da
 * própria stack tem endereço fixo que ela não tem como adivinhar.
 */
describe("presetsDoModo — a voz sugerida (#291)", () => {
  it("preset de chat-only recebe o Whisper do modo, em vez de ficar sem voz", () => {
    const anthropicLocal = presetsDoModo("local").find((p) => p.id === "anthropic");
    const anthropicHospedado = presetsDoModo("hospedado").find((p) => p.id === "anthropic");

    expect(anthropicLocal?.baseUrlTranscricao).toBe(WHISPER_DO_MODO.local);
    expect(anthropicHospedado?.baseUrlTranscricao).toBe(WHISPER_DO_MODO.hospedado);
  });

  it("o endereço é o do MODO — de dentro do compose é o nome do serviço, de fora é localhost", () => {
    expect(WHISPER_DO_MODO.hospedado).toContain("whisper:9000");
    expect(WHISPER_DO_MODO.local).toContain("localhost:9000");
    expect(WHISPER_DO_MODO.local).not.toBe(WHISPER_DO_MODO.hospedado);
  });

  it("quem JÁ traz endereço próprio não é sobrescrito", () => {
    // O `ollama-docker` aponta pro whisper do compose e o `ollama` pro
    // localhost. Se a sugestão sobrescrevesse, daria no mesmo por acaso hoje —
    // e quebraria no dia em que um preset trouxer um serviço de voz diferente.
    const comVozPropria = PRESETS_GATEWAY.filter((p) => p.baseUrlTranscricao);
    expect(comVozPropria.length).toBeGreaterThan(0);

    for (const original of comVozPropria) {
      for (const modo of ["local", "hospedado"] as const) {
        const depois = presetsDoModo(modo).find((p) => p.id === original.id);
        if (depois) expect(depois.baseUrlTranscricao).toBe(original.baseUrlTranscricao);
      }
    }
  });

  it("nenhum preset sai da função sem endereço de voz — era o buraco", () => {
    for (const modo of ["local", "hospedado"] as const) {
      for (const p of presetsDoModo(modo)) {
        expect(p.baseUrlTranscricao, `${p.id} no modo ${modo}`).toBeTruthy();
      }
    }
  });

  it("o filtro por modo continua valendo — sugerir voz não pode ressuscitar destino inalcançável", () => {
    // `ollama` (localhost) não é alcançável de dentro do container, e
    // `ollama-docker` não é de fora. A regra de `modos` é anterior à sugestão.
    const ids = (m: "local" | "hospedado") => presetsDoModo(m).map((p) => p.id);
    for (const p of PRESETS_GATEWAY) {
      if (!p.modos) continue;
      for (const modo of ["local", "hospedado"] as const) {
        expect(ids(modo).includes(p.id)).toBe(p.modos.includes(modo));
      }
    }
  });
});

/**
 * SPEC-74 fatia D — o produto precisa saber que o destino inventa as respostas
 * para poder dizer isso na tela. Mesma dedução por endereço de `temVisao`.
 */
describe("ehSimulado (SPEC-74)", () => {
  it("reconhece o destino sem custo", () => {
    expect(ehSimulado("http://gateway-falso:4123/v1")).toBe(true);
    // Barra final e caixa não podem mudar a resposta — a base URL é digitável.
    expect(ehSimulado("http://GATEWAY-FALSO:4123/v1/")).toBe(true);
  });

  it("destino de verdade e desconhecido respondem false", () => {
    expect(ehSimulado("https://api.anthropic.com/v1")).toBe(false);
    expect(ehSimulado("https://gateway-interno.empresa/v1")).toBe(false);
    expect(ehSimulado(undefined)).toBe(false);
  });

  it("o preset sem custo é o PRIMEIRO da lista — quem escolhe pega o primeiro que reconhece", () => {
    expect(PRESETS_GATEWAY[0].id).toBe("sem-custo");
    expect(PRESETS_GATEWAY[0].simulado).toBe(true);
  });

  it("e é o único simulado: nenhum destino de verdade pode estar marcado", () => {
    expect(PRESETS_GATEWAY.filter((p) => p.simulado).map((p) => p.id)).toEqual(["sem-custo"]);
  });
});
