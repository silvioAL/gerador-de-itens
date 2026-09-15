import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CONVERSAS_DO_ASSISTENTE } from "@gerador/aplicacao";
import { ConversasDoAssistenteSecao } from "./ConversasDoAssistenteSecao";
import type { ConfigPipelineAgentes } from "../api/client";

vi.mock("../api/client", async (importActual) => {
  const real = await importActual<typeof import("../api/client")>();
  return { ...real, apiIa: { ...real.apiIa, sugerirConfig: vi.fn() } };
});

/**
 * SPEC-117 fatias B, C e F — a seção que deu às conversas do assistente o que
 * só a esteira tinha: um lugar para editar, e a anatomia que o torna legível.
 */
function montar(conversas?: ConfigPipelineAgentes["conversas"]) {
  const onMudar = vi.fn();
  render(<ConversasDoAssistenteSecao conversas={conversas} onMudar={onMudar} />);
  return { onMudar };
}

describe("as conversas do assistente na tela (SPEC-117)", () => {
  it("lista TODAS as conversas do produto — nenhuma fica sem lugar de editar", () => {
    /**
     * A queixa original: *"não tenho flexibilidade para editar os agentes do
     * assistente na ferramenta"*. Uma lista parcial responderia só parte dela,
     * e ninguém saberia quais ficaram de fora.
     */
    montar();

    for (const conversa of CONVERSAS_DO_ASSISTENTE) {
      expect(screen.getByTestId(`conversa-config-${conversa.id}`), conversa.id).toBeInTheDocument();
    }
  });

  it("o que o time escreveu vira o valor do campo, e a tela marca quem foi personalizada", () => {
    montar([{ id: "decisoes", preambulo: "Cite o número do chamado." }]);

    // A marca aparece SEM abrir: saber quais conversas foram mexidas não pode
    // exigir abrir as oito.
    expect(within(screen.getByTestId("conversa-config-decisoes")).getByText("instruções do time")).toBeInTheDocument();
    expect(screen.queryByText("instruções do time")).not.toBeNull();

    fireEvent.click(within(screen.getByTestId("conversa-config-decisoes")).getByRole("button", { name: /Conversar e decidir/ }));
    expect(screen.getByTestId("preambulo-conversa-decisoes")).toHaveValue("Cite o número do chamado.");
  });

  it("escrever num campo devolve a conversa para quem salva", () => {
    const { onMudar } = montar();

    fireEvent.click(screen.getByRole("button", { name: /Desenhar conversando/ }));
    fireEvent.change(screen.getByTestId("preambulo-conversa-diagrama"), { target: { value: "Prefira Hexagonal." } });

    expect(onMudar).toHaveBeenCalledWith([{ id: "diagrama", preambulo: "Prefira Hexagonal." }]);
  });

  it("apagar o texto REMOVE a entrada — não grava string vazia", () => {
    /**
     * A normalização do servidor descarta preâmbulo vazio de qualquer jeito.
     * Sem isto a tela mandaria uma entrada que volta sumida, e quem
     * recarregasse veria a diferença sem entender por quê.
     */
    const { onMudar } = montar([{ id: "diagrama", preambulo: "Prefira Hexagonal." }]);

    fireEvent.click(screen.getByRole("button", { name: /Desenhar conversando/ }));
    fireEvent.change(screen.getByTestId("preambulo-conversa-diagrama"), { target: { value: "   " } });

    expect(onMudar).toHaveBeenCalledWith(undefined);
  });

  it("mexer numa conversa não apaga o que já estava escrito nas outras", () => {
    // O defeito que um `[{ id, preambulo }]` ingênuo produz: substituir a lista
    // inteira pelo item que acabou de mudar.
    const { onMudar } = montar([{ id: "decisoes", preambulo: "Cite o chamado." }]);

    fireEvent.click(screen.getByRole("button", { name: /Desenhar conversando/ }));
    fireEvent.change(screen.getByTestId("preambulo-conversa-diagrama"), { target: { value: "Prefira Hexagonal." } });

    expect(onMudar).toHaveBeenCalledWith([
      { id: "decisoes", preambulo: "Cite o chamado." },
      { id: "diagrama", preambulo: "Prefira Hexagonal." },
    ]);
  });

  it("fatia B — a anatomia da conversa aparece, com a origem de cada parte", () => {
    /**
     * §0.2: a classificação só existia para a esteira, e *"não há como uma
     * pessoa saber o que ali é dela e o que é do produto, porque nada é dela"*.
     * É esta lista que torna a caixa de texto legível — sem ela, quem escreve
     * reescreve o que o produto já diz.
     */
    montar();

    fireEvent.click(screen.getByRole("button", { name: /Mapear componente/ }));
    const anatomia = screen.getByTestId("anatomia-scriptDeMapeamento");

    expect(within(anatomia).getByText("SOMENTE LEITURA")).toBeInTheDocument();
    expect(within(anatomia).getAllByText("fixo do produto").length).toBeGreaterThan(0);
    expect(within(anatomia).getByText("Instruções adicionais do time")).toBeInTheDocument();
  });

  it("fatia D — a tela diz o que NÃO sai do prompt", () => {
    /**
     * Saber que "somente leitura" não sai é o que permite escrever o resto sem
     * medo. Sem essa marca, a caixa de texto parece poder tudo — e a §3 mediu o
     * que "poder tudo" custaria: *"um comando destrutivo colado num terminal
     * com acesso"*.
     */
    montar();

    fireEvent.click(screen.getByRole("button", { name: /Mapear componente/ }));
    const anatomia = screen.getByTestId("anatomia-scriptDeMapeamento");

    expect(within(anatomia).getAllByText("não sai do prompt").length).toBeGreaterThanOrEqual(2);
  });

  it("fatia F — o ✦ Sugerir existe por conversa, com o contexto do que ela faz", () => {
    /**
     * *"A aba já sabe propor um papel a partir de uma frase; propor um
     * preâmbulo de conversa é o mesmo gesto."* Sem o contexto, o modelo
     * escreveria um preâmbulo genérico — que é exatamente o que não serve.
     */
    montar();

    fireEvent.click(screen.getByRole("button", { name: /Conversar e decidir/ }));

    expect(screen.getByTestId("sugerir-ia-preambulo-de-conversa")).toBeInTheDocument();
  });

  it("a caixa diz que ACRESCENTA — a decisão que organiza a fatia inteira", () => {
    // Pergunta 2, respondida pelo usuário. Se a tela não disser isso, alguém
    // cola o prompt inteiro dele e passa a mandar duas vezes a mesma coisa.
    montar();

    expect(screen.getByTestId("conversas-do-assistente")).toHaveTextContent("acrescenta");
    expect(screen.getByTestId("conversas-do-assistente")).toHaveTextContent(
      "o que o produto pede continua valendo em caso de conflito"
    );
  });
});
