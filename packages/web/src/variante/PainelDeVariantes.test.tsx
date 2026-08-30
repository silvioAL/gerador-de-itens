import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Diagrama, DiagramaConfig, Variante } from "@gerador/engine";
import { PainelDeVariantes } from "./PainelDeVariantes";

/**
 * SPEC-88 (P6) fatia D — **a tela da escolha entre dois desenhos.**
 *
 * A prova que mais importa é a última: o botão de adotar não habilita sem o
 * porquê. É o que separa "escolhemos B porque A somava 900ms" de "mudamos de
 * ideia" — e é o que impede a variante de virar "copiar e editar" com um passo a
 * mais.
 */

const CONFIG = {
  nodeTypes: { service: { label: "Serviço", spec: [] } },
  edgeTypes: { http: { label: "HTTP" } },
  edgeRules: {},
} as unknown as DiagramaConfig;

const VAZIO = { nodes: [], edges: [] } as unknown as Diagrama;

function variante(p: Partial<Variante> = {}): Variante {
  return { id: "v-1", titulo: "Vitrine com fila", diagrama: VAZIO, criadaEm: "2026-08-30T10:00:00.000Z", ...p };
}

function painel(extras: Partial<Parameters<typeof PainelDeVariantes>[0]> = {}) {
  const onGuardar = vi.fn();
  const onAdotar = vi.fn();
  render(
    <PainelDeVariantes
      tituloAtual="Vitrine síncrona"
      diagramaAtual={VAZIO}
      variantes={[variante()]}
      config={CONFIG}
      onGuardar={onGuardar}
      onAdotar={onAdotar}
      onFechar={vi.fn()}
      {...extras}
    />
  );
  return { onGuardar, onAdotar };
}

describe("o painel de variantes (SPEC-88 fatia D)", () => {
  it("sem alternativa guardada, DIZ que isso é normal", () => {
    // Uma tabela vazia faria parecer que algo falhou ao carregar. A maioria das
    // demandas tem um desenho só, e está certo.
    painel({ variantes: [] });

    expect(screen.getByTestId("sem-variantes")).toHaveTextContent("um desenho só, e está certo");
    expect(screen.queryByTestId("comparacao-de-variantes")).toBeNull();
  });

  it("guardar manda o título e NÃO adota nada", () => {
    /**
     * Guardar uma opção não é escolhê-la. Um ADR nascido de um "salvar como"
     * seria ruído no histórico de decisões, que é onde alguém procura o que foi
     * decidido — não o que foi cogitado.
     */
    const { onGuardar, onAdotar } = painel({ variantes: [] });

    fireEvent.change(screen.getByLabelText("Nome da alternativa"), { target: { value: "Vitrine com fila" } });
    fireEvent.click(screen.getByTestId("guardar-variante"));

    expect(onGuardar).toHaveBeenCalledWith("Vitrine com fila");
    expect(onAdotar).not.toHaveBeenCalled();
  });

  it("guardar sem nome não habilita — alternativa sem nome não se compara", () => {
    painel({ variantes: [] });

    expect(screen.getByTestId("guardar-variante")).toBeDisabled();
  });

  it("compara DUAS por vez, e a adotada aparece marcada como tal", () => {
    // Três colunas lado a lado é uma planilha, e planilha não é o que se lê
    // antes de decidir. A pergunta real é "esta ou aquela?".
    painel({ variantes: [variante(), variante({ id: "v-2", titulo: "Vitrine em lote" })] });

    const tabela = screen.getByTestId("comparacao-de-variantes");
    expect(tabela).toHaveTextContent("Vitrine síncrona (adotado)");
    expect(tabela).toHaveTextContent("Vitrine com fila");
    expect(tabela).not.toHaveTextContent("Vitrine em lote");
  });

  it("desenho sem tempo diz 'não medido', nunca zero", () => {
    /**
     * A asserção que impede a tela de mentir. Zero faria o desenho sem dado
     * nenhum parecer o mais rápido dos dois — exatamente ao contrário.
     */
    painel();

    expect(screen.getByTestId("pior-trecho-a")).toHaveTextContent("não medido");
    expect(screen.getByTestId("pior-trecho-b")).toHaveTextContent("não medido");
    expect(screen.getByTestId("diferenca-das-variantes")).toHaveTextContent("inventar uma seria pior");
  });

  it("a alternativa recém-guardada JÁ abre comparação — a transição de zero para um", () => {
    /**
     * **O defeito que só o E2E pegou, virado unitário.**
     *
     * A primeira escrita congelava a escolha no estado inicial
     * (`useState(variantes[0]?.id)`): montado com a lista vazia, ficava `null`
     * para sempre, e guardar a primeira alternativa não abria comparação
     * nenhuma. Os outros testes deste arquivo montam com a lista já cheia — por
     * isso passavam todos.
     *
     * A lição não é "escrever mais testes": é que a transição de estado vazio
     * para o primeiro item é um caso, e ele quase nunca é o que se monta.
     */
    const { rerender } = render(
      <PainelDeVariantes
        tituloAtual="Vitrine síncrona"
        diagramaAtual={VAZIO}
        variantes={[]}
        config={CONFIG}
        onGuardar={vi.fn()}
        onAdotar={vi.fn()}
        onFechar={vi.fn()}
      />
    );
    expect(screen.queryByTestId("comparacao-de-variantes")).toBeNull();

    rerender(
      <PainelDeVariantes
        tituloAtual="Vitrine síncrona"
        diagramaAtual={VAZIO}
        variantes={[variante()]}
        config={CONFIG}
        onGuardar={vi.fn()}
        onAdotar={vi.fn()}
        onFechar={vi.fn()}
      />
    );

    expect(screen.getByTestId("comparacao-de-variantes")).toHaveTextContent("Vitrine com fila");
  });

  it("adotar NÃO habilita sem o porquê", () => {
    /**
     * A prova mais importante do arquivo. O motor recusa (`AdocaoSemPorque`), e
     * deixar clicar para receber erro é ensinar a ignorar o campo.
     */
    painel();

    expect(screen.getByTestId("adotar-variante")).toBeDisabled();
  });

  it("com o porquê, adotar manda o id e a razão", () => {
    const { onAdotar } = painel();

    fireEvent.change(screen.getByLabelText("por que adotar esta"), {
      target: { value: "a fila tira o parceiro do caminho" },
    });
    fireEvent.click(screen.getByTestId("adotar-variante"));

    expect(onAdotar).toHaveBeenCalledWith("v-1", "a fila tira o parceiro do caminho");
  });

  it("porquê só com espaços não conta como razão", () => {
    painel();

    fireEvent.change(screen.getByLabelText("por que adotar esta"), { target: { value: "   " } });

    expect(screen.getByTestId("adotar-variante")).toBeDisabled();
  });
});
