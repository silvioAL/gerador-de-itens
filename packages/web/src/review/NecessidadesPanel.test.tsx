import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Necessidade } from "@gerador/engine";
import { NecessidadesPanel } from "./NecessidadesPanel";

const ELEMENTOS = [
  { id: "n1", label: "worker-pagamento" },
  { id: "n2", label: "api-pedidos" },
];

function montar(necessidades: Necessidade[] = [], elementos = ELEMENTOS) {
  const onMudar = vi.fn();
  render(<NecessidadesPanel necessidades={necessidades} elementos={elementos} onMudar={onMudar} />);
  return { onMudar };
}

const necessidade = (p: Partial<Necessidade> & { id: string }): Necessidade => ({
  texto: `texto de ${p.id}`,
  origem: "manual",
  atendidaPor: [],
  ...p,
});

describe("NecessidadesPanel — o propósito da demanda (SPEC-57 fatia A)", () => {
  it("sem necessidade, diz que a demanda funciona igual — não acusa nada", () => {
    montar([]);
    expect(screen.getByText(/Nenhuma necessidade declarada/)).toBeInTheDocument();
  });

  it("adicionar cria necessidade manual, sem vínculo e sem confirmação pendente", async () => {
    const user = userEvent.setup();
    const { onMudar } = montar([]);

    await user.type(screen.getByLabelText("Nova necessidade"), "não cobrar duas vezes");
    await user.click(screen.getByRole("button", { name: "+ Adicionar" }));

    expect(onMudar).toHaveBeenCalledTimes(1);
    const [criadas] = onMudar.mock.calls[0] as [Necessidade[]];
    expect(criadas).toHaveLength(1);
    expect(criadas[0]).toMatchObject({
      texto: "não cobrar duas vezes",
      origem: "manual",
      atendidaPor: [],
    });
    // `manual` não nasce pendente: quem escreveu já decidiu.
    expect(criadas[0].confirmado).toBeUndefined();
  });

  it("texto em branco não vira necessidade", async () => {
    const user = userEvent.setup();
    const { onMudar } = montar([]);

    await user.type(screen.getByLabelText("Nova necessidade"), "   ");
    await user.click(screen.getByRole("button", { name: "+ Adicionar" }));

    expect(onMudar).not.toHaveBeenCalled();
  });

  it("necessidade sem vínculo aparece marcada como lacuna; com vínculo, não", () => {
    montar([necessidade({ id: "r1" }), necessidade({ id: "r2", atendidaPor: ["n1"] })]);

    expect(screen.getByTestId("necessidade-r1")).toHaveAttribute("data-lacuna", "sim");
    expect(screen.getByTestId("necessidade-r2")).not.toHaveAttribute("data-lacuna");
    // O rótulo do componente aparece como CHIP na r2 — e também como opção do
    // seletor da r1, que ainda pode vinculá-lo. Por isso a asserção é escopada.
    expect(screen.getByTestId("necessidade-r2")).toHaveTextContent("worker-pagamento");
  });

  it("vincular um componente fecha a lacuna", async () => {
    const user = userEvent.setup();
    const { onMudar } = montar([necessidade({ id: "r1", texto: "não cobrar duas vezes" })]);

    await user.selectOptions(
      screen.getByLabelText("Vincular componente a: não cobrar duas vezes"),
      "n1"
    );

    const [atualizadas] = onMudar.mock.calls[0] as [Necessidade[]];
    expect(atualizadas[0].atendidaPor).toEqual(["n1"]);
  });

  it("o mesmo componente não é vinculado duas vezes", async () => {
    const user = userEvent.setup();
    const { onMudar } = montar([necessidade({ id: "r1", texto: "x", atendidaPor: ["n1"] })]);

    // Já vinculado não aparece na lista de opções — e mesmo assim a checagem
    // existe no handler, porque a lista some mas o estado é quem manda.
    const seletor = screen.getByLabelText("Vincular componente a: x");
    expect(seletor).not.toHaveTextContent("worker-pagamento");
    await user.selectOptions(seletor, "n2");
    const [atualizadas] = onMudar.mock.calls[0] as [Necessidade[]];
    expect(atualizadas[0].atendidaPor).toEqual(["n1", "n2"]);
  });

  describe("regra 2 — nada conta até ser confirmado", () => {
    it("sugerida aparece marcada, e NÃO é acusada como lacuna", () => {
      montar([necessidade({ id: "r1", origem: "sugerido" })]);

      expect(screen.getByText(/Sugerida — ainda não conta/)).toBeInTheDocument();
      // Não conta = não acusa: o agente não pode criar vermelho sozinho.
      expect(screen.getByTestId("necessidade-r1")).not.toHaveAttribute("data-lacuna");
    });

    it("confirmar faz ela passar a contar — e aí a lacuna aparece", async () => {
      const user = userEvent.setup();
      const { onMudar } = montar([necessidade({ id: "r1", texto: "x", origem: "sugerido" })]);

      await user.click(screen.getByLabelText("Confirmar necessidade: x"));

      const [atualizadas] = onMudar.mock.calls[0] as [Necessidade[]];
      expect(atualizadas[0].confirmado).toBe(true);
    });
  });

  it("vínculo para componente apagado não some sozinho — aparece como quebrado", () => {
    // Decisão do engine: não cascatear. Apagar o nó que respondia por uma
    // necessidade é o evento que precisa REAPARECER, não ser silenciado.
    montar([necessidade({ id: "r1", atendidaPor: ["n9"] })]);

    expect(screen.getByText(/n9 \(removido\)/)).toBeInTheDocument();
    expect(screen.getByTestId("necessidade-r1")).toHaveAttribute("data-lacuna", "sim");
  });

  it("sem nós no desenho, não oferece vincular — mas ainda deixa declarar propósito", () => {
    montar([necessidade({ id: "r1", texto: "x" })], []);

    expect(screen.queryByLabelText("Vincular componente a: x")).not.toBeInTheDocument();
    expect(screen.getByTestId("necessidade-r1")).toHaveAttribute("data-lacuna", "sim");
  });

  it("remover tira a necessidade da lista", async () => {
    const user = userEvent.setup();
    const { onMudar } = montar([necessidade({ id: "r1", texto: "x" }), necessidade({ id: "r2" })]);

    await user.click(screen.getByLabelText("Remover necessidade: x"));

    const [restantes] = onMudar.mock.calls[0] as [Necessidade[]];
    expect(restantes.map((n) => n.id)).toEqual(["r2"]);
  });
});
