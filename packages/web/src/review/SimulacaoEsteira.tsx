import { useMemo, useState } from "react";
import { simularEsteira, type LoteSimulado } from "./lotesDaEsteira";
import type { ItemFilaEsteira } from "./useEsteiraDeAgentes";
import type { PapelConfigurado } from "../api/client";

export interface SimulacaoEsteiraProps {
  fila: ItemFilaEsteira[];
  papeis: PapelConfigurado[];
  contextoEpico?: string;
  /** SPEC-53 — a simulação mostra o prompt REAL, e o do produto faz parte dele. */
  contextoDoProduto?: string;
  onFechar: () => void;
}

/**
 * #299 — o que a esteira MANDARIA, sem mandar.
 *
 * O usuário pediu isto junto com o #296: *"a parte dos prompts que rodam ficou
 * um pouco mais transparente durante a execução, mas deveria ter alguma forma
 * de simular"*. Duas perguntas que só isto responde antes de gastar a chamada:
 * quantas chamadas esta quebra vai custar, e o que exatamente vai em cada uma.
 *
 * O texto aqui não é montado por este componente — vem de `simularEsteira`, que
 * usa a MESMA função da borda. Ver o cabeçalho de `lotesDaEsteira.ts`.
 */
export function SimulacaoEsteira({ fila, papeis, contextoEpico, contextoDoProduto, onFechar }: SimulacaoEsteiraProps) {
  const lotes = useMemo(
    () => simularEsteira({ fila, papeis, contextoEpico, contextoDoProduto }),
    [fila, papeis, contextoEpico, contextoDoProduto]
  );
  const [aberto, setAberto] = useState<number | null>(lotes.length > 0 ? 0 : null);
  const [copiado, setCopiado] = useState<number | null>(null);

  const totalCaracteres = lotes.reduce((n, l) => n + l.caracteres, 0);

  async function copiar(lote: LoteSimulado, i: number) {
    await navigator.clipboard.writeText(lote.prompt);
    setCopiado(i);
    setTimeout(() => setCopiado((atual) => (atual === i ? null : atual)), 1800);
  }

  return (
    <div style={sobreposicaoEstilo} data-testid="simulacao-esteira">
      <div style={painelEstilo}>
        <header style={cabecalhoEstilo}>
          <div>
            <strong style={{ fontSize: 15, color: "var(--texto)" }}>Simulação da esteira</strong>
            <p style={subtituloEstilo}>
              O que seria enviado ao modelo se você rodasse agora — <strong>sem gastar chamada nenhuma</strong>.
            </p>
          </div>
          <button onClick={onFechar} style={botaoEstilo}>
            Fechar
          </button>
        </header>

        {lotes.length === 0 ? (
          <p style={vazioEstilo} data-testid="simulacao-vazia">
            Nenhum papel tem trabalho nesta quebra: todos os campos já estão preenchidos, ou nenhum papel ativo se
            aplica aos itens. Rodar a esteira agora não faria chamada nenhuma.
          </p>
        ) : (
          <>
            <p style={resumoEstilo} data-testid="simulacao-resumo">
              <strong>{lotes.length}</strong> chamada(s) ao modelo, somando{" "}
              <strong>{totalCaracteres.toLocaleString("pt-BR")}</strong> caracteres de prompt.{" "}
              {/* Caracteres, e não tokens, dito assim de propósito: um número que
                  parece token e não é vira decisão errada de janela. */}
              <span style={{ color: "var(--texto-fraco)" }}>
                (caracteres, não tokens — a conversão depende do modelo)
              </span>
            </p>

            <ol style={listaEstilo}>
              {lotes.map((lote, i) => (
                <li key={`${lote.papelId}-${lote.indice}`} style={itemEstilo}>
                  <button onClick={() => setAberto(aberto === i ? null : i)} style={linhaEstilo}>
                    <b style={{ color: "var(--texto)" }}>{lote.papelNome}</b>
                    <span style={tagEstilo}>
                      lote {lote.indice} de {lote.total}
                    </span>
                    <span style={{ color: "var(--texto-fraco)", fontSize: 11.5 }}>
                      {lote.chaves.length} item(ns) · {lote.caracteres.toLocaleString("pt-BR")} chars
                    </span>
                  </button>
                  {aberto === i && (
                    <div>
                      <div style={{ display: "flex", gap: 8, margin: "6px 0" }}>
                        <button onClick={() => void copiar(lote, i)} style={botaoEstilo}>
                          {copiado === i ? "Copiado" : "Copiar prompt"}
                        </button>
                      </div>
                      <pre style={promptEstilo} data-testid={`simulacao-prompt-${i}`}>
                        {lote.prompt}
                      </pre>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

const sobreposicaoEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(8, 12, 19, 0.72)",
  zIndex: 60,
  display: "grid",
  placeItems: "center",
  padding: 24,
};

const painelEstilo: React.CSSProperties = {
  background: "var(--painel)",
  border: "1px solid var(--borda-forte)",
  borderRadius: 12,
  width: "min(900px, 100%)",
  maxHeight: "88vh",
  overflowY: "auto",
  padding: 18,
  boxShadow: "0 18px 48px rgba(0,0,0,.5)",
};

const cabecalhoEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const subtituloEstilo: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
};

const resumoEstilo: React.CSSProperties = { ...subtituloEstilo, marginTop: 14 };

const vazioEstilo: React.CSSProperties = { ...subtituloEstilo, marginTop: 16 };

const listaEstilo: React.CSSProperties = {
  listStyle: "none",
  margin: "14px 0 0",
  padding: 0,
  display: "grid",
  gap: 8,
};

const itemEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: 10,
  background: "var(--fundo-2)",
};

const linhaEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  background: "none",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 13,
  color: "var(--texto-2)",
  padding: 0,
};

const tagEstilo: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--texto-2)",
  background: "var(--painel)",
  border: "1px solid var(--borda)",
  borderRadius: 999,
  padding: "1px 8px",
  whiteSpace: "nowrap",
};

const promptEstilo: React.CSSProperties = {
  margin: 0,
  padding: 10,
  background: "var(--painel)",
  border: "1px solid var(--borda)",
  borderRadius: 6,
  fontSize: 11.5,
  lineHeight: 1.55,
  color: "var(--texto-2)",
  whiteSpace: "pre-wrap",
  maxHeight: 340,
  overflowY: "auto",
};

const botaoEstilo: React.CSSProperties = {
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12.5,
  cursor: "pointer",
};
