import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PapelConfigurado } from "../api/client";
import { EsteiraAoVivo } from "./EsteiraAoVivo";

/**
 * §411 — a experiência visual que existia antes de a esteira virar um fluxo
 * plugável (`review/EsteiraAgentes.tsx`, morta na SPEC-107 G5c-3 junto com a
 * tela de revisão). Resgatada e plugada na execução AO VIVO de verdade — o
 * que este arquivo cobre é o DESENHO (quem está feito, quem está ativo, quem
 * ainda nem começou), não o motor de execução, que já tem prova própria em
 * `FluxoScreen`.
 */
function papel(id: string, nome: string, p: Partial<PapelConfigurado> = {}): PapelConfigurado {
  return { id, nome, ativo: true, grupo: "po", contextos: [], ...p };
}

const PAPEIS = [papel("po", "PO"), papel("arquiteto", "Arquiteto"), papel("qa", "QA")];

describe("EsteiraAoVivo", () => {
  it("sem papel nenhum, não renderiza — não há o que mostrar", () => {
    const { container } = render(<EsteiraAoVivo papeis={[]} papelAtual={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("em repouso (sem papelAtual, sem conclusão), nenhum papel está feito", () => {
    render(<EsteiraAoVivo papeis={PAPEIS} papelAtual={null} />);
    for (const p of PAPEIS) {
      expect(screen.getByTestId(`handoff-${p.id}`).textContent).not.toContain("✓");
    }
  });

  it("o papel ATIVO aparece marcado (aria-current), os anteriores como feito", () => {
    render(<EsteiraAoVivo papeis={PAPEIS} papelAtual="arquiteto" atividadeAtual="escrevendo o contrato…" />);

    expect(screen.getByTestId("handoff-po").textContent).toContain("✓");
    expect(screen.getByTestId("handoff-arquiteto")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("handoff-arquiteto").textContent).toContain("escrevendo o contrato…");
    // QA ainda não chegou — nem feito, nem ativo.
    expect(screen.getByTestId("handoff-qa").textContent).not.toContain("✓");
    expect(screen.getByTestId("handoff-qa")).not.toHaveAttribute("aria-current");
  });

  it("concluída: TODOS ficam marcados como feito, mesmo sem papelAtual apontando pro último", () => {
    // A corrida pode ter menos nós que papéis (um item não bate com o
    // contexto de ninguém) — `concluida` não pode depender de o índice do
    // último papel ter aparecido como `papelAtual` em algum evento.
    render(<EsteiraAoVivo papeis={PAPEIS} papelAtual={null} concluida />);
    for (const p of PAPEIS) {
      expect(screen.getByTestId(`handoff-${p.id}`).textContent).toContain("✓");
    }
  });

  it("sem atividade (texto ainda não chegou), o subtítulo cai na descrição do papel", () => {
    render(
      <EsteiraAoVivo
        papeis={[papel("po", "PO", { descricao: "Escreve a história" })]}
        papelAtual="po"
      />
    );
    expect(screen.getByTestId("handoff-po").textContent).toContain("Escreve a história");
  });
});
