import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mockado pra /ia/sugerir não depender do binário nativo + modelo real em CI
// (mesma disciplina de ia.test.ts) — e pra poder testar o caminho 503 (modelos
// não instalados) de forma determinística, sem depender do estado real da
// máquina que roda o teste.
const verificarStatusMock = vi.fn(async () => ({
  chatInstalado: false,
  embeddingInstalado: false,
  pronto: false,
  caminhoModelos: "/fake/models",
}));
// Instância única (não recriada a cada chamada de carregarModeloChatMock) pra
// dar pra inspecionar o prompt de verdade recebido em `completar` (Fase 1b,
// SPEC-23 — assert de que o contexto do épico chega no prompt) e simular
// streaming de verdade via `onTexto` (Fase 1c — /ia/sugerir virou texto
// livre em pedaços, não mais JSON via completarComSchema).
const PEDACOS_SUGESTAO = ["sugestão", " de", " teste"];
const completarMock = vi.fn(async (_prompt: string, opcoes?: { onTexto?: (p: string) => void }) => {
  for (const pedaco of PEDACOS_SUGESTAO) {
    opcoes?.onTexto?.(pedaco);
    // Achado real: sem um yield entre os `res.write()`, o socket local
    // coalesce os pedaços num único read() do lado do cliente (localhost sem
    // I/O real entre eles) — o teste de streaming (abaixo) precisava disso
    // pra provar mais de um pedaço chegando de verdade, não só um corpo
    // inteiro escrito de uma vez.
    await new Promise((r) => setTimeout(r, 5));
  }
  return PEDACOS_SUGESTAO.join("");
});
// SPEC-24 — /ia/pipeline/:papel usa completarComSchema (GBNF), não completar
// (texto livre): mock devolve um valor por chave recebida no schema, pra
// simular o comportamento real de "resposta sempre bate com o schema
// pedido" sem depender do binário nativo em CI.
const completarComSchemaMock = vi.fn(async (_prompt: string, schema: { properties?: Record<string, unknown> }) => {
  const chaves = Object.keys(schema.properties ?? {});
  return Object.fromEntries(chaves.map((chave) => [chave, `resposta gerada pra ${chave}`]));
});
const carregarModeloChatMock = vi.fn(async () => ({
  completar: completarMock,
  completarComSchema: completarComSchemaMock,
  descartar: vi.fn(async () => {}),
}));
vi.mock("@gerador/llm", async () => {
  const real = await vi.importActual<typeof import("@gerador/llm")>("@gerador/llm");
  return { ...real, verificarStatus: verificarStatusMock, carregarModeloChat: carregarModeloChatMock };
});

const { tratarApiLocal } = await import("./openApiLocal.js");

let servidor: Server;
let base: string;
let dirTemp: string;

beforeEach(async () => {
  verificarStatusMock.mockClear();
  carregarModeloChatMock.mockClear();
  completarMock.mockClear();
  completarComSchemaMock.mockClear();
  verificarStatusMock.mockResolvedValue({
    chatInstalado: false,
    embeddingInstalado: false,
    pronto: false,
    caminhoModelos: "/fake/models",
  });
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

  it("achado real: GET /versao devolve a versão de package.json — usuário não tinha como saber se o npm install pegou a versão nova", async () => {
    const resposta = await fetch(`${base}/versao`);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.versao).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("GET /ia/status devolve o mesmo formato de verificarStatus() (SPEC-23 Fase 0)", async () => {
    const resposta = await fetch(`${base}/ia/status`);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(typeof corpo.chatInstalado).toBe("boolean");
    expect(typeof corpo.embeddingInstalado).toBe("boolean");
    expect(typeof corpo.pronto).toBe("boolean");
    expect(typeof corpo.caminhoModelos).toBe("string");
  });

  it("POST /ia/sugerir sem modelos instalados devolve 503, não tenta carregar o modelo (Fase 1, SPEC-23)", async () => {
    const resposta = await fetch(`${base}/ia/sugerir`, {
      method: "POST",
      body: JSON.stringify({ tech: "Backend", rotulo: "DLQ configurada e monitorada", contextoNo: "fila rabbitmq" }),
    });
    expect(resposta.status).toBe(503);
    expect(carregarModeloChatMock).not.toHaveBeenCalled();
  });

  it("POST /ia/sugerir: falha do motor devolve 500 tratado e reseta o singleton; sucesso seguinte carrega e reusa (Fase 1, SPEC-23)", async () => {
    // Tudo num teste só, nessa ordem — `motorChatSingleton` é estado de
    // módulo, não resetado entre `it()`; testar essas fases em blocos
    // separados dependeria da ordem de execução e quebraria uma dependendo
    // do estado deixado pela outra.
    verificarStatusMock.mockResolvedValue({
      chatInstalado: true,
      embeddingInstalado: true,
      pronto: true,
      caminhoModelos: "/fake/models",
    });

    // 1) Achado real: sem try/catch em tratarIaSugerir, essa rejeição virava
    // rejeição não tratada e derrubava o processo INTEIRO do `gerador open`
    // (open.ts chama tratarApiLocal sem try/catch no request handler) — não
    // só essa requisição.
    carregarModeloChatMock.mockRejectedValueOnce(new Error("binário nativo bloqueado"));
    const falha = await fetch(`${base}/ia/sugerir`, {
      method: "POST",
      body: JSON.stringify({ tech: "Backend", rotulo: "DLQ configurada e monitorada", contextoNo: "fila rabbitmq" }),
    });
    expect(falha.status).toBe(500);
    expect((await falha.json()).erro).toContain("binário nativo bloqueado");

    // 2) Servidor continua respondendo normalmente depois da falha — processo sobreviveu.
    expect((await fetch(`${base}/ia/status`)).status).toBe(200);

    // 3) Singleton foi descartado na falha: a chamada seguinte tenta carregar
    // de novo (sem precisar reiniciar `gerador open` pra tentar depois de
    // corrigir o ambiente) — e dessa vez o mock resolve normalmente.
    const primeira = await fetch(`${base}/ia/sugerir`, {
      method: "POST",
      body: JSON.stringify({ tech: "Backend", rotulo: "DLQ configurada e monitorada", contextoNo: "fila rabbitmq" }),
    });
    expect(primeira.status).toBe(200);
    expect(primeira.headers.get("content-type")).toContain("text/plain");
    expect(await primeira.text()).toBe("sugestão de teste");

    // 4) Chamada seguinte reusa o motor já carregado — nenhuma chamada nova a carregarModeloChat.
    await fetch(`${base}/ia/sugerir`, {
      method: "POST",
      body: JSON.stringify({ tech: "Backend", rotulo: "outro requisito", contextoNo: "" }),
    });

    // 2 chamadas totais a carregarModeloChat: a que falhou (passo 1) + a que carregou de verdade (passo 3).
    expect(carregarModeloChatMock).toHaveBeenCalledTimes(2);
  });

  it("POST /ia/sugerir inclui o contexto do épico no prompt quando presente (Fase 1b, SPEC-23)", async () => {
    verificarStatusMock.mockResolvedValue({
      chatInstalado: true,
      embeddingInstalado: true,
      pronto: true,
      caminhoModelos: "/fake/models",
    });

    await fetch(`${base}/ia/sugerir`, {
      method: "POST",
      body: JSON.stringify({
        tech: "Backend",
        rotulo: "DLQ configurada e monitorada",
        contextoNo: "fila rabbitmq",
        contextoEpico: "Épico: reduzir tempo de aprovação de crédito de 3 dias pra 1 hora.",
      }),
    });

    const prompt = completarMock.mock.calls.at(-1)?.[0] as string;
    expect(prompt).toContain("Épico: reduzir tempo de aprovação de crédito de 3 dias pra 1 hora.");

    // Sem contextoEpico, o prompt não menciona a seção — não inventa contexto vazio.
    await fetch(`${base}/ia/sugerir`, {
      method: "POST",
      body: JSON.stringify({ tech: "Backend", rotulo: "outro requisito", contextoNo: "" }),
    });
    const promptSemEpico = completarMock.mock.calls.at(-1)?.[0] as string;
    expect(promptSemEpico).not.toContain("Contexto geral da demanda/épico");
  });

  it("POST /ia/sugerir transmite em pedaços de verdade, não um JSON de uma vez só (Fase 1c, SPEC-23)", async () => {
    verificarStatusMock.mockResolvedValue({
      chatInstalado: true,
      embeddingInstalado: true,
      pronto: true,
      caminhoModelos: "/fake/models",
    });

    const resposta = await fetch(`${base}/ia/sugerir`, {
      method: "POST",
      body: JSON.stringify({ tech: "Backend", rotulo: "DLQ configurada e monitorada", contextoNo: "fila rabbitmq" }),
    });
    expect(resposta.headers.get("content-type")).toContain("text/plain");

    const leitor = resposta.body!.getReader();
    const decoder = new TextDecoder();
    const pedacosRecebidos: string[] = [];
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      pedacosRecebidos.push(decoder.decode(value));
    }
    // Mais de um `res.write()` chegou como mais de um pedaço no cliente —
    // prova real de streaming, não só um corpo JSON completo de uma vez.
    expect(pedacosRecebidos.length).toBeGreaterThan(1);
    expect(pedacosRecebidos.join("")).toBe("sugestão de teste");
  });

  it("POST /ia/pipeline/:papel sem modelos instalados devolve 503 (SPEC-24 Fase B)", async () => {
    const resposta = await fetch(`${base}/ia/pipeline/po`, {
      method: "POST",
      body: JSON.stringify({
        atividadeRotulo: "x",
        contextoNo: "",
        placeholders: [{ chave: "_historiaUsuario", tech: "", rotulo: "História de usuário" }],
      }),
    });
    expect(resposta.status).toBe(503);
    expect(carregarModeloChatMock).not.toHaveBeenCalled();
  });

  it("POST /ia/pipeline/:papel sem placeholders devolve 400 (SPEC-24 Fase B)", async () => {
    verificarStatusMock.mockResolvedValue({
      chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "/fake/models",
    });
    const resposta = await fetch(`${base}/ia/pipeline/po`, {
      method: "POST",
      body: JSON.stringify({ atividadeRotulo: "x", contextoNo: "", placeholders: [] }),
    });
    expect(resposta.status).toBe(400);
  });

  it("POST /ia/pipeline/po usa o preâmbulo do PO, monta schema dinâmico e devolve Record<chave,string> (SPEC-24 Fase B)", async () => {
    verificarStatusMock.mockResolvedValue({
      chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "/fake/models",
    });

    const resposta = await fetch(`${base}/ia/pipeline/po`, {
      method: "POST",
      body: JSON.stringify({
        atividadeRotulo: "srv-checkout publica em fila-pedidos",
        contextoNo: "fila rabbitmq",
        contextoEpico: "Épico: reduzir tempo de aprovação de crédito de 3 dias pra 1 hora.",
        placeholders: [
          { chave: "_historiaUsuario", tech: "", rotulo: "História de usuário" },
          { chave: "_criteriosAceite", tech: "", rotulo: "Critérios de aceite" },
        ],
      }),
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      _historiaUsuario: "resposta gerada pra _historiaUsuario",
      _criteriosAceite: "resposta gerada pra _criteriosAceite",
    });

    const [prompt, schema] = completarComSchemaMock.mock.calls.at(-1) as [string, { properties: Record<string, unknown>; required: string[] }];
    expect(prompt).toContain("Product Owner");
    expect(prompt).toContain("Épico: reduzir tempo de aprovação de crédito de 3 dias pra 1 hora.");
    expect(prompt).toContain("srv-checkout publica em fila-pedidos");
    expect(Object.keys(schema.properties)).toEqual(["_historiaUsuario", "_criteriosAceite"]);
  });

  it("POST /ia/pipeline/arquiteto usa o preâmbulo do Arquiteto — prompt diferente do PO pro mesmo item (SPEC-24 Fase B)", async () => {
    verificarStatusMock.mockResolvedValue({
      chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "/fake/models",
    });

    await fetch(`${base}/ia/pipeline/arquiteto`, {
      method: "POST",
      body: JSON.stringify({
        atividadeRotulo: "srv-checkout publica em fila-pedidos",
        contextoNo: "fila rabbitmq",
        placeholders: [{ chave: "_contratoRequest", tech: "", rotulo: "Request" }],
      }),
    });

    const [prompt] = completarComSchemaMock.mock.calls.at(-1) as [string];
    expect(prompt).toContain("Arquiteto");
    expect(prompt).not.toContain("Product Owner");
  });

  it("POST /ia/pipeline/:papel com papel desconhecido usa o preâmbulo genérico, não devolve erro (SPEC-24 Fase B — pipeline configurável)", async () => {
    verificarStatusMock.mockResolvedValue({
      chatInstalado: true, embeddingInstalado: true, pronto: true, caminhoModelos: "/fake/models",
    });

    const resposta = await fetch(`${base}/ia/pipeline/agente-custom`, {
      method: "POST",
      body: JSON.stringify({
        atividadeRotulo: "x",
        contextoNo: "",
        placeholders: [{ chave: "_historiaUsuario", tech: "", rotulo: "História de usuário" }],
      }),
    });
    expect(resposta.status).toBe(200);
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

  it("demandInfo e anexosContexto sobrevivem a salvar+recarregar (Fase 1b, SPEC-23 — achado real: GET não devolvia esses campos)", async () => {
    const quebra = {
      titulo: "Aprovação de crédito v3",
      time: "time-x",
      diagrama: { nodes: [], edges: [] },
      demandInfo: "Épico: reduzir tempo de aprovação de crédito de 3 dias pra 1 hora.",
      anexosContexto: [{ nome: "retro.md", conteudo: "Retro anterior: SLA estourava por falta de dado do bureau." }],
    };
    const criada = await fetch(`${base}/quebras`, {
      method: "POST",
      body: JSON.stringify(quebra),
    }).then((r) => r.json());

    expect(criada.demandInfo).toBe(quebra.demandInfo);
    expect(criada.anexosContexto).toEqual(quebra.anexosContexto);

    const lida = await fetch(`${base}/quebras/${criada.id}`).then((r) => r.json());
    expect(lida.demandInfo).toBe(quebra.demandInfo);
    expect(lida.anexosContexto).toEqual(quebra.anexosContexto);
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
