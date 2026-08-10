import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnexoDeImagem, type ImagemAnexada } from "./AnexoDeImagem";

/**
 * SPEC-30 Fase 2. O que estes testes protegem não é o upload — é o contrato
 * com quem anexa: o teto (que existe desde o primeiro commit, pela lição de
 * *toda ausência de teto virou bug*) e o aviso de saída de dados, que não pode
 * sumir depois do primeiro uso.
 */
function arquivo(nome: string, bytes: number, tipo = "image/png"): File {
  return new File([new Uint8Array(bytes)], nome, { type: tipo });
}

const imagem: ImagemAnexada = { dataUrl: "data:image/png;base64,AAA", nome: "diagrama.png", bytes: 100 };

describe("AnexoDeImagem (SPEC-30 Fase 2)", () => {
  it("anexar lê o arquivo como data URL — que é o que o gateway aceita direto", async () => {
    const onMudar = vi.fn();
    render(<AnexoDeImagem imagens={[]} onMudar={onMudar} />);

    fireEvent.change(screen.getByLabelText("Escolher imagem"), {
      target: { files: [arquivo("print.png", 10)] },
    });

    await waitFor(() => expect(onMudar).toHaveBeenCalled());
    const [novas] = onMudar.mock.calls.at(-1)!;
    expect(novas[0].nome).toBe("print.png");
    expect(novas[0].dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("recusa imagem grande demais, dizendo qual e o que fazer", async () => {
    const onMudar = vi.fn();
    render(<AnexoDeImagem imagens={[]} onMudar={onMudar} />);

    fireEvent.change(screen.getByLabelText("Escolher imagem"), {
      target: { files: [arquivo("enorme.png", 5 * 1024 * 1024)] },
    });

    // Data URL infla ~33% em base64 e vai inteira no corpo do pedido: sem teto,
    // um print 4K vira megabytes de JSON.
    expect(await screen.findByTestId("erro-anexo")).toHaveTextContent("enorme.png");
    expect(onMudar).not.toHaveBeenCalled();
  });

  it("o aviso de saída de dados aparece com a imagem anexada, e diz PARA ONDE", async () => {
    // Print de arquitetura costuma ter mais informação sensível do que quem
    // anexa lembra na hora — e "sai da máquina" significa coisas diferentes se
    // o destino é o container ao lado ou um provedor público.
    render(<AnexoDeImagem imagens={[imagem]} onMudar={vi.fn()} destino="https://api.anthropic.com/v1" />);

    const aviso = screen.getByTestId("aviso-saida-de-dados");
    expect(aviso).toHaveTextContent("api.anthropic.com");
  });

  it("sem imagem anexada, não há aviso — não é ruído permanente", () => {
    render(<AnexoDeImagem imagens={[]} onMudar={vi.fn()} />);
    expect(screen.queryByTestId("aviso-saida-de-dados")).toBeNull();
  });

  it("remover tira só a imagem escolhida", () => {
    const onMudar = vi.fn();
    const outra: ImagemAnexada = { ...imagem, nome: "outro.png" };
    render(<AnexoDeImagem imagens={[imagem, outra]} onMudar={onMudar} />);

    fireEvent.click(screen.getByLabelText("Remover diagrama.png"));

    expect(onMudar).toHaveBeenCalledWith([outra]);
  });

  it("no limite de imagens, o botão desabilita em vez de falhar depois", () => {
    render(<AnexoDeImagem imagens={[imagem, imagem, imagem]} onMudar={vi.fn()} />);
    expect(screen.getByTestId("anexar-imagem")).toBeDisabled();
  });
});
