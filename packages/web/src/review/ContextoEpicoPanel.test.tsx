import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextoEpicoPanel } from "./ContextoEpicoPanel";

describe("ContextoEpicoPanel (Fase 1b, SPEC-23)", () => {
  it("pré-preenche com demandInfo/anexosContexto já salvos, e Salvar devolve o texto editado", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();

    render(
      <ContextoEpicoPanel
        demandInfo="Contexto anterior."
        anexosContexto={[{ nome: "retro.md", conteudo: "conteúdo anterior" }]}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />
    );

    const textarea = screen.getByLabelText("Contexto da demanda (texto)");
    expect(textarea).toHaveValue("Contexto anterior.");
    expect(screen.getByText("retro.md")).toBeInTheDocument();

    await user.type(textarea, " Mais detalhe.");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    // SPEC-53 — o terceiro argumento é o produto da demanda; sem seletor na
    // tela (nenhum produto cadastrado), ele é `null`, não `undefined`: "nenhum
    // produto" é uma resposta, e é ela que precisa atravessar até o banco.
    expect(onSalvar).toHaveBeenCalledWith(
      "Contexto anterior. Mais detalhe.",
      [{ nome: "retro.md", conteudo: "conteúdo anterior" }],
      null,
      // SPEC-57 fatia A — o propósito viaja no mesmo salvar. Vazio aqui: este
      // teste é sobre o contexto em prosa, e o painel não pode inventar
      // necessidade nenhuma por conta própria.
      [],
      // SPEC-70 — a volumetria também viaja no mesmo salvar. `undefined` sem
      // campo preenchido: em branco não é uma promessa.
      undefined,
      // SPEC-87 — e o REGIME, pelo mesmo motivo e no mesmo lugar: uma diz
      // quanto, a outra diz em que condições. `undefined` = nenhum declarado,
      // que é o padrão e é uma afirmação legítima.
      undefined
    );
  });

  it("anexar um arquivo de texto lê o conteúdo via FileReader e adiciona à lista", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();

    render(<ContextoEpicoPanel onSalvar={onSalvar} onFechar={vi.fn()} />);

    const arquivo = new File(["conteúdo do arquivo"], "material.txt", { type: "text/plain" });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, arquivo);

    expect(await screen.findByText("material.txt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith("", [{ nome: "material.txt", conteudo: "conteúdo do arquivo" }], null, [], undefined, undefined);
  });

  it("remover um anexo já adicionado tira só aquele, preservando os demais", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();

    render(
      <ContextoEpicoPanel
        anexosContexto={[
          { nome: "a.md", conteudo: "conteúdo a" },
          { nome: "b.md", conteudo: "conteúdo b" },
        ]}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remover anexo a.md" }));
    expect(screen.queryByText("a.md")).not.toBeInTheDocument();
    expect(screen.getByText("b.md")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith("", [{ nome: "b.md", conteudo: "conteúdo b" }], null, [], undefined, undefined);
  });

  it("Cancelar fecha sem chamar onSalvar", async () => {
    const onSalvar = vi.fn();
    const onFechar = vi.fn();
    const user = userEvent.setup();

    render(<ContextoEpicoPanel onSalvar={onSalvar} onFechar={onFechar} />);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onSalvar).not.toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalled();
  });
});

/**
 * SPEC-53 — o produto da demanda mora aqui, e não no header: é a mesma
 * pergunta do resto do painel ("de que estamos falando"), só que respondida
 * uma vez por produto em vez de recolada a cada demanda.
 */
describe("ContextoEpicoPanel — o produto da demanda (SPEC-53)", () => {
  const produtos = [
    { id: "p1", nome: "Portabilidade" },
    { id: "p2", nome: "Fatura" },
  ];

  it("escolher o produto devolve o id no salvar", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();
    render(<ContextoEpicoPanel produtos={produtos} onSalvar={onSalvar} onFechar={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Produto desta demanda"), "p2");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith("", [], "p2", [], undefined, undefined);
  });

  it("sem produto cadastrado, o seletor NÃO aparece — lista vazia é pior que nada", () => {
    render(<ContextoEpicoPanel produtos={[]} onSalvar={vi.fn()} onFechar={vi.fn()} />);
    expect(screen.queryByLabelText("Produto desta demanda")).not.toBeInTheDocument();
  });

  it("a demanda que já tinha produto abre com ele selecionado", () => {
    render(<ContextoEpicoPanel produtos={produtos} produtoId="p1" onSalvar={vi.fn()} onFechar={vi.fn()} />);
    expect(screen.getByLabelText("Produto desta demanda")).toHaveValue("p1");
  });

  it("voltar para '— nenhum —' desliga o vínculo: null, não string vazia", async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();
    render(<ContextoEpicoPanel produtos={produtos} produtoId="p1" onSalvar={onSalvar} onFechar={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Produto desta demanda"), "");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith("", [], null, [], undefined, undefined);
  });
});

/**
 * SPEC-57 fatia A — o propósito mora aqui, junto do resto do contexto da
 * demanda. Este teste é a costura: o painel de necessidades aparece dentro
 * deste, e o que se edita nele sai no mesmo Salvar.
 */
describe("ContextoEpicoPanel — o propósito da demanda (SPEC-57)", () => {
  it("mostra as necessidades já declaradas e devolve as editadas no salvar", async () => {
    const user = userEvent.setup();
    const onSalvar = vi.fn();
    render(
      <ContextoEpicoPanel
        necessidades={[{ id: "r1", texto: "não cobrar duas vezes", origem: "manual", atendidaPor: [] }]}
        elementos={[{ id: "n1", label: "worker" }]}
        onSalvar={onSalvar}
        onFechar={() => {}}
      />
    );

    expect(screen.getByText("não cobrar duas vezes")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nova necessidade"), "confirmar em 2s");
    await user.click(screen.getByRole("button", { name: "+ Adicionar" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const [, , , necessidades] = onSalvar.mock.calls[0];
    expect(necessidades.map((n: { texto: string }) => n.texto)).toEqual([
      "não cobrar duas vezes",
      "confirmar em 2s",
    ]);
  });
});

/**
 * SPEC-57 fatia D — a costura entre o painel e o agente. O que se prova aqui é
 * que a proposta chega como SUGERIDA (regra 2 aplicada na fronteira, não
 * confiando no bom comportamento do modelo) e que o já declarado viaja junto.
 */
describe("ContextoEpicoPanel — a proposta do agente (SPEC-57 fatia D)", () => {
  it("manda as já declaradas e adiciona o que voltou, sem confirmar nada", async () => {
    const user = userEvent.setup();
    const onProporNecessidades = vi.fn().mockResolvedValue([
      { id: "ia-1", texto: "confirmar em 2s", origem: "sugerido", confirmado: false, atendidaPor: [] },
    ]);

    render(
      <ContextoEpicoPanel
        necessidades={[{ id: "r1", texto: "não cobrar duas vezes", origem: "manual", atendidaPor: [] }]}
        elementos={[{ id: "n1", label: "worker" }]}
        onProporNecessidades={onProporNecessidades}
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "✦ Propor a partir do contexto" }));

    // O já declarado vai junto: repropor o que a pessoa escreveu faz ela parar
    // de ler a lista.
    // O contexto da TELA vai junto (defeito achado no E2E: o agente lia o
    // `demandInfo` salvo, então quem escrevia e pedia proposta na mesma sessão
    // recebia "sem contexto").
    expect(onProporNecessidades).toHaveBeenCalledWith(["não cobrar duas vezes"], "");
    expect(await screen.findByText("confirmar em 2s")).toBeInTheDocument();
    // E chega sem contar: o delta aparece justamente porque nada foi aceito.
    expect(screen.getByTestId("delta-da-proposta")).toHaveTextContent("1 sugerida(s)");
  });

  it("falha do agente é dita ali, e não apaga o que já estava escrito", async () => {
    const user = userEvent.setup();
    render(
      <ContextoEpicoPanel
        necessidades={[{ id: "r1", texto: "não cobrar duas vezes", origem: "manual", atendidaPor: [] }]}
        onProporNecessidades={vi.fn().mockRejectedValue(new Error("gateway fora do ar"))}
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "✦ Propor a partir do contexto" }));

    expect(await screen.findByText("gateway fora do ar")).toBeInTheDocument();
    expect(screen.getByText("não cobrar duas vezes")).toBeInTheDocument();
  });

  it("sem quem proponha, o botão não aparece", () => {
    render(<ContextoEpicoPanel onSalvar={vi.fn()} onFechar={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Propor a partir do contexto/ })).not.toBeInTheDocument();
  });
});

/**
 * SPEC-70 fatia D — o volume da demanda, dito UMA vez.
 *
 * Era o custo que o usuário apontou olhando o `pico de [—] req/s` dentro de um
 * ajuste de ensaio: *"assim o usuário não precisa preencher"*. O número passa a
 * ser dito onde ele é conhecido — na demanda —, e o motor o distribui.
 */
describe("ContextoEpicoPanel — a volumetria da demanda (SPEC-70)", () => {
  it("o volume viaja no mesmo salvar, na unidade que a pessoa escolheu", () => {
    const onSalvar = vi.fn();
    render(<ContextoEpicoPanel onSalvar={onSalvar} onFechar={vi.fn()} />);

    fireEvent.change(screen.getByTestId("volumetria-quantidade"), { target: { value: "2000000" } });
    fireEvent.change(screen.getByTestId("volumetria-por"), { target: { value: "dia" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith("", [], null, [], { quantidade: 2000000, por: "dia" }, undefined);
  });

  it("a prévia mostra o req/s ENQUANTO se digita — é o número que a conta usa", () => {
    // Escondê-lo faria a acusação de saturação citar um valor que não está em
    // lugar nenhum da tela.
    render(<ContextoEpicoPanel onSalvar={vi.fn()} onFechar={vi.fn()} />);

    fireEvent.change(screen.getByTestId("volumetria-quantidade"), { target: { value: "600" } });
    fireEvent.change(screen.getByTestId("volumetria-por"), { target: { value: "minuto" } });

    expect(screen.getByTestId("volumetria-derivada")).toHaveTextContent("10 req/s");
  });

  it("campo em branco não é uma promessa — sai `undefined`, não zero", () => {
    const onSalvar = vi.fn();
    render(<ContextoEpicoPanel onSalvar={onSalvar} onFechar={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith("", [], null, [], undefined, undefined);
    // E, sem número, a linha explica para que serve em vez de mostrar conta.
    expect(screen.getByTestId("volumetria-derivada")).toHaveTextContent(/sem ninguém digitar número/);
  });

  it("o volume já salvo volta preenchido — inclusive a unidade", () => {
    render(
      <ContextoEpicoPanel
        volumetria={{ quantidade: 500, por: "hora" }}
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />
    );

    expect((screen.getByTestId("volumetria-quantidade") as HTMLInputElement).value).toBe("500");
    expect((screen.getByTestId("volumetria-por") as HTMLSelectElement).value).toBe("hora");
  });
});

/**
 * SPEC-77 fatia C — de onde veio o volume que está valendo.
 *
 * A régua é a do §306: **declarado vence herdado, e a tela diz qual é qual.**
 * O que ela impede é concreto — alguém ver "2 milhões/dia" e não saber se foi
 * digitado ali ou veio do produto, e portanto se mudar o produto muda aquele
 * número ou não.
 */
describe("ContextoEpicoPanel — a procedência do volume (SPEC-77 fatia C)", () => {
  const doProduto = { quantidade: 2_000_000, por: "dia" as const };

  it("sem volume próprio, a tela diz que está HERDANDO — e os campos ficam vazios", () => {
    render(
      <ContextoEpicoPanel
        volumetriaEmVigor={{ valor: doProduto, origem: "herdada" }}
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />
    );

    expect(screen.getByTestId("volumetria-herdada")).toHaveTextContent("herdado do produto");
    // Os campos vazios são o ponto: preenchê-los com o número herdado faria o
    // próximo Salvar gravá-lo como declarado, e a demanda congelaria a versão
    // do produto do dia em que foi aberta.
    expect(screen.getByTestId("volumetria-quantidade")).toHaveValue(null);
  });

  it("quando a demanda DISCORDA do produto, os dois números aparecem", () => {
    render(
      <ContextoEpicoPanel
        volumetria={{ quantidade: 100, por: "segundo" }}
        volumetriaEmVigor={{ valor: { quantidade: 100, por: "segundo" }, origem: "declarada", doProduto }}
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />
    );

    const aviso = screen.getByTestId("volumetria-diverge");
    expect(aviso).toHaveTextContent("2.000.000 por dia");
    // E diz o que a divergência NÃO faz: mexer aqui não mexe no produto.
    expect(aviso).toHaveTextContent("Mudar aqui não muda o produto");
  });

  it("declarar o mesmo número do produto não acusa divergência", () => {
    // Aviso que aparece onde não há discordância vira ruído, e ruído se
    // aprende a ignorar.
    render(
      <ContextoEpicoPanel
        volumetria={doProduto}
        volumetriaEmVigor={{ valor: doProduto, origem: "declarada" }}
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />
    );

    expect(screen.queryByTestId("volumetria-diverge")).toBeNull();
    expect(screen.queryByTestId("volumetria-herdada")).toBeNull();
  });
});

describe("ContextoEpicoPanel — o regime de operação (SPEC-87 fatia D)", () => {
  it("sem regimes declarados pelo time, o seletor NÃO aparece", () => {
    // Um seletor com só a opção vazia ensina que o campo não serve para nada —
    // e time que não usa o eixo não deve nem saber que ele existe.
    render(<ContextoEpicoPanel onSalvar={vi.fn()} onFechar={vi.fn()} />);

    expect(screen.queryByTestId("modo-de-operacao")).toBeNull();
  });

  it("com regimes do time, escolher um o manda no MESMO salvar da volumetria", async () => {
    /**
     * Vai junto porque é o par natural: uma diz QUANTO, a outra diz EM QUE
     * REGIME, e as duas são declarações sobre esta demanda feitas no mesmo lugar.
     */
    const user = userEvent.setup();
    const onSalvar = vi.fn();
    render(<ContextoEpicoPanel onSalvar={onSalvar} onFechar={vi.fn()} modosDoTime={["normal", "pico"]} />);

    await user.selectOptions(screen.getByLabelText("Regime de operação"), "pico");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith("", [], null, [], undefined, "pico");
  });

  it("'nenhum declarado' devolve `undefined`, não string vazia", async () => {
    // "Não declarou regime" é o padrão e é uma afirmação: régua sem modo
    // continua valendo, régua com modo não aparece. String vazia atravessaria a
    // borda como um regime chamado "".
    const user = userEvent.setup();
    const onSalvar = vi.fn();
    render(
      <ContextoEpicoPanel onSalvar={onSalvar} onFechar={vi.fn()} modosDoTime={["normal"]} modoDeOperacao="normal" />
    );

    await user.selectOptions(screen.getByLabelText("Regime de operação"), "");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith("", [], null, [], undefined, undefined);
  });

  it("o regime já declarado vem pré-selecionado", () => {
    render(
      <ContextoEpicoPanel onSalvar={vi.fn()} onFechar={vi.fn()} modosDoTime={["normal", "pico"]} modoDeOperacao="pico" />
    );

    expect(screen.getByLabelText("Regime de operação")).toHaveValue("pico");
  });
});
