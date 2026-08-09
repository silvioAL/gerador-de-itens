import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Atividade, Diagrama } from "@gerador/engine";
import { PromptUnicoPanel } from "./PromptUnicoPanel";

const obterTemplateMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiPromptUnicoTemplate: { obter: obterTemplateMock },
}));

const DIAGRAMA: Diagrama = { nodes: [], edges: [] };

/** `toHaveValue` não aceita matcher assimétrico — o valor cru é mais direto. */
function textoGerado(): string {
  return (screen.getByTestId("prompt-unico-texto") as HTMLTextAreaElement).value;
}

function atividade(over: Partial<Atividade> = {}): Atividade {
  return {
    chave: "n1::ep0",
    rotulo: "Expor endpoint de checkout",
    tipo: "História",
    tamanho: "M",
    descricao: "",
    techs: ["java"],
    contextos: ["backend-api"],
    dependencias: [],
    origem: { nodeId: "n1" },
    ...over,
  } as Atividade;
}

function montar(props: Partial<React.ComponentProps<typeof PromptUnicoPanel>> = {}) {
  render(
    <PromptUnicoPanel
      atividades={[atividade()]}
      diagrama={DIAGRAMA}
      demandInfo="Reduzir o timeout do checkout."
      onFechar={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  obterTemplateMock.mockReset().mockResolvedValue({
    conteudo: "DEMANDA: {{descricaoEpico}}\nITENS:\n{{itensBreakDownContent}}\nEXTRA: {{contextoAdicional}}",
    variaveis: [],
  });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("PromptUnicoPanel (SPEC-25 §5.5 — a saída que funciona sem token)", () => {
  it("mostra o prompt montado ANTES de copiar — vai pro chat da empresa, não dá pra desfazer", async () => {
    montar();
    await waitFor(() => expect(textoGerado()).toContain("DEMANDA"));
    expect(textoGerado()).toContain("Reduzir o timeout do checkout.");
    expect(textoGerado()).toContain("Expor endpoint de checkout");
  });

  it("usa o template do projeto, não um hardcoded", async () => {
    obterTemplateMock.mockResolvedValue({ conteudo: "MEU TEMPLATE: {{tecnologiasEnvolvidas}}", variaveis: [] });
    montar();
    await waitFor(() => expect(textoGerado()).toBe("MEU TEMPLATE: java"));
  });

  it("anexos do contexto do épico entram como contexto adicional — mesma fonte da esteira", async () => {
    montar({ anexosContexto: [{ nome: "regra-de-negocio.md", conteudo: "limite de 150ms" }] });
    await waitFor(() => expect(textoGerado()).toContain("limite de 150ms"));
    expect(textoGerado()).toContain("regra-de-negocio.md");
  });

  it("copia o MESMO texto que está na tela", async () => {
    montar();
    await waitFor(() => expect(textoGerado()).toContain("DEMANDA"));
    const naTela = textoGerado();

    fireEvent.click(screen.getByRole("button", { name: "Copiar prompt" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(naTela));
    expect(await screen.findByRole("button", { name: "✓ copiado" })).toBeInTheDocument();
  });

  it("clipboard bloqueado não vira botão mudo — diz o que fazer", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("negado")) } });
    montar();
    await waitFor(() => expect(textoGerado()).toContain("DEMANDA"));
    fireEvent.click(screen.getByRole("button", { name: "Copiar prompt" }));

    expect(await screen.findByText(/copie à mão/)).toBeInTheDocument();
  });

  it("mostra a contagem de itens e o tamanho — prompt gigante estoura janela de modelo", async () => {
    montar({ atividades: [atividade(), atividade({ chave: "n2::ep0" })] });
    await waitFor(() => expect(screen.getByText(/2 itens/)).toBeInTheDocument());
    expect(screen.getByText(/caracteres/)).toBeInTheDocument();
  });

  it("falha ao carregar o template aparece como erro, não como prompt vazio", async () => {
    obterTemplateMock.mockRejectedValue(new Error("servidor fora"));
    montar();
    expect(await screen.findByText(/servidor fora/)).toBeInTheDocument();
    expect(screen.queryByTestId("prompt-unico-texto")).not.toBeInTheDocument();
  });
});
