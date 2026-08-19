import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ItemGerado } from "../api/client";
import { ItensScreen } from "./ItensScreen";

/**
 * SPEC-41 Parte B — a tela responde as três perguntas do card (o que é /
 * posso exportar? / o que vem antes) e o vazio conduz de volta pra demanda.
 */
function item(chave: string, extra: Partial<ItemGerado> = {}): ItemGerado {
  return {
    id: chave,
    quebraId: "q1",
    chave,
    titulo: `Item ${chave}`,
    tipo: "atomica",
    tamanho: "P",
    dependencias: [],
    corpoMarkdown: `### ${chave}\n\ncorpo de ${chave}`,
    pendencias: 0,
    sugestoes: 0,
    estado: "gerado",
    linkExterno: null,
    criadoEm: new Date("2026-08-12T10:00:00Z").toISOString(),
    ...extra,
  };
}

function renderTela(itens: ItemGerado[]) {
  return render(
    <ItensScreen
      itens={itens}
      tituloDaQuebra="Catálogo mais rápido"
      onAbrirMenu={vi.fn()}
      onFechar={vi.fn()}
      onIrParaRevisao={vi.fn()}
    />
  );
}

describe("ItensScreen", () => {
  it("resumo diz quantos itens estão prontos pra exportar", () => {
    renderTela([item("a"), item("b", { pendencias: 3 }), item("c", { pendencias: 0, sugestoes: 2 })]);
    expect(screen.getByTestId("itens-resumo").textContent).toContain("1 de 3 itens prontos pra exportar");
  });

  it("a completude de cada card diz O QUE falta: campos a especificar, sugestões a confirmar ou pronto", () => {
    renderTela([item("a"), item("b", { pendencias: 3 }), item("c", { sugestoes: 1 })]);
    expect(screen.getByTestId("item-completude-0").textContent).toContain("Pronto pra exportar");
    expect(screen.getByTestId("item-completude-1").textContent).toContain("3 campos a especificar");
    expect(screen.getByTestId("item-completude-2").textContent).toContain("1 sugestão a confirmar");
  });

  it("SPEC-47 — a ESCRITA do item aparece de saída; recolher é que é sob demanda", () => {
    renderTela([item("a", { dependencias: ["enabler → n1::service"] })]);
    expect(screen.getByText(/enabler → n1::service/)).toBeInTheDocument();

    // A tela era uma lista de títulos; agora o texto do item está à vista.
    expect(screen.getByTestId("item-corpo-0").textContent).toContain("corpo de a");
    fireEvent.click(screen.getByTestId("item-expandir-0"));
    expect(screen.queryByTestId("item-corpo-0")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("item-expandir-0"));
    expect(screen.getByTestId("item-corpo-0").textContent).toContain("corpo de a");
  });

  it("SPEC-47 — o markdown é lido como texto: título vira título, lista vira lista, negrito vira negrito", () => {
    renderTela([
      item("a", {
        corpoMarkdown: [
          "### 1. Item — descrição",
          "",
          "**Tipo:** Task · **Tamanho:** P",
          "",
          "#### Entrega final",
          "",
          "- Serviço publicando na fila",
          "- Painel com o volume do dia",
        ].join("\n"),
      }),
    ]);

    const corpo = screen.getByTestId("item-corpo-0");
    // O texto está legível, sem os símbolos do markdown à mostra.
    expect(corpo.textContent).toContain("Entrega final");
    expect(corpo.textContent).not.toContain("####");
    expect(corpo.textContent).not.toContain("**Tipo:**");
    expect(corpo.querySelectorAll("li")).toHaveLength(2);
    expect(corpo.querySelector("strong")?.textContent).toBe("Tipo:");
  });

  it("item exportado mostra o link do tracker", () => {
    renderTela([item("a", { estado: "exportado", linkExterno: "https://jira.example/AB-12" })]);
    const link = screen.getByRole("link", { name: /abrir no tracker/ });
    expect(link).toHaveAttribute("href", "https://jira.example/AB-12");
  });

  it("vazio explica de onde os itens nascem e conduz pra demanda", () => {
    renderTela([]);
    expect(screen.getByTestId("itens-vazio").textContent).toContain("Nenhum item escrito ainda");
    expect(screen.getByRole("button", { name: "Ir para a demanda" })).toBeInTheDocument();
  });

  it("SPEC-49 — o botão exporta os PRONTOS e diz o destino; resultado mostra sucesso, erro e ignorados", async () => {
    const onExportar = vi.fn().mockResolvedValue({
      exportados: [item("a")],
      erros: [{ chave: "b", erro: "projeto AB não aceita issue do tipo Task" }],
      ignorados: ["c"],
      destino: "Jira do time",
    });
    render(
      <ItensScreen
        itens={[item("a"), item("b", { pendencias: 2 })]}
        tituloDaQuebra="Demanda X"
        onAbrirMenu={vi.fn()}
        onFechar={vi.fn()}
        onExportar={onExportar}
        destinoDaExportacao="Jira do time"
      />
    );

    expect(screen.getByTestId("exportar-prontos").textContent).toContain("Exportar prontos (1)");
    expect(screen.getByText(/destino: Jira do time/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("exportar-prontos"));
    await waitFor(() => expect(onExportar).toHaveBeenCalled());

    const resultado = await screen.findByTestId("resultado-exportacao");
    expect(resultado.textContent).toContain("1 item(ns) no Jira do time");
    expect(resultado.textContent).toContain("projeto AB não aceita");
    expect(resultado.textContent).toContain("1 ficaram de fora");
  });

  it("SPEC-49 — sem destino configurado, a tela DIZ onde configurar em vez de oferecer um botão que falharia", () => {
    render(
      <ItensScreen
        itens={[item("a")]}
        tituloDaQuebra="Demanda X"
        onAbrirMenu={vi.fn()}
        onFechar={vi.fn()}
        onExportar={vi.fn()}
        destinoDaExportacao={null}
      />
    );
    expect(screen.getByText(/sem destino configurado/)).toBeInTheDocument();
  });

  it("SPEC-49 — nenhum item pronto: o botão fica desligado (item pela metade não vira issue)", () => {
    render(
      <ItensScreen
        itens={[item("a", { pendencias: 3 })]}
        tituloDaQuebra="Demanda X"
        onAbrirMenu={vi.fn()}
        onFechar={vi.fn()}
        onExportar={vi.fn()}
        destinoDaExportacao="Jira"
      />
    );
    expect(screen.getByTestId("exportar-prontos")).toBeDisabled();
  });
});

/**
 * §269 — a outra saída da mesma demanda, no fluxo e não no menu.
 */
describe("ItensScreen — o caminho até o documento", () => {
  it("leva ao documento de desenho", () => {
    const onDocumento = vi.fn();
    render(
      <ItensScreen
        itens={[]}
        tituloDaQuebra="demanda"
        onAbrirMenu={vi.fn()}
        onFechar={vi.fn()}
        onDocumento={onDocumento}
      />
    );

    fireEvent.click(screen.getByTestId("itens-ir-ao-documento"));
    expect(onDocumento).toHaveBeenCalled();
  });

  it("sem o caminho ligado, o botão não aparece — nada de botão que não leva a lugar nenhum", () => {
    render(<ItensScreen itens={[]} tituloDaQuebra="demanda" onAbrirMenu={vi.fn()} onFechar={vi.fn()} />);

    expect(screen.queryByTestId("itens-ir-ao-documento")).toBeNull();
  });
});
