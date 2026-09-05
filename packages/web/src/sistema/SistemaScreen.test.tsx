import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { MapaDoSistema } from "@gerador/aplicacao";
import { SistemaScreen } from "./SistemaScreen";

function mapa(p: Partial<MapaDoSistema> = {}): MapaDoSistema {
  return {
    agentes: [],
    regras: [],
    regrasDePercurso: 0,
    fluxos: [],
    pdca: { feedbacksAbertos: 0, temTrabalho: false },
    avisos: [],
    ...p,
  };
}

function montar(m: MapaDoSistema = mapa(), extras: Partial<React.ComponentProps<typeof SistemaScreen>> = {}) {
  const onAbrirConfig = vi.fn();
  render(<SistemaScreen mapa={m} onAbrirConfig={onAbrirConfig} onVoltar={vi.fn()} {...extras} />);
  return { onAbrirConfig };
}

/** §260 — com as duas ações ligadas: é o modo em que a tela de fato roda. */
function montarEditavel(m: MapaDoSistema = mapa()) {
  const onAlternarAgente = vi.fn();
  const onMoverAgente = vi.fn();
  const { onAbrirConfig } = montar(m, { onAlternarAgente, onMoverAgente });
  return { onAbrirConfig, onAlternarAgente, onMoverAgente };
}

const PO = {
  id: "po",
  nome: "PO",
  escreve: "história e critérios de aceite",
  estado: "ativo" as const,
  contextos: [],
  ordem: 1,
};

describe("SistemaScreen — a vista de leitura (SPEC-59 fatia A)", () => {
  it("mostra os três fluxos e o item no centro deles", () => {
    // A tela existe porque as três coisas eram telas separadas, e o que as une
    // — o item que elas produzem — não aparecia em lugar nenhum.
    montar();

    expect(screen.getByTestId("bloco-regras")).toBeTruthy();
    expect(screen.getByTestId("bloco-esteira")).toBeTruthy();
    expect(screen.getByTestId("bloco-pdca")).toBeTruthy();
    expect(screen.getByTestId("bloco-item").textContent).toContain("item de trabalho");
  });

  it("a esteira aparece como SEQUÊNCIA, com o que cada um escreve", () => {
    montar(
      mapa({
        agentes: [PO, { ...PO, id: "qa", nome: "QA", escreve: "regras de teste e cenários", ordem: 2 }],
      })
    );

    expect(within(screen.getByTestId("agente-po")).getByText(/história e critérios/)).toBeTruthy();
    expect(within(screen.getByTestId("agente-qa")).getByText(/regras de teste/)).toBeTruthy();
  });

  it("o avatar carrega o ESTADO, que é metade da razão de ele existir", () => {
    // Avatar que não diz nada é adesivo. O que responde "por que meu item saiu
    // vazio?" é o estado, não o rosto.
    montar(
      mapa({
        agentes: [
          { ...PO, estado: "sem-credencial" },
          { ...PO, id: "qa", nome: "QA", estado: "desligado", ordem: 2 },
        ],
      })
    );

    expect(screen.getByTestId("agente-po").getAttribute("data-estado")).toBe("sem-credencial");
    expect(screen.getByTestId("estado-po").textContent).toBe("sem modelo");
    expect(screen.getByTestId("agente-qa").getAttribute("data-estado")).toBe("desligado");
  });

  it("papel sem modelo leva à SOLUÇÃO, não só nomeia o problema", () => {
    const { onAbrirConfig } = montar(mapa({ agentes: [{ ...PO, estado: "sem-credencial" }] }));

    fireEvent.click(within(screen.getByTestId("agente-po")).getByText(/configurar o modelo de IA/));
    expect(onAbrirConfig).toHaveBeenCalledWith("modeloIa");
  });

  it("as regras separam o que é TEXTO do que o motor confere sozinho", () => {
    // Somar os dois esconderia justamente a distinção do §239 — e foi ela que
    // deixou a conformidade dormente em 100% das instalações.
    montar(mapa({ regras: [{ tech: "Backend", requisitos: 5, conferiveis: 2, testes: 3 }], regrasDePercurso: 1 }));

    const linha = screen.getByTestId("regra-Backend");
    expect(linha.textContent).toContain("5 requisito(s)");
    expect(linha.textContent).toContain("2 conferível(is)");
  });

  it("os avisos aparecem no topo — o mapa não pode virar cartaz de 'tudo certo'", () => {
    montar(mapa({ avisos: ["a esteira não tem com quem falar"] }));

    expect(screen.getByTestId("avisos-do-sistema").textContent).toContain("não tem com quem falar");
  });

  it("o laço do PDCA só acende quando há o que processar", () => {
    montar(mapa({ pdca: { feedbacksAbertos: 0, temTrabalho: false } }));
    expect(screen.queryByTestId("pdca-com-trabalho")).toBeNull();

    montar(mapa({ pdca: { feedbacksAbertos: 2, temTrabalho: true } }));
    expect(screen.getByTestId("pdca-com-trabalho").textContent).toContain("2 feedback(s)");
  });

  it("cada bloco leva à tela que EDITA aquilo — a vista não edita nada", () => {
    // A restrição é o que torna a fatia A barata: config quebrada aqui
    // quebraria a ferramenta inteira, não o desenho de uma demanda.
    const { onAbrirConfig } = montar();

    fireEvent.click(within(screen.getByTestId("bloco-regras")).getByText("configurar →"));
    fireEvent.click(within(screen.getByTestId("bloco-esteira")).getByText("configurar →"));
    fireEvent.click(within(screen.getByTestId("bloco-pdca")).getByText("configurar →"));

    expect(onAbrirConfig.mock.calls.map((c) => c[0])).toEqual(["regras", "pipeline", "pdca"]);
  });

  it("instalação nova não quebra a tela — diz o que falta", () => {
    montar();

    expect(screen.getByText("Nenhum papel na esteira.")).toBeTruthy();
    expect(screen.getByText("Nenhuma regra configurada.")).toBeTruthy();
  });
});

describe("as duas edições que o mapa provoca (SPEC-59 fatia D, §260)", () => {
  it("ligar/desligar acontece ONDE se vê o problema", () => {
    // Ver que um papel está desligado e ter que ir a outra tela para ligá-lo é
    // o mapa apontando e cobrando pedágio.
    const { onAlternarAgente } = montarEditavel(mapa({ agentes: [{ ...PO, estado: "desligado" }] }));

    expect(screen.getByTestId("alternar-po").textContent).toBe("ligar");
    fireEvent.click(screen.getByTestId("alternar-po"));
    expect(onAlternarAgente).toHaveBeenCalledWith("po");
  });

  it("a esteira é SEQUÊNCIA, então se reordena — e as pontas não movem para fora", () => {
    const { onMoverAgente } = montarEditavel(
      mapa({ agentes: [PO, { ...PO, id: "qa", nome: "QA", ordem: 2 }] })
    );

    expect((screen.getByTestId("subir-po") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("descer-qa") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("descer-po"));
    expect(onMoverAgente).toHaveBeenCalledWith("po", 1);
  });

  it("sem os callbacks a tela volta a ser leitura — a fatia A continua de pé", () => {
    montar(mapa({ agentes: [PO] }));

    expect(screen.queryByTestId("alternar-po")).toBeNull();
    expect(screen.getByText(/vista de leitura/)).toBeTruthy();
  });

  it("falha ao salvar APARECE — tela otimista sobre escrita que falhou é mentir com confiança", () => {
    montar(mapa({ agentes: [PO] }), { onAlternarAgente: vi.fn(), onMoverAgente: vi.fn(), erroAoSalvar: "Não deu para salvar: 500" });

    expect(screen.getByTestId("erro-ao-salvar-sistema").textContent).toContain("500");
  });
});

/**
 * SPEC-60 fatia B (§265) — o estado que faltava no avatar.
 */
describe("SistemaScreen — a última execução no avatar", () => {
  const AGORA = new Date("2026-08-16T12:00:00.000Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
  });
  afterEach(() => vi.useRealTimers());

  it("papel que falhou fica vermelho e mostra o que o gateway disse", () => {
    // O erro do gateway inteiro, e não um código nosso: quem abre o mapa por
    // causa de uma falha precisa da frase que resolve.
    montar(
      mapa({
        agentes: [
          {
            ...PO,
            estado: "falhou",
            ultimaExecucao: {
              ok: false,
              em: "2026-08-16T11:57:00.000Z",
              duracaoMs: 1234,
              erro: "Credencial recusada pelo gateway (HTTP 401)",
            },
          },
        ],
      })
    );

    expect(screen.getByTestId("estado-po").textContent).toBe("falhou");
    const linha = screen.getByTestId("ultima-execucao-po").textContent ?? "";
    expect(linha).toContain("há 3 min");
    expect(linha).toContain("1,2 s");
    expect(linha).toContain("HTTP 401");
  });

  it("execução recente e bem-sucedida aparece sem erro nenhum", () => {
    montar(
      mapa({
        agentes: [{ ...PO, ultimaExecucao: { ok: true, em: "2026-08-16T11:59:50.000Z", duracaoMs: 340 } }],
      })
    );

    const linha = screen.getByTestId("ultima-execucao-po").textContent ?? "";
    expect(linha).toContain("há segundos");
    expect(linha).toContain("340 ms");
    expect(screen.getByTestId("estado-po").textContent).toBe("ativo");
  });

  it("papel sem rastro não inventa linha — nunca rodou é diferente de rodou bem", () => {
    montar(mapa({ agentes: [PO] }));

    expect(screen.queryByTestId("ultima-execucao-po")).toBeNull();
  });
});
