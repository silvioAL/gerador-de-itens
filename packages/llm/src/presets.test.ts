import { describe, expect, it } from "vitest";
import { presetsDoModo, PRESETS_GATEWAY, WHISPER_DO_MODO } from "./presets.js";

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
