import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Decisao } from "@gerador/engine";
import { comoTexto, useAdrNaEntrada } from "./useAdrNaEntrada";
import { apiExportador, apiQuebras } from "../api/client";

vi.mock("../api/client", () => ({
  apiExportador: { obter: vi.fn() },
  apiQuebras: { importarAdr: vi.fn() },
}));

function decisao(p: Partial<Decisao> = {}): Decisao {
  return {
    id: "adr:ADR-14",
    titulo: "Integração com bureau",
    alternativas: [],
    escolhida: "Fila",
    porque: "desacopla o tempo do parceiro",
    status: "aceita",
    origem: "extraido",
    autor: "ana",
    em: "2026-08-29T10:00:00.000Z",
    importadoDe: "https://adr/14",
    ...p,
  };
}

const COM_DESTINO = { endpoint: "", rotulo: "", cabecalhos: {}, destinos: [{ id: "a", operacao: "adr", endpoint: "https://gw/adr", rotulo: "ADR" }] };

describe("o ADR entra na conversa como a voz entra (SPEC-81 fatia D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiExportador.obter).mockResolvedValue(COM_DESTINO as never);
  });

  it("o texto cai no MESMO campo, e ANEXA em vez de substituir", async () => {
    /**
     * A régua herdada do `useVozNaEntrada`, e ela vale aqui pelo mesmo motivo:
     * trazer o ADR depois de digitar é complementar, e apagar o que a pessoa
     * escreveu seria perda de trabalho por um clique.
     */
    vi.mocked(apiQuebras.importarAdr).mockResolvedValue({ decisoes: [{ decisao: decisao(), lacunas: [] }], origem: "ADR" });
    let entrada = "preciso de uma vitrine que aguente o pico";
    const setEntrada = vi.fn((f: unknown) => {
      entrada = typeof f === "function" ? (f as (a: string) => string)(entrada) : (f as string);
    });

    const { result } = renderHook(() => useAdrNaEntrada(setEntrada as never, "q-1"));
    await waitFor(() => expect(result.current.podeTrazerAdr).toBe(true));
    await act(() => result.current.trazer());

    expect(entrada).toContain("preciso de uma vitrine que aguente o pico");
    expect(entrada).toContain("Integração com bureau");
  });

  it("NÃO envia sozinho — quem aperta enviar é a pessoa", async () => {
    // O hook só escreve na caixa. Se ele chamasse o modelo, texto vindo de um
    // repositório de terceiro iria para a IA sem passar pelo olho de ninguém —
    // e viraria nó errado no diagrama sem ninguém saber de onde veio.
    vi.mocked(apiQuebras.importarAdr).mockResolvedValue({ decisoes: [{ decisao: decisao(), lacunas: [] }], origem: "ADR" });
    const setEntrada = vi.fn();

    const { result } = renderHook(() => useAdrNaEntrada(setEntrada, "q-1"));
    await waitFor(() => expect(result.current.podeTrazerAdr).toBe(true));
    await act(() => result.current.trazer());

    expect(setEntrada).toHaveBeenCalled();
    expect(result.current.ultimoTotal).toBe(1);
  });

  it("sem destino de ADR configurado, o botão não aparece", async () => {
    // Um botão que busca e morre desperdiça o tempo e a atenção — a mesma
    // disciplina do `podeFalar`.
    vi.mocked(apiExportador.obter).mockResolvedValue({ endpoint: "", rotulo: "", cabecalhos: {} } as never);

    const { result } = renderHook(() => useAdrNaEntrada(vi.fn(), "q-1"));

    await waitFor(() => expect(vi.mocked(apiExportador.obter)).toHaveBeenCalled());
    expect(result.current.podeTrazerAdr).toBe(false);
  });

  it("sem demanda salva também não aparece — sem id não há o que perguntar", async () => {
    const { result } = renderHook(() => useAdrNaEntrada(vi.fn(), null));

    await waitFor(() => expect(vi.mocked(apiExportador.obter)).toHaveBeenCalled());
    expect(result.current.podeTrazerAdr).toBe(false);
  });

  it("zero decisões novas não escreve nada na caixa", async () => {
    /**
     * Anexar um cabeçalho sem linha nenhuma encheria a caixa de ruído — e, pior,
     * sugeriria ao modelo que existe algo decidido quando não existe.
     */
    vi.mocked(apiQuebras.importarAdr).mockResolvedValue({ decisoes: [], origem: "ADR" });
    const setEntrada = vi.fn();

    const { result } = renderHook(() => useAdrNaEntrada(setEntrada, "q-1"));
    await waitFor(() => expect(result.current.podeTrazerAdr).toBe(true));
    await act(() => result.current.trazer());

    expect(setEntrada).not.toHaveBeenCalled();
    expect(result.current.ultimoTotal).toBe(0);
  });

  it("falha do gateway vira mensagem, não exceção", async () => {
    vi.mocked(apiQuebras.importarAdr).mockRejectedValue(new Error("nenhum destino de ADR configurado"));

    const { result } = renderHook(() => useAdrNaEntrada(vi.fn(), "q-1"));
    await waitFor(() => expect(result.current.podeTrazerAdr).toBe(true));
    await act(() => result.current.trazer());

    expect(result.current.erro).toMatch(/nenhum destino/);
  });
});

describe("o texto que vai para a caixa (SPEC-81 fatia D)", () => {
  it("é PROSA, não JSON — vai para a mesma caixa em que a pessoa escreve", () => {
    /**
     * Despejar estrutura ali quebraria a leitura de quem revisa antes de
     * enviar, que é justamente o passo que esta disciplina existe para
     * preservar.
     */
    const texto = comoTexto([{ decisao: decisao(), lacunas: [] }]);

    expect(texto).not.toContain("{");
    expect(texto).toContain("- Integração com bureau: Fila — porque desacopla o tempo do parceiro");
    expect(texto).toContain("Não proponha o que elas descartaram.");
  });

  it("a LACUNA vai dita — o modelo precisa saber que o porquê não foi registrado", () => {
    // Sem isso ele inventa uma razão, e a razão inventada é indistinguível da
    // real para quem lê o desenho depois.
    const texto = comoTexto([{ decisao: decisao({ porque: "" }), lacunas: ["porque"] }]);

    expect(texto).toContain("(a casa não registrou o porquê)");
  });

  it("decisão só com título ainda orienta", () => {
    // ADR pobre é o caso comum, e o título sozinho já diz ao modelo que o
    // assunto foi decidido — o que é melhor que silêncio.
    const texto = comoTexto([{ decisao: decisao({ escolhida: "", porque: "" }), lacunas: [] }]);

    expect(texto).toContain("- Integração com bureau");
  });

  it("lista vazia é string vazia — nada a anexar", () => {
    expect(comoTexto([])).toBe("");
  });
});
