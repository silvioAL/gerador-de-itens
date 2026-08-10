import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JanelaConversa } from "./JanelaConversa";

const statusMock = vi.fn();
const transcreverMock = vi.fn();

vi.mock("../api/client", () => ({
  apiIa: {
    status: (...a: unknown[]) => statusMock(...a),
    transcrever: (...a: unknown[]) => transcreverMock(...a),
  },
}));

/**
 * SPEC-30 Fase 1a — o botão de falar só existe quando dá pra falar.
 *
 * A regra é a mesma do pip "sem trabalho" (JOURNEY §97) e do card do gateway:
 * a interface não oferece o que o sistema não faz. Aqui o custo do erro é
 * maior que o normal — um botão que grava 30 segundos e falha no envio
 * desperdiça o tempo E a fala, e a pessoa só descobre depois de já ter falado.
 */
describe("JanelaConversa — botão de falar (SPEC-30 Fase 1a)", () => {
  const props = {
    titulo: "Desenhar conversando",
    fase: "desenho",
    mensagens: [],
    pensando: false,
    exemplo: "descreva a demanda",
    onEnviar: vi.fn(),
    onFechar: vi.fn(),
  };

  beforeEach(() => {
    statusMock.mockReset();
    transcreverMock.mockReset();
  });

  it("aparece quando o provedor transcreve", async () => {
    statusMock.mockResolvedValue({ capacidades: { transcricao: true } });

    render(<JanelaConversa {...props} />);

    expect(await screen.findByTestId("voz-falar")).toBeTruthy();
  });

  it("NÃO aparece quando o provedor não transcreve — é o caso do modelo local", async () => {
    statusMock.mockResolvedValue({ capacidades: { transcricao: false } });

    render(<JanelaConversa {...props} />);

    // Espera o status resolver antes de afirmar a ausência, senão o teste
    // passaria só porque o efeito ainda não rodou.
    await waitFor(() => expect(statusMock).toHaveBeenCalled());
    expect(screen.queryByTestId("voz-falar")).toBeNull();
  });

  it("servidor sem o campo `capacidades` é tratado como 'não transcreve'", async () => {
    // Servidor antigo, ou versão do CLI mais velha que a tela. Falhar para
    // "não tem" é a escolha segura.
    statusMock.mockResolvedValue({ pronto: true });

    render(<JanelaConversa {...props} />);

    await waitFor(() => expect(statusMock).toHaveBeenCalled());
    expect(screen.queryByTestId("voz-falar")).toBeNull();
  });

  it("`/ia/status` fora do ar não quebra a conversa — só não tem microfone", async () => {
    statusMock.mockRejectedValue(new Error("sem rota"));

    render(<JanelaConversa {...props} />);

    await waitFor(() => expect(statusMock).toHaveBeenCalled());
    expect(screen.queryByTestId("voz-falar")).toBeNull();
    // O que importa: digitar continua funcionando. A voz é aditiva.
    expect(screen.getByLabelText("Descreva o que você quer")).toBeTruthy();
  });
});
