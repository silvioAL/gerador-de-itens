import { describe, expect, it } from "vitest";
import { formatoJsonPorBaseUrl, PRESETS_GATEWAY, presetGatewayPorId, presetsDoModo } from "./modelos.js";

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
      // Destino sem chave é o que roda na própria infra: `localhost` (Ollama na
      // máquina) ou um nome de serviço do compose, que não é endereço público.
      if (p.baseUrl.includes("localhost") || p.modos?.includes("hospedado")) continue;
      expect(p.urlChave, p.id).toBeTruthy();
    }
  });
});

/**
 * `localhost` significa coisas diferentes dos dois lados, e essa é a diferença
 * inteira: no `gerador open` quem chama é um processo na máquina da pessoa; no
 * modo hospedado é o container do server, pra quem `localhost` é ele mesmo.
 *
 * Oferecer o preset errado não daria erro de configuração — daria "connection
 * refused" na primeira geração, com os três campos preenchidos e certos na
 * tela. É o tipo de defeito que a pessoa não tem como diagnosticar sozinha.
 */
describe("presetsDoModo — o destino tem que ser alcançável de onde a chamada sai", () => {
  it("no modo local, o Ollama oferecido é o da máquina", () => {
    const locais = presetsDoModo("local");
    expect(locais.find((p) => p.id === "ollama")?.baseUrl).toBe("http://localhost:11434/v1");
    expect(locais.some((p) => p.id === "ollama-docker")).toBe(false);
  });

  it("no modo hospedado, o Ollama oferecido é o serviço do compose", () => {
    const hospedados = presetsDoModo("hospedado");
    expect(hospedados.find((p) => p.id === "ollama-docker")?.baseUrl).toBe("http://ollama:11434/v1");
    expect(hospedados.some((p) => p.id === "ollama")).toBe(false);
  });

  it("destino na internet aparece nos dois — o endereço é o mesmo de qualquer lugar", () => {
    for (const modo of ["local", "hospedado"] as const) {
      expect(presetsDoModo(modo).map((p) => p.id), modo).toContain("anthropic");
      expect(presetsDoModo(modo).map((p) => p.id), modo).toContain("deepseek");
    }
  });

  it("nenhum modo fica sem uma opção que roda na própria infra", () => {
    // O ponto do pedido: com o Claude bloqueado na empresa, os DOIS modos
    // precisam ter um caminho que não sai da rede.
    for (const modo of ["local", "hospedado"] as const) {
      const semInternet = presetsDoModo(modo).filter((p) => p.baseUrl.startsWith("http://"));
      expect(semInternet.length, modo).toBeGreaterThan(0);
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
