import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportacaoTab } from "./ExportacaoTab";
import { EXPORTADOR_DO_TOUR } from "../demo/dadosDoTour";

const obter = vi.fn();
const salvar = vi.fn();
vi.mock("../api/client", () => ({
  apiExportador: {
    obter: (...a: unknown[]) => obter(...a),
    salvar: (...a: unknown[]) => salvar(...a),
  },
}));

/**
 * §235 — a costura de DEMONSTRAÇÃO da tela de exportação.
 *
 * O que estes testes guardam é a promessa que torna dado falso aceitável:
 * ele não é buscado do servidor e **não é gravado nele**. Um tour que escreve
 * na configuração de quem só quis ver a ferramenta seria pior que um tour que
 * mostra tela vazia.
 */
describe("ExportacaoTab — o modo demonstração", () => {
  it("com dado de demonstração, NÃO busca no servidor e mostra a marca", async () => {
    render(<ExportacaoTab demonstracao={EXPORTADOR_DO_TOUR} />);

    expect(await screen.findByTestId("marca-demonstracao")).toBeInTheDocument();
    expect(obter).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue(EXPORTADOR_DO_TOUR.endpoint)).toBeInTheDocument();
  });

  it("salvar em demonstração não escreve nada", async () => {
    const user = userEvent.setup();
    render(<ExportacaoTab demonstracao={EXPORTADOR_DO_TOUR} />);

    await user.click(await screen.findByTestId("salvar-exportacao"));

    expect(salvar).not.toHaveBeenCalled();
  });

  it("sem demonstração, é a tela de sempre: busca do servidor e sem marca", async () => {
    obter.mockResolvedValueOnce({ endpoint: "https://real.exemplo", rotulo: "Real", cabecalhos: {} });
    render(<ExportacaoTab />);

    expect(await screen.findByDisplayValue("https://real.exemplo")).toBeInTheDocument();
    expect(obter).toHaveBeenCalled();
    expect(screen.queryByTestId("marca-demonstracao")).not.toBeInTheDocument();
  });
});
