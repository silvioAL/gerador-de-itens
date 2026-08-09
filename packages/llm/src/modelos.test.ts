import { describe, expect, it } from "vitest";
import { formatoJsonPorBaseUrl, PRESETS_GATEWAY, presetGatewayPorId } from "./modelos.js";

describe("PRESETS_GATEWAY — os destinos conhecidos", () => {
  it("Claude está na lista, com base URL e modelo prontos pra usar", () => {
    const claude = presetGatewayPorId("anthropic");
    expect(claude?.baseUrl).toBe("https://api.anthropic.com/v1");
    expect(claude?.modelos).toContain(claude?.modeloPadrao);
  });

  it("todo preset tem modeloPadrao dentro da própria lista de modelos", () => {
    // Sem isso, escolher o destino preencheria o campo com um nome que o
    // datalist nem oferece — e o erro só apareceria na primeira chamada.
    for (const p of PRESETS_GATEWAY) expect(p.modelos, p.id).toContain(p.modeloPadrao);
  });

  it("todo preset diz onde pegar a chave, ou é local", () => {
    for (const p of PRESETS_GATEWAY) {
      if (p.baseUrl.includes("localhost")) continue;
      expect(p.urlChave, p.id).toBeTruthy();
    }
  });
});


describe("formatoJsonPorBaseUrl — o dialeto vem do destino, não de quem configura", () => {
  it("Anthropic pede json_schema — medido contra a API, a doc diz que ignora e ela responde 400", () => {
    expect(formatoJsonPorBaseUrl("https://api.anthropic.com/v1")).toBe("json_schema");
    // Barra sobrando e maiúsculas não podem mudar a decisão.
    expect(formatoJsonPorBaseUrl("https://API.Anthropic.com/v1/")).toBe("json_schema");
  });

  it("DeepSeek e Ollama seguem no json_object", () => {
    expect(formatoJsonPorBaseUrl("https://api.deepseek.com/v1")).toBe("json_object");
    expect(formatoJsonPorBaseUrl("http://localhost:11434/v1")).toBe("json_object");
  });

  it("gateway desconhecido cai no json_object — o de-facto, e o que já estava salvo", () => {
    expect(formatoJsonPorBaseUrl("https://gateway-interno.empresa/v1")).toBe("json_object");
    expect(formatoJsonPorBaseUrl(undefined)).toBe("json_object");
  });
});
