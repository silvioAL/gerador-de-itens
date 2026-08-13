import { describe, expect, it, vi } from "vitest";
import { criarCofreInfisical, opcoesDoAmbiente } from "./cofreInfisical.js";

/**
 * SPEC-54 — o adaptador do Infisical. Sem o cofre de verdade aqui: o que se
 * testa é o CONTRATO (quais chamadas saem, com que corpo) e, principalmente, o
 * modo de falhar — ausência precisa ser distinguível de indisponibilidade.
 */
const OPCOES = {
  apiUrl: "http://infisical:8080",
  clientId: "id",
  clientSecret: "segredo",
  projectId: "proj-1",
  ambiente: "prod",
};

/** Responde o login e depois cada resposta da fila, na ordem. */
function fetchFalso(respostas: { status: number; json?: unknown }[]) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const impl = vi.fn(async (url: string, init: RequestInit = {}) => {
    chamadas.push({ url, init });
    if (url.includes("/auth/universal-auth/login")) {
      return { ok: true, status: 200, json: async () => ({ accessToken: "tok", expiresIn: 3600 }) } as Response;
    }
    const r = respostas[i++] ?? { status: 500 };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json ?? {} } as Response;
  });
  return { impl: impl as unknown as typeof fetch, chamadas };
}

describe("cofreInfisical (SPEC-54)", () => {
  it("autentica UMA vez e reusa o token — login por leitura de chave seria uma requisição a mais em cada geração", async () => {
    const { impl, chamadas } = fetchFalso([
      { status: 200, json: { secret: { secretValue: "sk-1" } } },
      { status: 200, json: { secret: { secretValue: "sk-1" } } },
    ]);
    const cofre = criarCofreInfisical({ ...OPCOES, fetchImpl: impl });

    await cofre.ler("GERADOR_IA_GATEWAY");
    await cofre.ler("GERADOR_IA_GATEWAY");

    expect(chamadas.filter((c) => c.url.includes("/auth/universal-auth/login"))).toHaveLength(1);
  });

  it("ler devolve o valor, com projeto/ambiente/caminho na query", async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200, json: { secret: { secretValue: "sk-secreta" } } }]);
    const cofre = criarCofreInfisical({ ...OPCOES, fetchImpl: impl });

    expect(await cofre.ler("GERADOR_IA_GATEWAY")).toBe("sk-secreta");
    const leitura = chamadas.at(-1)!;
    expect(leitura.url).toContain("/api/v3/secrets/raw/GERADOR_IA_GATEWAY");
    expect(leitura.url).toContain("workspaceId=proj-1");
    expect(leitura.url).toContain("environment=prod");
    expect((leitura.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("404 é AUSÊNCIA (null); 500 é falha e SOBE — confundir os dois apagaria a chave de quem a tem", async () => {
    const semSegredo = criarCofreInfisical({ ...OPCOES, fetchImpl: fetchFalso([{ status: 404 }]).impl });
    expect(await semSegredo.ler("X")).toBeNull();

    const quebrado = criarCofreInfisical({ ...OPCOES, fetchImpl: fetchFalso([{ status: 500 }]).impl });
    await expect(quebrado.ler("X")).rejects.toThrow("HTTP 500");
  });

  it("gravar tenta ATUALIZAR primeiro — rotação é o caso comum, e resolve em uma chamada", async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200 }]);
    await criarCofreInfisical({ ...OPCOES, fetchImpl: impl }).gravar("GERADOR_IA_GATEWAY", "sk-nova");

    const escrita = chamadas.at(-1)!;
    expect(escrita.init.method).toBe("PATCH");
    expect(JSON.parse(escrita.init.body as string)).toMatchObject({
      workspaceId: "proj-1",
      environment: "prod",
      secretValue: "sk-nova",
    });
  });

  it("segredo que ainda não existe: o PATCH volta 404 e ele é CRIADO", async () => {
    const { impl, chamadas } = fetchFalso([{ status: 404 }, { status: 200 }]);
    await criarCofreInfisical({ ...OPCOES, fetchImpl: impl }).gravar("GERADOR_IA_GATEWAY", "sk-primeira");

    const metodos = chamadas.filter((c) => c.url.includes("/secrets/raw/")).map((c) => c.init.method);
    expect(metodos).toEqual(["PATCH", "POST"]);
  });

  it("cofre inalcançável vira erro com motivo legível, não 'undefined is not a function'", async () => {
    const impl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 172.18.0.9:8080");
    }) as unknown as typeof fetch;

    await expect(criarCofreInfisical({ ...OPCOES, fetchImpl: impl }).ler("X")).rejects.toThrow(
      /não consegui falar com o cofre/
    );
  });

  it("identidade recusada diz o que conferir — 401 aqui é erro de configuração, não de código", async () => {
    const impl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(criarCofreInfisical({ ...OPCOES, fetchImpl: impl }).ler("X")).rejects.toThrow(/INFISICAL_CLIENT_ID/);
  });

  it("apagar o que não existe é sucesso — a porta promete idempotência", async () => {
    const cofre = criarCofreInfisical({ ...OPCOES, fetchImpl: fetchFalso([{ status: 404 }]).impl });
    await expect(cofre.apagar("X")).resolves.toBeUndefined();
  });
});

describe("opcoesDoAmbiente (SPEC-54 §3.2)", () => {
  it("sem INFISICAL_* é `null` — ausência de cofre não é erro, é o modo de hoje", () => {
    expect(opcoesDoAmbiente({})).toBeNull();
    expect(opcoesDoAmbiente({ INFISICAL_API_URL: "http://x" })).toBeNull();
  });

  it("com tudo configurado, normaliza a URL e assume `prod` quando o ambiente não vem", () => {
    const opcoes = opcoesDoAmbiente({
      INFISICAL_API_URL: "http://infisical:8080/",
      INFISICAL_CLIENT_ID: "id",
      INFISICAL_CLIENT_SECRET: "segredo",
      INFISICAL_PROJECT_ID: "proj",
    });
    expect(opcoes).toMatchObject({ apiUrl: "http://infisical:8080", ambiente: "prod", caminho: "/" });
  });
});
