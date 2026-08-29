import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentoScreen } from "./DocumentoScreen";
import type { DocumentoDeDesenho } from "@gerador/engine";

/**
 * SPEC-81 fatia B, do lado da tela — **o gesto de publicar.**
 */

/** Mesma forma da fixture de `DocumentoScreen.test.tsx` — o documento vazio que
 * a tela sabe renderizar. */
const DOCUMENTO: DocumentoDeDesenho = {
  titulo: "Busca por SKU",
  contexto: "",
  diagrama: { nodes: [], edges: [] },
  saude: [],
  necessidades: [],
  decisoes: [],
  conferencias: {
    violacoes: [],
    aceitas: [],
    percursos: [],
    violacoesDePercurso: [],
    naoMedidos: [],
    violacoesDeForma: [],
    formaAceitas: [],
  },
  itens: [],
};

function tela(extras: Record<string, unknown> = {}) {
  return render(
    <DocumentoScreen
      documento={DOCUMENTO}
      config={{ nodeTypes: {}, edgeTypes: {}, edgeRules: {} }}
      escrito={{}}
      status={null}
      onMudarEscrito={() => {}}
      onMudarStatus={() => {}}
      onBaixarMarkdown={() => {}}
      onVoltar={() => {}}
      {...extras}
    />
  );
}

describe("publicar o documento (SPEC-81 fatia B)", () => {
  it("sem destino configurado, o botão NÃO aparece", () => {
    /**
     * A disciplina da SPEC-49: oferecer um botão que falharia é pior que não
     * oferecer, porque a pessoa só descobre o problema depois de esperar. O
     * `onPublicar` ausente é como o App diz "não há para onde".
     */
    tela();

    expect(screen.queryByTestId("publicar-documento")).toBeNull();
    // E o download continua onde estava — a publicação não substitui ninguém.
    expect(screen.getByTestId("baixar-markdown")).toBeInTheDocument();
  });

  it("com destino, publica e deixa o LINK na tela", async () => {
    /**
     * O resultado fica, em vez de virar alerta: a URL da página é o que a pessoa
     * vai querer copiar e mandar para alguém, e um alerta some antes disso.
     */
    const onPublicar = vi.fn().mockResolvedValue({ linkExterno: "https://wiki/q-1", destino: "Confluence" });
    tela({ onPublicar });

    fireEvent.click(screen.getByTestId("publicar-documento"));

    const link = await screen.findByTestId("documento-publicado");
    expect(link).toHaveAttribute("href", "https://wiki/q-1");
    expect(link).toHaveTextContent("Confluence");
  });

  it("enquanto publica, o botão trava — dois cliques não viram duas páginas", async () => {
    let liberar: (v: unknown) => void = () => {};
    const onPublicar = vi.fn().mockReturnValue(new Promise((r) => (liberar = r)));
    tela({ onPublicar });

    fireEvent.click(screen.getByTestId("publicar-documento"));

    await waitFor(() => expect(screen.getByTestId("publicar-documento")).toBeDisabled());
    fireEvent.click(screen.getByTestId("publicar-documento"));
    expect(onPublicar).toHaveBeenCalledTimes(1);

    liberar({ linkExterno: "https://wiki/x", destino: "C" });
    await screen.findByTestId("documento-publicado");
  });

  it("o erro do servidor chega inteiro — inclusive o “escolha o destino”", async () => {
    /**
     * O 409 de mais de um destino é a mensagem mais importante que esta tela
     * mostra: o servidor recusa escolher entre dois espaços de documentação, e
     * quem lê precisa entender que a decisão é dela.
     */
    const onPublicar = vi.fn().mockRejectedValue(new Error("há mais de um destino de documento — diga em qual publicar"));
    tela({ onPublicar });

    fireEvent.click(screen.getByTestId("publicar-documento"));

    expect(await screen.findByTestId("erro-ao-publicar")).toHaveTextContent("diga em qual publicar");
    // E o botão volta: erro não pode deixar a pessoa sem tentar de novo.
    expect(screen.getByTestId("publicar-documento")).not.toBeDisabled();
  });
});
