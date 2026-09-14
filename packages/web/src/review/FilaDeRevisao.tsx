import { useEffect, useState } from "react";
import type { ValorSpec } from "@gerador/engine";
import type { PendenteDeConfirmacao } from "./pendencias";

/**
 * SPEC-44 Fase 2 — a fila guiada: UMA sugestão por vez, avanço automático
 * atravessando itens. A fila é um SNAPSHOT das pendências no momento de
 * abrir — a lista viva encolheria sob o usuário a cada confirmação. Editar
 * o texto antes de confirmar grava como `manual` (foi edição humana);
 * confirmar sem tocar assina a sugestão (`sugerido` + confirmado).
 */
export interface FilaDeRevisaoProps {
  pendentes: PendenteDeConfirmacao[];
  onConfirmar: (itemChave: string, chave: string, resposta: ValorSpec) => void;
  /** Descartar = remover a resposta (o campo volta a "✍️ especificar"). */
  onDescartar: (itemChave: string, chave: string) => void;
  onFechar: () => void;
}

export function FilaDeRevisao({ pendentes, onConfirmar, onDescartar, onFechar }: FilaDeRevisaoProps) {
  const [indice, setIndice] = useState(0);
  const [texto, setTexto] = useState<string | null>(null);

  const atual = pendentes[indice];
  const valorOriginal = typeof atual?.resposta.valor === "string" ? atual.resposta.valor : String(atual?.resposta.valor ?? "");
  const valorAtual = texto ?? valorOriginal;

  function avancar() {
    setTexto(null);
    if (indice + 1 >= pendentes.length) onFechar();
    else setIndice(indice + 1);
  }

  function confirmar() {
    if (!atual || !valorAtual.trim()) return;
    const editou = valorAtual !== valorOriginal;
    onConfirmar(
      atual.itemChave,
      atual.chave,
      editou ? { valor: valorAtual, origem: "manual" } : { ...atual.resposta, confirmado: true }
    );
    avancar();
  }

  function descartar() {
    if (!atual) return;
    onDescartar(atual.itemChave, atual.chave);
    avancar();
  }

  // Enter confirma (Shift+Enter quebra linha no textarea); Esc fecha.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  if (!atual) return null;

  return (
    <>
      <div onClick={onFechar} style={fundoEstilo} aria-hidden="true" />
      <section aria-label="Revisão guiada" data-testid="fila-de-revisao" style={painelEstilo}>
        <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 13.5 }}>Revisão guiada</strong>
          <span data-testid="fila-progresso" style={{ fontSize: 12, color: "var(--texto-fraco)" }}>
            {indice + 1} de {pendentes.length}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={onFechar} aria-label="Fechar revisão guiada" style={fecharEstilo}>
            ×
          </button>
        </header>

        <p style={{ fontSize: 12, color: "var(--texto-fraco)", margin: "10px 0 2px" }}>
          {atual.itemRotulo} · {atual.tech || "Geral"}
        </p>
        <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 8px" }} data-testid="fila-rotulo">
          {atual.rotulo}
        </p>

        <textarea
          aria-label="Texto da sugestão"
          value={valorAtual}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              confirmar();
            }
          }}
          rows={6}
          style={textareaEstilo}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <button onClick={confirmar} disabled={!valorAtual.trim()} style={primarioEstilo} data-testid="fila-confirmar">
            Confirmar (Enter)
          </button>
          <button onClick={avancar} style={secundarioEstilo} data-testid="fila-pular">
            Pular
          </button>
          <button onClick={descartar} style={{ ...secundarioEstilo, color: "var(--vermelho)" }} data-testid="fila-descartar">
            Descartar
          </button>
          <span style={{ fontSize: 11, color: "var(--texto-mudo)", marginLeft: "auto" }}>
            editar antes de confirmar grava como manual
          </span>
        </div>
      </section>
    </>
  );
}

const fundoEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.55)",
  zIndex: 74,
};

const painelEstilo: React.CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 560,
  maxWidth: "92vw",
  background: "var(--painel)",
  border: "1px solid var(--borda-forte)",
  borderRadius: 14,
  padding: "16px 18px",
  zIndex: 75,
  boxShadow: "0 18px 60px rgba(0, 0, 0, 0.5)",
  fontFamily: "system-ui, sans-serif",
};

const textareaEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 12.5,
  lineHeight: 1.55,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
  resize: "vertical",
  boxSizing: "border-box",
};

const primarioEstilo: React.CSSProperties = {
  fontSize: 12.5,
  padding: "7px 14px",
  borderRadius: 8,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
};

const secundarioEstilo: React.CSSProperties = {
  fontSize: 12.5,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto)",
  cursor: "pointer",
};

const fecharEstilo: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--texto-fraco)",
  fontSize: 18,
  cursor: "pointer",
  lineHeight: 1,
};
