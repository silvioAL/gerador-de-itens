import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ANATOMIA_DO_PROMPT_PIPELINE, PREAMBULO_PADRAO_POR_PAPEL } from "@gerador/aplicacao";
import { PipelineAgentesTab } from "./PipelineAgentesTab";
import { PAPEIS_PADRAO } from "../api/client";


/** O editor de um papel só renderiza com o card aberto — clicar no nome é o
 * gesto que a pessoa faz. */
async function abrirCom(user: ReturnType<typeof userEvent.setup>, card: HTMLElement, nome: string) {
  await user.click(within(card).getByRole("button", { name: new RegExp(`^${nome}`) }));
}

function abrir(card: HTMLElement, nome: string) {
  fireEvent.click(within(card).getByRole("button", { name: new RegExp(`^${nome}`) }));
}

describe("PipelineAgentesTab (SPEC-24 Fase F — pipeline configurável)", () => {
  it("config antiga (só o toggle) mostra os 4 papéis de fábrica na ordem", () => {
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true }} onSalvar={vi.fn()} />);
    const cards = screen.getAllByTestId(/papel-config-/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      "papel-config-po",
      "papel-config-arquiteto",
      "papel-config-especialista",
      "papel-config-qa",
    ]);
  });

  it("alternar a confirmação salva na hora, levando os papéis juntos (o arquivo é um só)", async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true }} onSalvar={onSalvar} />);

    await user.click(screen.getByLabelText(/Confirmação obrigatória/i, { selector: "input" }));

    expect(onSalvar).toHaveBeenCalledWith({ confirmacaoObrigatoria: false, papeis: PAPEIS_PADRAO });
  });

  it("reordenar (↑) e salvar manda a nova ordem", async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={onSalvar} />);

    await user.click(screen.getByLabelText("Subir QA"));
    await user.click(screen.getByRole("button", { name: "Salvar papéis" }));

    const salvo = onSalvar.mock.calls[0][0];
    expect(salvo.papeis.map((p: { id: string }) => p.id)).toEqual(["po", "arquiteto", "qa", "especialista"]);
  });

  it("desativar um papel mantém ele na lista com ativo: false", async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={onSalvar} />);

    await user.click(screen.getByLabelText("Papel QA ativo"));
    await user.click(screen.getByRole("button", { name: "Salvar papéis" }));

    const salvo = onSalvar.mock.calls[0][0];
    expect(salvo.papeis.find((p: { id: string }) => p.id === "qa")).toMatchObject({ ativo: false });
  });

  it("+ Agente contextual cria papel custom editável (nome, contextos, prompt) e removível", async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={onSalvar} />);

    await user.click(screen.getByRole("button", { name: "+ Agente contextual" }));
    const card = screen.getByTestId("papel-config-agente-custom");

    const nome = within(card).getByLabelText("Nome");
    await user.clear(nome);
    await user.type(nome, "Especialista Kafka");
    await user.type(within(card).getByLabelText(/Contextos\/techs/), "Backend-mensagens, Kafka");
    // Papel novo nasce herdando o padrão da seção (#296): o prompt aparece em
    // leitura e só vira campo editável depois do clique, pra ninguém congelar
    // uma cópia do padrão por acidente.
    await user.click(within(card).getByRole("button", { name: /Editar a partir deste texto/ }));
    const prompt = within(card).getByTestId("preambulo-agente-custom");
    await user.clear(prompt);
    await user.type(prompt, "Você é o especialista em mensageria do time.");
    await user.click(screen.getByRole("button", { name: "Salvar papéis" }));

    const salvo = onSalvar.mock.calls[0][0];
    expect(salvo.papeis.at(-1)).toMatchObject({
      id: "agente-custom",
      nome: "Especialista Kafka",
      grupo: "especialista",
      contextos: ["Backend-mensagens", "Kafka"],
      preambulo: "Você é o especialista em mensageria do time.",
      ativo: true,
    });

    // Papel custom pode ser removido; os 4 padrão, não (só desativados).
    expect(within(card).getByLabelText(/Remover/)).toBeInTheDocument();
    expect(within(screen.getByTestId("papel-config-po")).queryByLabelText(/Remover/)).not.toBeInTheDocument();
  });
  /**
   * ACHADO REAL do usuário (#296): *"não consigo ver o conteúdo atual dos
   * prompts nessa parte dedicada a edição, deveriam estar disponíveis para
   * edição, os locais das variáveis também parecem não aparecer"*.
   *
   * Eram dois defeitos numa frase — o prompt herdado invisível e a montagem
   * do resto invisível. Um teste pra cada.
   */
  describe("o prompt EFETIVO fica visível, e a montagem do resto é explicada (#296)", () => {
    it("papel sem prompt custom MOSTRA o padrão da seção — não um campo em branco", () => {
      render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={vi.fn()} />);

      const card = screen.getByTestId("papel-config-po");
      abrir(card, "PO");
      const herdado = within(card).getByTestId("preambulo-herdado-po");
      // O texto exato vem da camada de aplicação; o que este teste garante é
      // que é o MESMO que a esteira manda, não uma cópia recontada aqui.
      expect(herdado.textContent).toBe(PREAMBULO_PADRAO_POR_PAPEL.po);
      expect(herdado.textContent!.length).toBeGreaterThan(100);
    });

    it("'Editar a partir deste texto' copia o padrão pro campo, em vez de começar do vazio", async () => {
      const onSalvar = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={onSalvar} />);

      const card = screen.getByTestId("papel-config-qa");
      await abrirCom(user, card, "QA");
      await user.click(within(card).getByRole("button", { name: /Editar a partir deste texto/ }));

      expect(within(card).getByTestId("preambulo-qa")).toHaveValue(PREAMBULO_PADRAO_POR_PAPEL.qa);
    });

    it("herdado NÃO é salvo como cópia enquanto ninguém edita — senão o papel congela numa versão do padrão", async () => {
      const onSalvar = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={onSalvar} />);

      // Mexe em outra coisa qualquer e salva.
      const card = screen.getByTestId("papel-config-po");
      await abrirCom(user, card, "PO");
      const nome = within(card).getByLabelText("Nome");
      await user.type(nome, " sênior");
      await user.click(screen.getByRole("button", { name: "Salvar papéis" }));

      const salvo = onSalvar.mock.calls[0][0];
      expect(salvo.papeis.find((p: { id: string }) => p.id === "po").preambulo ?? "").toBe("");
    });

    it("'Voltar ao padrão da seção' devolve o papel pra herança", async () => {
      const onSalvar = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      const papeis = PAPEIS_PADRAO.map((p) => (p.id === "po" ? { ...p, preambulo: "prompt meu" } : p));
      render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis }} onSalvar={onSalvar} />);

      const card = screen.getByTestId("papel-config-po");
      await abrirCom(user, card, "PO");
      expect(within(card).getByTestId("preambulo-po")).toHaveValue("prompt meu");
      await user.click(within(card).getByRole("button", { name: /Voltar ao padrão da seção/ }));

      expect(within(card).getByTestId("preambulo-herdado-po")).toBeInTheDocument();
    });

    it("a anatomia lista TODAS as partes do prompt, com de onde cada uma vem", () => {
      render(<PipelineAgentesTab config={{ confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }} onSalvar={vi.fn()} />);

      const bloco = screen.getByTestId("anatomia-do-prompt");
      // A lista vem da camada de aplicação, e lá um teste monta um prompt de
      // verdade pra provar que cada parte existe nele. Aqui só se garante que a
      // tela não deixa nenhuma de fora.
      for (const parte of ANATOMIA_DO_PROMPT_PIPELINE) {
        expect(within(bloco).getByText(parte.rotulo)).toBeInTheDocument();
      }
      expect(ANATOMIA_DO_PROMPT_PIPELINE.length).toBeGreaterThan(3);
    });
  });
});
