import { describe, expect, it } from "vitest";
import { executarFluxo } from "./fluxos.js";
import { normalizarFluxos } from "../config/fluxos.js";

function fluxoDe(nos: unknown[], arestas: unknown[]) {
  return normalizarFluxos({ fluxos: [{ id: "f", nos, arestas }] }).fluxos[0];
}

/** Os testes sem nó de função/projeto declaram executores que nunca rodam —
 * chamar é defeito de despacho, não fixture faltando. */
const semFuncao = {
  funcao: async (): Promise<Record<string, unknown>> => {
    throw new Error("não há nó de função neste teste");
  },
  projeto: async (): Promise<Record<string, unknown>> => {
    throw new Error("não há nó de projeto neste teste");
  },
  transformacao: async (): Promise<Record<string, unknown>> => {
    throw new Error("não há nó de transformação neste teste");
  },
  // SPEC-110 fatia J — o stub RECUSA em vez de devolver vazio: um subfluxo
  // que "roda" sem executor seria um verde que não prova nada.
  subfluxo: async (): Promise<Record<string, unknown>> => {
    throw new Error("não há nó de subfluxo neste teste");
  },
};

const JMETER = fluxoDe(
  [
    { id: "volumetria", tipo: "conector", refId: "volumetria-dynatrace" },
    { id: "gerador", tipo: "agente", refId: "especialista" },
    { id: "commit", tipo: "conector", refId: "repo" },
  ],
  [
    { de: "volumetria", para: "gerador", mapeamento: [{ saida: "rps", entrada: "volumetria" }] },
    { de: "gerador", para: "commit", mapeamento: [{ saida: "texto", entrada: "arquivo" }] },
  ]
);

describe("executarFluxo (SPEC-105 fatia D — a metade pura)", () => {
  it("o exemplo do JMeter (§4.2): a saída de um alimenta a entrada do outro", async () => {
    const chamadas: Record<string, unknown>[] = [];
    const resultado = await executarFluxo(JMETER, {
      ...semFuncao,
      conector: async (no, parametros) => {
        chamadas.push({ no: no.id, parametros });
        return no.id === "volumetria" ? { rps: 120, pico: 340 } : { linkExterno: "https://repo/x" };
      },
      agente: async (_no, entradas) => {
        chamadas.push({ no: "gerador", entradas });
        return { texto: `<jmeterTestPlan rps="${entradas.volumetria}"/>` };
      },
    });

    expect(resultado.nos.map((n) => [n.noId, n.estado])).toEqual([
      ["volumetria", "sucesso"],
      ["gerador", "sucesso"],
      ["commit", "sucesso"],
    ]);
    // O `rps` do conector virou `volumetria` do agente; o `texto` do agente
    // virou `arquivo` do commit — é o mapeamento carregando dado, não ordem.
    expect(chamadas[1]).toEqual({ no: "gerador", entradas: { volumetria: 120 } });
    expect(chamadas[2]).toEqual({ no: "commit", parametros: { arquivo: '<jmeterTestPlan rps="120"/>' } });
  });

  it("§9.3 — o nó que falha para o RAMO; o independente segue", async () => {
    const fluxo = fluxoDe(
      [
        { id: "quebra", tipo: "conector", refId: "c1" },
        { id: "dependente", tipo: "agente", refId: "p" },
        { id: "neto", tipo: "conector", refId: "c2" },
        { id: "independente", tipo: "conector", refId: "c3" },
      ],
      [
        { de: "quebra", para: "dependente", mapeamento: [{ saida: "x", entrada: "x" }] },
        { de: "dependente", para: "neto", mapeamento: [{ saida: "y", entrada: "y" }] },
      ]
    );

    const resultado = await executarFluxo(fluxo, {
      ...semFuncao,
      conector: async (no) => {
        if (no.id === "quebra") throw new Error("HTTP 500 do outro lado");
        return { ok: true };
      },
      agente: async () => ({ texto: "nunca deveria rodar" }),
    });

    const porNo = Object.fromEntries(resultado.nos.map((n) => [n.noId, n]));
    expect(porNo.quebra.estado).toBe("falhou");
    expect(porNo.quebra.erro).toContain("HTTP 500");
    // Dependentes NÃO rodam — entrada ausente nunca vira default — e o rastro
    // aponta a origem, não o nó inocente.
    expect(porNo.dependente.estado).toBe("nao-executado");
    expect(porNo.dependente.erro).toContain('"quebra" falhou');
    expect(porNo.neto.estado).toBe("nao-executado");
    expect(porNo.neto.erro).toContain('"dependente" não rodou');
    // O ramo independente seguiu: derrubar tudo perderia trabalho bom.
    expect(porNo.independente.estado).toBe("sucesso");
  });

  it("`ateNo` roda só o fecho de ancestrais — o resto nem dispara", async () => {
    // "Ver o resultado de um agente antes de rodar o próximo": o commit (que
    // AGE no mundo) não pode disparar quando só se quer inspecionar o meio.
    const chamados: string[] = [];
    const resultado = await executarFluxo(
      JMETER,
      {
        ...semFuncao,
        conector: async (no) => {
          chamados.push(no.id);
          return { rps: 120 };
        },
        agente: async () => {
          chamados.push("gerador");
          return { texto: "jmx" };
        },
      },
      { ateNo: "gerador" }
    );

    expect(chamados).toEqual(["volumetria", "gerador"]);
    expect(resultado.nos.map((n) => n.noId)).toEqual(["volumetria", "gerador"]);
    expect(resultado.saidas.commit).toBeUndefined();
  });

  it("§5.5 — o GATE suspende: quem escreve no mundo não dispara, e o rastro diz onde parou", async () => {
    // `pausarDepois: true` DE PROPÓSITO: fluxo salvo antes da fatia C precisa
    // continuar parando — a normalização o lê como `confirmacao: "aguardar"`.
    const fluxo = fluxoDe(
      [
        { id: "le", tipo: "conector", refId: "c1" },
        { id: "gera", tipo: "agente", refId: "p", pausarDepois: true },
        { id: "publica", tipo: "conector", refId: "c2" },
      ],
      [
        { de: "le", para: "gera", mapeamento: [{ saida: "conteudo", entrada: "contexto" }] },
        { de: "gera", para: "publica", mapeamento: [{ saida: "texto", entrada: "markdown" }] },
      ]
    );
    expect(fluxo.nos.find((n) => n.id === "gera")?.confirmacao).toBe("aguardar");

    const chamados: string[] = [];
    const resultado = await executarFluxo(fluxo, {
      ...semFuncao,
      conector: async (no) => {
        chamados.push(no.id);
        return { conteudo: "x" };
      },
      agente: async () => ({ texto: "artefato" }),
    });

    expect(chamados).toEqual(["le"]);
    expect(resultado.aguardandoEm).toBe("gera");
    // O que está esperando fica FORA do rastro: não falhou nem foi pulado.
    expect(resultado.nos.map((n) => n.noId)).toEqual(["le", "gera"]);
    expect(resultado.saidas.gera).toEqual({ texto: "artefato" });
  });

  it("§5.5 — a retomada continua do PONTO EXATO: os concluídos não rodam de novo", async () => {
    const fluxo = fluxoDe(
      [
        { id: "le", tipo: "conector", refId: "c1" },
        { id: "gera", tipo: "agente", refId: "p", confirmacao: "aguardar" },
        { id: "publica", tipo: "conector", refId: "c2" },
      ],
      [
        { de: "le", para: "gera", mapeamento: [{ saida: "conteudo", entrada: "contexto" }] },
        { de: "gera", para: "publica", mapeamento: [{ saida: "texto", entrada: "markdown" }] },
      ]
    );
    const chamados: string[] = [];
    const resultado = await executarFluxo(
      fluxo,
      {
        ...semFuncao,
        conector: async (no, parametros) => {
          chamados.push(no.id);
          return no.id === "publica" ? { linkExterno: `publicado:${parametros.markdown}` } : { conteudo: "x" };
        },
        agente: async () => {
          chamados.push("gera");
          return { texto: "nunca deveria rodar de novo" };
        },
      },
      { retomarDe: { saidas: { le: { conteudo: "x" }, gera: { texto: "artefato revisado" } }, concluidos: ["le", "gera"] } }
    );

    // Só o que faltava rodou — e com a SAÍDA persistida da suspensão, não uma
    // reexecução do agente (que poderia dar outro texto).
    expect(chamados).toEqual(["publica"]);
    expect(resultado.aguardandoEm).toBeUndefined();
    expect(resultado.nos.map((n) => [n.noId, n.estado])).toEqual([["publica", "sucesso"]]);
    expect(resultado.saidas.publica.linkExterno).toBe("publicado:artefato revisado");
  });

  it("§5.5 — dois gates são dois pontos de revisão: a retomada suspende de novo no seguinte", async () => {
    const fluxo = fluxoDe(
      [
        { id: "a", tipo: "conector", refId: "c1", confirmacao: "aguardar" },
        { id: "b", tipo: "conector", refId: "c2", confirmacao: "aguardar" },
        { id: "c", tipo: "conector", refId: "c3" },
      ],
      [
        { de: "a", para: "b", mapeamento: [{ saida: "x", entrada: "x" }] },
        { de: "b", para: "c", mapeamento: [{ saida: "x", entrada: "x" }] },
      ]
    );
    const executores = {
      ...semFuncao,
      conector: async () => ({ x: 1 }),
      agente: async () => ({}),
    };
    const primeira = await executarFluxo(fluxo, executores);
    expect(primeira.aguardandoEm).toBe("a");

    const segunda = await executarFluxo(fluxo, executores, {
      retomarDe: { saidas: primeira.saidas, concluidos: ["a"] },
    });
    expect(segunda.aguardandoEm).toBe("b");
    expect(segunda.nos.map((n) => n.noId)).toEqual(["b"]);
  });

  it("SPEC-107 fatia D — os eventos ao vivo saem na ordem da execução, inclusive na falha", async () => {
    const eventos: string[] = [];
    const fluxo = fluxoDe(
      [
        { id: "quebra", tipo: "conector", refId: "c1" },
        { id: "dependente", tipo: "agente", refId: "p" },
      ],
      [{ de: "quebra", para: "dependente", mapeamento: [{ saida: "x", entrada: "x" }] }]
    );
    await executarFluxo(
      fluxo,
      {
        ...semFuncao,
        conector: async () => {
          throw new Error("caiu");
        },
        agente: async () => ({ texto: "nunca roda" }),
      },
      {
        aoVivo: {
          noComecou: (no) => eventos.push(`comecou:${no.id}`),
          noTerminou: (rastro) => eventos.push(`terminou:${rastro.noId}:${rastro.estado}`),
        },
      }
    );
    // O vivo é feedback (§2.4-9): quem assiste vê o nó começar, falhar, e o
    // dependente cair SEM ter começado — na ordem em que aconteceu.
    expect(eventos).toEqual(["comecou:quebra", "terminou:quebra:falhou", "terminou:dependente:nao-executado"]);
  });

  it("ciclo nem começa — recusa, não falha parcial", async () => {
    const fluxo = fluxoDe(
      [
        { id: "a", tipo: "conector", refId: "c" },
        { id: "b", tipo: "conector", refId: "c" },
      ],
      [
        { de: "a", para: "b", mapeamento: [] },
        { de: "b", para: "a", mapeamento: [] },
      ]
    );
    const resultado = await executarFluxo(fluxo, {
      ...semFuncao,
      conector: async () => {
        throw new Error("não deveria ser chamado");
      },
      agente: async () => ({}),
    });
    expect(resultado.ciclo).toBeDefined();
    expect(resultado.nos).toEqual([]);
  });
});

describe("executarFluxo (SPEC-107 fatia A — o nó de FUNÇÃO)", () => {
  const FLUXO_COM_FUNCAO = fluxoDe(
    [
      { id: "fonte", tipo: "conector", refId: "leitor-de-desenho" },
      { id: "gera-itens", tipo: "funcao", refId: "derivacao" },
      { id: "resume", tipo: "agente", refId: "po" },
    ],
    [
      { de: "fonte", para: "gera-itens", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
      { de: "gera-itens", para: "resume", mapeamento: [{ saida: "itens", entrada: "itens" }] },
    ]
  );

  it("despacha para o executor de função, com o desenho mapeado da aresta (modo b)", async () => {
    const recebido: Record<string, unknown>[] = [];
    const resultado = await executarFluxo(FLUXO_COM_FUNCAO, {
      ...semFuncao,
      conector: async () => ({ desenho: { diagrama: { nodes: [], edges: [] } } }),
      funcao: async (no, entradas) => {
        recebido.push({ no: no.refId, entradas });
        return { itens: [{ chave: "a" }] };
      },
      agente: async () => ({ texto: "resumo" }),
    });

    expect(recebido).toEqual([
      { no: "derivacao", entradas: { desenho: { diagrama: { nodes: [], edges: [] } } } },
    ]);
    expect(resultado.nos.map((n) => [n.noId, n.estado])).toEqual([
      ["fonte", "sucesso"],
      ["gera-itens", "sucesso"],
      ["resume", "sucesso"],
    ]);
  });

  it("§5.4 — as ENTRADAS do nó de função ficam no rastro (a âncora da tese reescrita), e só nele", async () => {
    const resultado = await executarFluxo(FLUXO_COM_FUNCAO, {
      ...semFuncao,
      conector: async () => ({ desenho: { diagrama: { nodes: [], edges: [] } } }),
      funcao: async () => ({ itens: [] }),
      agente: async () => ({ texto: "resumo" }),
    });

    const porNo = Object.fromEntries(resultado.nos.map((n) => [n.noId, n]));
    // "Mesma fiação + mesmas entradas → mesmos itens" só é auditável se as
    // entradas estiverem gravadas junto do hash.
    expect(porNo["gera-itens"].entradas).toEqual({ desenho: { diagrama: { nodes: [], edges: [] } } });
    // Conector e agente continuam sem: rastro é diagnóstico, não armazém.
    expect(porNo.fonte.entradas).toBeUndefined();
    expect(porNo.resume.entradas).toBeUndefined();
  });

  it("as entradas ficam no rastro TAMBÉM quando a função falha — auditoria não é prêmio de sucesso", async () => {
    const resultado = await executarFluxo(FLUXO_COM_FUNCAO, {
      ...semFuncao,
      conector: async () => ({ desenho: "não é um desenho" }),
      funcao: async () => {
        throw new Error('o "desenho" mapeado não tem a forma de um desenho');
      },
      agente: async () => ({ texto: "nunca roda" }),
    });

    const porNo = Object.fromEntries(resultado.nos.map((n) => [n.noId, n]));
    expect(porNo["gera-itens"].estado).toBe("falhou");
    expect(porNo["gera-itens"].entradas).toEqual({ desenho: "não é um desenho" });
    expect(porNo.resume.estado).toBe("nao-executado");
  });
});
