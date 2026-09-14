import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PREAMBULO_PADRAO_POR_PAPEL } from "@gerador/aplicacao";
import { PAPEIS_PADRAO } from "../api/client";
import { SimulacaoEsteira } from "./SimulacaoEsteira";
import { TAM_LOTE_ESTEIRA, type ItemFilaEsteira } from "./useEsteiraDeAgentes";

/**
 * #299 — a tela que responde, ANTES de gastar: quantas chamadas esta quebra
 * custa e o que exatamente vai em cada uma.
 */
function item(n: number, papeis: string[]): ItemFilaEsteira {
  return {
    atividadeChave: `n${n}::ep0`,
    atividadeRotulo: `Serviço ${n} — POST /recurso`,
    contextoNo: `Serviço (Java/Spring Boot), nó n${n}`,
    placeholdersPorPapel: Object.fromEntries(
      papeis.map((p) => [p, [{ chave: `campo-${p}`, tech: "java", rotulo: `Campo do ${p}` }]])
    ),
  };
}

describe("SimulacaoEsteira (#299)", () => {
  it("mostra quantas chamadas sairiam e o tamanho somado — o custo antes do gasto", () => {
    const fila = Array.from({ length: TAM_LOTE_ESTEIRA + 1 }, (_, i) => item(i + 1, ["po", "qa"]));
    render(<SimulacaoEsteira fila={fila} papeis={PAPEIS_PADRAO} onFechar={vi.fn()} />);

    // 2 lotes do PO + 2 do QA (6 itens, lotes de 5).
    expect(screen.getByTestId("simulacao-resumo").textContent).toContain("4");
    // Caracteres e NÃO tokens, dito na tela: um número que parece token e não
    // é vira decisão errada de janela de contexto.
    expect(screen.getByTestId("simulacao-resumo").textContent).toContain("não tokens");
  });

  it("o primeiro lote abre já expandido, com o prompt de verdade dentro", () => {
    render(<SimulacaoEsteira fila={[item(1, ["po"])]} papeis={PAPEIS_PADRAO} onFechar={vi.fn()} />);

    const prompt = screen.getByTestId("simulacao-prompt-0").textContent ?? "";
    // O preâmbulo REAL do papel, vindo da camada de aplicação — não um resumo.
    expect(prompt).toContain(PREAMBULO_PADRAO_POR_PAPEL.po);
    expect(prompt).toContain("Serviço 1 — POST /recurso");
    expect(prompt).toContain("Campos a responder");
  });

  it("o contexto do épico aparece no prompt quando existe", () => {
    render(
      <SimulacaoEsteira
        fila={[item(1, ["po"])]}
        papeis={PAPEIS_PADRAO}
        contextoEpico="Portabilidade de consignado, prazo regulatório de 5 dias."
        onFechar={vi.fn()}
      />
    );
    expect(screen.getByTestId("simulacao-prompt-0").textContent).toContain("prazo regulatório de 5 dias");
  });

  it("fila sem trabalho diz isso em vez de mostrar zero chamadas em branco", () => {
    render(<SimulacaoEsteira fila={[]} papeis={PAPEIS_PADRAO} onFechar={vi.fn()} />);
    expect(screen.getByTestId("simulacao-vazia").textContent).toContain("não faria chamada nenhuma");
  });

  it("copiar leva o prompt inteiro pra área de transferência", async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    // Depois do `setup()` (que instala o clipboard dele) e via
    // `defineProperty`: `navigator.clipboard` é getter-only, então
    // `Object.assign` estoura. Sobrescrever antes faria o teste aferir o dublê
    // do userEvent em vez do componente.
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: escrever },
      configurable: true,
    });
    render(<SimulacaoEsteira fila={[item(1, ["po"])]} papeis={PAPEIS_PADRAO} onFechar={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Copiar prompt" }));

    expect(escrever).toHaveBeenCalledWith(screen.getByTestId("simulacao-prompt-0").textContent);
  });

  it("Fechar devolve o controle — a simulação não prende ninguém", async () => {
    const onFechar = vi.fn();
    const user = userEvent.setup();
    render(<SimulacaoEsteira fila={[item(1, ["po"])]} papeis={PAPEIS_PADRAO} onFechar={onFechar} />);

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onFechar).toHaveBeenCalled();
  });
});
