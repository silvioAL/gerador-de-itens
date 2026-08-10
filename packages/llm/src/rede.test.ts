import { describe, expect, it } from "vitest";
import { detectarProxy, explicarFalhaDeRede, proxyIgnoradoPara } from "./rede.js";

/**
 * O defeito que estes testes protegem não é de rede — é de DIAGNÓSTICO. O
 * usuário recebeu `fetch failed` e a conclusão (errada) foi "a rede bloqueia o
 * Hugging Face"; isso levou a construir um caminho inteiro por npm antes de
 * alguém olhar o `error.cause`. Mensagem ruim custa mais que bug.
 */
const URL_HF = "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/x.gguf";

function falha(code: string): Error {
  const e = new Error("fetch failed");
  (e as Error & { cause?: unknown }).cause = { code, message: `detalhe de ${code}` };
  return e;
}

describe("detectarProxy", () => {
  it("prefere HTTPS_PROXY, e diz de qual variável veio", () => {
    // "de qual variável veio" não é firula: quem vai corrigir precisa saber
    // qual mexer, e numa máquina corporativa costuma haver mais de uma.
    const p = detectarProxy({ HTTPS_PROXY: "http://p:8080", HTTP_PROXY: "http://outro:3128" });
    expect(p).toEqual({ url: "http://p:8080", origem: "HTTPS_PROXY" });
  });

  it("aceita a config do npm — quem já configurou pro npm não configura de novo", () => {
    expect(detectarProxy({ npm_config_https_proxy: "http://p:8080" })?.origem).toBe("npm_config_https_proxy");
  });

  it("sem proxy nenhum, não inventa", () => {
    expect(detectarProxy({})).toBeUndefined();
  });
});

describe("proxyIgnoradoPara (NO_PROXY)", () => {
  it("respeita o host exato", () => {
    expect(proxyIgnoradoPara(URL_HF, { NO_PROXY: "huggingface.co" })).toBe(true);
  });

  it("respeita sufixo de domínio", () => {
    expect(proxyIgnoradoPara(URL_HF, { NO_PROXY: ".co" })).toBe(true);
  });

  it("não confunde host diferente", () => {
    expect(proxyIgnoradoPara(URL_HF, { NO_PROXY: "registry.npmjs.org" })).toBe(false);
  });
});

describe("explicarFalhaDeRede — a mensagem que faltava", () => {
  it("DNS é dito como DNS, não como bloqueio", () => {
    const m = explicarFalhaDeRede(falha("ENOTFOUND"), URL_HF, {}).message;
    expect(m).toContain("huggingface.co");
    expect(m).toContain("DNS");
    expect(m).not.toContain("fetch failed");
  });

  it("com proxy, o ENOTFOUND aponta o PROXY — não o destino", () => {
    // Achado da validação real: com proxy configurado, a conexão nem chega a
    // tentar o Hugging Face; quem não resolveu foi o proxy. Culpar o destino
    // manda a pessoa investigar a caixa errada.
    const m = explicarFalhaDeRede(falha("ENOTFOUND"), URL_HF, { HTTPS_PROXY: "http://proxy-inexistente:8080" }).message;
    expect(m).toContain("proxy-inexistente");
    expect(m).not.toContain("resolver huggingface.co");
  });

  it("sem proxy configurado, explica POR QUE o npm funciona e isto não", () => {
    // Este é o insight que destrava a pessoa: mesma rede, mesmo destino,
    // clientes diferentes. Sem essa frase, "fetch failed" parece bloqueio.
    const m = explicarFalhaDeRede(falha("UND_ERR_CONNECT_TIMEOUT"), URL_HF, {}).message;
    expect(m).toContain("HTTPS_PROXY");
    expect(m).toContain("npm honra proxy");
  });

  it("com proxy configurado, diz qual está em uso — senão a pessoa mexe no lugar errado", () => {
    const m = explicarFalhaDeRede(falha("ECONNREFUSED"), URL_HF, { HTTPS_PROXY: "http://p:8080" }).message;
    expect(m).toContain("http://p:8080");
    expect(m).not.toContain("Nenhum proxy configurado");
  });

  it("certificado aponta inspeção TLS e a saída mais barata primeiro", () => {
    // ACHADO REAL na máquina do usuário: era exatamente isto — nem bloqueio,
    // nem proxy. A rede reassina o HTTPS com uma CA da empresa. E é a
    // explicação final do "npm funciona, download não": o npm usa o
    // repositório do Windows, o Node não.
    //
    // `--use-system-ca` vem primeiro porque resolve com UMA variável, usando a
    // CA já instalada; NODE_EXTRA_CA_CERTS exige caçar e exportar um .pem, que
    // é onde a maioria desiste. (Node de teste é 20+; em 22.15+ a flag existe.)
    const m = explicarFalhaDeRede(falha("SELF_SIGNED_CERT_IN_CHAIN"), URL_HF, {}).message;
    expect(m).toContain("inspeção TLS");
    expect(m).toMatch(/--use-system-ca|NODE_EXTRA_CA_CERTS/);
  });

  it("erro desconhecido ainda oferece a saída sem rede", () => {
    const m = explicarFalhaDeRede(falha("EQUALQUERCOISA"), URL_HF, {}).message;
    expect(m).toContain("--de <caminho do .gguf>");
  });
});
