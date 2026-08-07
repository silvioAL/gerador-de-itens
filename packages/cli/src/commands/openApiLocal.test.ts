import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { tratarApiLocal } from "./openApiLocal.js";

let servidor: Server;
let base: string;
let dirTemp: string;

beforeEach(async () => {
  dirTemp = mkdtempSync(join(tmpdir(), "gerador-cli-api-local-"));
  servidor = createServer((req, res) => {
    void tratarApiLocal(req, res, dirTemp).then((tratado) => {
      if (!tratado) {
        res.writeHead(404);
        res.end();
      }
    });
  });
  await new Promise<void>((resolvePromise) => servidor.listen(0, resolvePromise));
  const endereco = servidor.address();
  const porta = typeof endereco === "object" && endereco ? endereco.port : 0;
  base = `http://127.0.0.1:${porta}`;
});

afterEach(async () => {
  await new Promise<void>((resolvePromise) => servidor.close(() => resolvePromise()));
  rmSync(dirTemp, { recursive: true, force: true });
});

describe("openApiLocal (SPEC-17 — API mínima sem login/servidor pro gerador open)", () => {
  it("GET /auth/modo devolve local, e /auth/me sempre devolve uma sessão fixa (sem login nenhum)", async () => {
    const modo = await fetch(`${base}/auth/modo`).then((r) => r.json());
    expect(modo).toEqual({ modo: "local" });

    const me = await fetch(`${base}/auth/me`).then((r) => r.json());
    expect(me).toEqual({ email: "local", timeIds: ["local"] });
  });

  it("GET /quebras sem quebras/ ainda devolve lista vazia, não erro", async () => {
    const resposta = await fetch(`${base}/quebras`);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual([]);
  });

  it("POST /quebras cria um arquivo com id novo em quebras/, e GET /quebras/:id lê de volta", async () => {
    const quebra = {
      titulo: "Aprovação de crédito v2",
      time: "time-x",
      diagrama: { nodes: [{ id: "n1", type: "service" }], edges: [] },
    };
    const criada = await fetch(`${base}/quebras`, {
      method: "POST",
      body: JSON.stringify(quebra),
    }).then((r) => r.json());

    expect(criada.id).toEqual(expect.any(String));
    expect(criada.id.length).toBeGreaterThan(0);
    expect(criada.titulo).toBe("Aprovação de crédito v2");
    expect(criada.time).toBe("time-x");
    expect(criada.diagrama).toEqual(quebra.diagrama);

    const lida = await fetch(`${base}/quebras/${criada.id}`).then((r) => r.json());
    expect(lida.diagrama).toEqual(quebra.diagrama);
    expect(lida.titulo).toBe("Aprovação de crédito v2");

    const lista = await fetch(`${base}/quebras`).then((r) => r.json());
    expect(lista).toEqual([
      {
        id: criada.id,
        titulo: "Aprovação de crédito v2",
        time: "time-x",
        criadoEm: expect.any(String),
        atualizadoEm: expect.any(String),
      },
    ]);
  });

  it("duas quebras salvas em sequência (ex.: 'Nova quebra' + salvar) não se sobrescrevem — achado real", async () => {
    const primeira = await fetch(`${base}/quebras`, {
      method: "POST",
      body: JSON.stringify({ time: "a", diagrama: { nodes: [{ id: "n1", type: "service" }], edges: [] } }),
    }).then((r) => r.json());

    const segunda = await fetch(`${base}/quebras`, {
      method: "POST",
      body: JSON.stringify({ time: "b", diagrama: { nodes: [{ id: "n2", type: "service" }], edges: [] } }),
    }).then((r) => r.json());

    expect(primeira.id).not.toBe(segunda.id);

    const lista = await fetch(`${base}/quebras`).then((r) => r.json());
    expect(lista).toHaveLength(2);

    const primeiraAindaIntacta = await fetch(`${base}/quebras/${primeira.id}`).then((r) => r.json());
    expect(primeiraAindaIntacta.time).toBe("a");
  });

  it("PUT /quebras/:id sobrescreve só aquela quebra específica", async () => {
    const criada = await fetch(`${base}/quebras`, {
      method: "POST",
      body: JSON.stringify({ time: "a", diagrama: { nodes: [], edges: [] } }),
    }).then((r) => r.json());

    const atualizada = await fetch(`${base}/quebras/${criada.id}`, {
      method: "PUT",
      body: JSON.stringify({ time: "b", diagrama: { nodes: [{ id: "n1", type: "service" }], edges: [] } }),
    }).then((r) => r.json());

    expect(atualizada.id).toBe(criada.id);
    expect(atualizada.time).toBe("b");
    expect(atualizada.diagrama.nodes).toHaveLength(1);
  });

  it("PUT numa quebra inexistente devolve 404", async () => {
    const resposta = await fetch(`${base}/quebras/nao-existe`, {
      method: "PUT",
      body: JSON.stringify({ time: "a", diagrama: { nodes: [], edges: [] } }),
    });
    expect(resposta.status).toBe(404);
  });

  it("GET /perfis-time sem config/perfis-time.json devolve objeto vazio", async () => {
    const resposta = await fetch(`${base}/perfis-time`);
    expect(await resposta.json()).toEqual({});
  });

  it("PUT /perfis-time/:timeId cria/mescla valores e persiste em config/perfis-time.json", async () => {
    const bucket = await fetch(`${base}/perfis-time/time-x`, {
      method: "PUT",
      body: JSON.stringify({ tipoNo: "service", valores: { linguagem: "Java" } }),
    }).then((r) => r.json());
    expect(bucket).toEqual({ linguagem: "Java" });

    const bucket2 = await fetch(`${base}/perfis-time/time-x`, {
      method: "PUT",
      body: JSON.stringify({ tipoNo: "service", valores: { framework: "Spring" } }),
    }).then((r) => r.json());
    expect(bucket2).toEqual({ linguagem: "Java", framework: "Spring" });

    const todos = await fetch(`${base}/perfis-time`).then((r) => r.json());
    expect(todos).toEqual({ "time-x": { service: { linguagem: "Java", framework: "Spring" } } });
  });

  it("GET /campos-no sem config/campos-no.json ainda devolve lista vazia, não erro", async () => {
    expect(await fetch(`${base}/campos-no`).then((r) => r.json())).toEqual([]);
  });

  it("POST /campos-no grava em config/campos-no.json, e GET /campos-no?timeId= devolve global + o do time", async () => {
    const global = await fetch(`${base}/campos-no`, {
      method: "POST",
      body: JSON.stringify({ tipoNo: "rabbit", key: "topic", label: "Nome do tópico", type: "text" }),
    }).then((r) => r.json());
    expect(global.timeId).toBe("__global__");

    await fetch(`${base}/campos-no`, {
      method: "POST",
      body: JSON.stringify({
        timeId: "time-x",
        tipoNo: "rabbit",
        key: "topic",
        label: "Nome do tópico",
        type: "text",
        ajuda: "Sufixo .queue obrigatório",
      }),
    });

    const efetivos = await fetch(`${base}/campos-no?timeId=time-x`).then((r) => r.json());
    expect(efetivos).toHaveLength(1); // time sobrescreve o global de mesma (tipoNo, key)
    expect(efetivos[0].ajuda).toBe("Sufixo .queue obrigatório");

    const semTime = await fetch(`${base}/campos-no`).then((r) => r.json());
    expect(semTime).toHaveLength(1);
    expect(semTime[0].timeId).toBe("__global__");
  });

  it("PUT /campos-no/:id atualiza um campo existente, DELETE remove", async () => {
    const criado = await fetch(`${base}/campos-no`, {
      method: "POST",
      body: JSON.stringify({ tipoNo: "rabbit", key: "topic", label: "Nome do tópico", type: "text" }),
    }).then((r) => r.json());

    const atualizado = await fetch(`${base}/campos-no/${criado.id}`, {
      method: "PUT",
      body: JSON.stringify({ ajuda: "Sufixo .queue" }),
    }).then((r) => r.json());
    expect(atualizado.ajuda).toBe("Sufixo .queue");

    const respostaDelete = await fetch(`${base}/campos-no/${criado.id}`, { method: "DELETE" });
    expect(respostaDelete.status).toBe(204);
    expect(await fetch(`${base}/campos-no`).then((r) => r.json())).toEqual([]);
  });

  it("GET /campos-aresta sem config/campos-aresta.json ainda devolve lista vazia, não erro (SPEC-21)", async () => {
    expect(await fetch(`${base}/campos-aresta`).then((r) => r.json())).toEqual([]);
  });

  it("POST /campos-aresta grava em config/campos-aresta.json, e GET /campos-aresta?timeId= devolve global + o do time", async () => {
    const global = await fetch(`${base}/campos-aresta`, {
      method: "POST",
      body: JSON.stringify({ tipoAresta: "http", key: "timeoutMs", label: "Timeout (ms)", type: "number" }),
    }).then((r) => r.json());
    expect(global.timeId).toBe("__global__");

    await fetch(`${base}/campos-aresta`, {
      method: "POST",
      body: JSON.stringify({
        timeId: "time-x",
        tipoAresta: "http",
        key: "timeoutMs",
        label: "Timeout (ms)",
        type: "number",
        valorPadrao: "3000",
      }),
    });

    const efetivos = await fetch(`${base}/campos-aresta?timeId=time-x`).then((r) => r.json());
    expect(efetivos).toHaveLength(1); // time sobrescreve o global de mesma (tipoAresta, key)
    expect(efetivos[0].valorPadrao).toBe("3000");

    const semTime = await fetch(`${base}/campos-aresta`).then((r) => r.json());
    expect(semTime).toHaveLength(1);
    expect(semTime[0].timeId).toBe("__global__");
  });

  it("PUT /campos-aresta/:id atualiza um campo existente, DELETE remove", async () => {
    const criado = await fetch(`${base}/campos-aresta`, {
      method: "POST",
      body: JSON.stringify({ tipoAresta: "http", key: "timeoutMs", label: "Timeout (ms)", type: "number" }),
    }).then((r) => r.json());

    const atualizado = await fetch(`${base}/campos-aresta/${criado.id}`, {
      method: "PUT",
      body: JSON.stringify({ valorPadrao: "5000" }),
    }).then((r) => r.json());
    expect(atualizado.valorPadrao).toBe("5000");

    const respostaDelete = await fetch(`${base}/campos-aresta/${criado.id}`, { method: "DELETE" });
    expect(respostaDelete.status).toBe(204);
    expect(await fetch(`${base}/campos-aresta`).then((r) => r.json())).toEqual([]);
  });

  it("GET /especificacao-template sem arquivo local devolve o template padrão do engine", async () => {
    const resposta = await fetch(`${base}/especificacao-template`).then((r) => r.json());
    expect(resposta.conteudo).toContain("{{titulo}}");
  });

  it("PUT /especificacao-template grava config/especificacao-template.md, e GET lê de volta", async () => {
    await fetch(`${base}/especificacao-template`, {
      method: "PUT",
      body: JSON.stringify({ conteudo: "# {{titulo}} customizado" }),
    });

    const resposta = await fetch(`${base}/especificacao-template`).then((r) => r.json());
    expect(resposta.conteudo).toBe("# {{titulo}} customizado");
  });

  it("/times e /convites devolvem 501 — sem conceito de múltiplos times no modo local", async () => {
    expect((await fetch(`${base}/times`, { method: "POST", body: "{}" })).status).toBe(501);
    expect((await fetch(`${base}/convites/abc/aceitar`, { method: "POST" })).status).toBe(501);
  });

  it("uma rota fora da API conhecida (ex.: uma rota de página do app) não é tratada — cai no fallback estático de open.ts", async () => {
    const resposta = await fetch(`${base}/alguma-rota-da-spa`);
    expect(resposta.status).toBe(404); // 404 vem do fallback do teste (sem tratarApiLocal, não do open.ts real)
  });

  it("perfis-time preservam times já existentes ao atualizar outro time", async () => {
    mkdirSync(join(dirTemp, "config"), { recursive: true });
    writeFileSync(
      join(dirTemp, "config", "perfis-time.json"),
      JSON.stringify({ "time-a": { service: { linguagem: "Go" } } })
    );

    await fetch(`${base}/perfis-time/time-b`, {
      method: "PUT",
      body: JSON.stringify({ tipoNo: "service", valores: { linguagem: "Python" } }),
    });

    const todos = await fetch(`${base}/perfis-time`).then((r) => r.json());
    expect(todos).toEqual({
      "time-a": { service: { linguagem: "Go" } },
      "time-b": { service: { linguagem: "Python" } },
    });
  });
});
