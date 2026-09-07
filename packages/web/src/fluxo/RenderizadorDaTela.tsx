import { useMemo } from "react";
import type { BlocoDaTela } from "@gerador/aplicacao";
// SPEC-110 fatia C — o markdown da casa, reusado: `EscritaDoItem` é o
// renderizador mínimo que o documento já usa (sem dependência nova, §38 do
// DocumentoScreen). Um segundo renderizador divergiria do primeiro.
import { EscritaDoItem } from "../documento/EscritaDoItem";

/**
 * SPEC-110 fatia C (D5) — **o renderizador da tela declarada.**
 *
 * Uma tela do time é uma pilha de blocos, e este componente é o que a desenha
 * — no stage (durante uma execução) e no preview do editor, pelo MESMO
 * caminho. Duas renderizações divergiriam na primeira diferença, e o preview
 * passaria a mentir sobre o que a pessoa vai ver.
 *
 * O que ele NÃO faz: decidir. A barra Avançar/Retornar é a moldura do shell
 * (D17c), e o bloco `acao` só diz qual rótulo ela usa — o comportamento é
 * fixo do catálogo (D17a: nada programável).
 */

const rotuloEstilo: React.CSSProperties = { fontSize: 11.5, color: "var(--texto-2)", display: "block", marginBottom: 4 };

const campoEstilo: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 13,
};

const preEstilo: React.CSSProperties = {
  margin: 0,
  padding: 8,
  borderRadius: 6,
  background: "var(--painel-alto)",
  color: "var(--texto-2)",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  overflowX: "auto",
  /**
   * O TETO é a correção de um defeito medido na validação visual: um `dado`
   * de formato `objeto` com o desenho inteiro da demanda ocupava a tela toda
   * e empurrava os CAMPOS para fora — quem revisava via o dado e não achava
   * onde responder. Dado é para consultar; a decisão é o que a tela existe
   * para colher.
   */
  maxHeight: 260,
  overflowY: "auto",
};

/** O que o bloco `dado` mostra, pelo FORMATO declarado: documento é texto
 * corrido (a régua da §2.1 — markdown não é JSON), lista e objeto vão pré
 * formatados como o rastro faz, e texto é texto. */
function ValorDoDado({ formato, valor }: { formato: string; valor: unknown }) {
  if (valor === undefined || valor === null || valor === "") {
    // §9.3 na tela: ausência é dita, não disfarçada de vazio.
    return <em style={{ fontSize: 12, color: "var(--texto-fraco)" }}>a fiação não trouxe este dado</em>;
  }
  if (formato === "documento" && typeof valor === "string") return <EscritaDoItem markdown={valor} />;
  if (formato === "texto" && typeof valor !== "object") return <div style={{ fontSize: 13 }}>{String(valor)}</div>;
  return <pre style={preEstilo}>{JSON.stringify(valor, null, 2).slice(0, 4000)}</pre>;
}

export function RenderizadorDaTela({
  blocos,
  entradas,
  valores,
  onMudarValor,
  somenteLeitura,
}: {
  blocos: BlocoDaTela[];
  /** O que a fiação trouxe — o que os blocos `dado` mostram. */
  entradas: Record<string, unknown>;
  /** O que a pessoa preencheu — o que os blocos `campo` guardam. */
  valores: Record<string, unknown>;
  onMudarValor: (chave: string, valor: unknown) => void;
  /** No preview do editor ninguém está decidindo nada de verdade. */
  somenteLeitura?: boolean;
}) {
  return (
    <div data-testid="tela-declarada" style={{ display: "grid", gap: 14, padding: 18, maxWidth: 760 }}>
      {blocos.length === 0 && (
        <p data-testid="tela-sem-blocos" style={{ fontSize: 13, color: "var(--texto-fraco)", margin: 0 }}>
          Esta tela ainda não tem blocos — adicione um texto, um dado da fiação ou um campo no editor.
        </p>
      )}
      {blocos.map((bloco, i) => {
        if (bloco.tipo === "texto") {
          return (
            <div key={i} data-testid={`bloco-texto-${i}`} style={{ fontSize: 13 }}>
              <EscritaDoItem markdown={bloco.markdown} />
            </div>
          );
        }
        if (bloco.tipo === "dado") {
          return (
            <div key={i} data-testid={`bloco-dado-${bloco.chave}`}>
              <span style={rotuloEstilo}>{bloco.rotulo}</span>
              <ValorDoDado formato={bloco.formato} valor={entradas[bloco.chave]} />
            </div>
          );
        }
        if (bloco.tipo === "campo") {
          const valor = valores[bloco.chave] ?? "";
          return (
            <label key={i} data-testid={`bloco-campo-${bloco.chave}`}>
              <span style={rotuloEstilo}>
                {bloco.rotulo}
                {bloco.obrigatorio ? " *" : ""}
              </span>
              {bloco.entrada === "escolha" ? (
                <select
                  aria-label={bloco.rotulo}
                  disabled={somenteLeitura}
                  value={String(valor)}
                  onChange={(e) => onMudarValor(bloco.chave, e.target.value)}
                  style={campoEstilo}
                >
                  <option value="">— escolha —</option>
                  {(bloco.opcoes ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={bloco.rotulo}
                  type={bloco.entrada === "numero" ? "number" : "text"}
                  disabled={somenteLeitura}
                  value={String(valor)}
                  onChange={(e) => onMudarValor(bloco.chave, e.target.value)}
                  style={campoEstilo}
                />
              )}
            </label>
          );
        }
        // O bloco `acao` NÃO desenha botão aqui: o acionador vive na moldura
        // do shell (D17c), que já é quem sabe continuar ou retornar a
        // execução. O que ele faz é dar o RÓTULO — e é isso que o preview
        // mostra, para a pessoa ver o que escreveu.
        return (
          <div key={i} data-testid={`bloco-acao-${bloco.acao}`} style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
            botão de <strong>{bloco.acao === "avancar" ? "avançar" : "retornar"}</strong>: “{bloco.rotulo}”
          </div>
        );
      })}
    </div>
  );
}

/**
 * D5/D17b — **o obrigatório trava o Avançar com motivo visível, não em
 * silêncio.** A frase é a mesma que a moldura mostra; quem calcula é aqui,
 * porque quem conhece os blocos é a tela.
 */
export function useMotivoParaNaoAvancar(blocos: BlocoDaTela[], valores: Record<string, unknown>): string | null {
  return useMemo(() => {
    const faltando = blocos
      .filter((b): b is Extract<BlocoDaTela, { tipo: "campo" }> => b.tipo === "campo" && Boolean(b.obrigatorio))
      .filter((b) => {
        const v = valores[b.chave];
        return v === undefined || v === null || String(v).trim() === "";
      })
      .map((b) => `“${b.rotulo}”`);
    if (faltando.length === 0) return null;
    return `preencha ${faltando.join(", ")} para avançar`;
  }, [blocos, valores]);
}
