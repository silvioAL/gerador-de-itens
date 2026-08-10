import { afterEach, describe, expect, it, vi } from "vitest";
import { apiIa } from "./client";

/**
 * ACHADO do SPEC-30, o de pior diagnóstico: falha DEPOIS que o streaming
 * começou não tem mais status HTTP pra sinalizar — o 200 já foi. O que chega é
 * texto no lugar do JSON, e o parse cru mostrava `Unexpected token 'e'` na tela
 * de quem só queria desenhar um diagrama.
 *
 * Estes testes não exercitam gateway nenhum: exercitam o que a pessoa lê
 * quando ele falha. É o contrato que o usuário pediu ("colocar tratamentos
 * para essas limitações para o usuário entender"), e é o tipo de coisa que uma
 * refatoração desatenta apaga sem quebrar mais nada.
 */
function respostaEmStream(texto: string): Response {
  const bytes = new TextEncoder().encode(texto);
  let entregue = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => (entregue ? { done: true, value: undefined } : ((entregue = true), { done: false, value: bytes })),
      }),
    },
  } as unknown as Response;
}

/** `.catch(e => e)` devolve `Error | T` pro tsc, e ler `.message` ali não
 * compila. Falhar aqui é melhor que afrouxar o tipo: um teste que "pega o
 * erro" e recebe sucesso passaria calado. */
async function erroDe(promessa: Promise<unknown>): Promise<Error> {
  try {
    await promessa;
  } catch (e) {
    return e as Error;
  }
  throw new Error("esperava uma falha, e a chamada teve sucesso");
}

afterEach(() => vi.unstubAllGlobals());

describe("apiIa — resposta de streaming que não é JSON", () => {
  it("erro do gateway no meio do stream vira instrução, não 'Unexpected token'", async () => {
    // O caso real: o gateway aceitou o pedido, começou a responder e morreu —
    // o corpo traz a mensagem dele, não o diagrama.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaEmStream("error: upstream connect failed")));

    await expect(apiIa.proporDiagrama({ descricao: "x" } as never)).rejects.toThrow(/não devolveu o diagrama/);
  });

  it("a mensagem carrega os três motivos e a amostra do que veio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaEmStream("error: upstream connect failed")));

    const erro = await erroDe(apiIa.proporDiagrama({ descricao: "x" } as never));

    // Sem a amostra, quem lê não tem como distinguir "o modelo não enxerga
    // imagem" de "o gateway caiu" — e são ações diferentes.
    expect(erro.message).toContain("upstream connect failed");
    expect(erro.message).toContain("Este modelo enxerga imagem");
    expect(erro.message).toContain("cortada no meio");
    expect(erro.message).not.toContain("Unexpected token");
  });

  it("resposta vazia diz que veio vazia, em vez de citar aspas sem nada dentro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaEmStream("")));

    const erro = await erroDe(apiIa.proporDiagrama({ descricao: "x" } as never));
    expect(erro.message).toContain("veio vazia");
  });

  it("JSON válido continua passando — o tratamento não engole o caminho feliz", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaEmStream('{"nos":[],"arestas":[]}')));

    await expect(apiIa.proporDiagrama({ descricao: "x" } as never)).resolves.toEqual({ nos: [], arestas: [] });
  });
});
