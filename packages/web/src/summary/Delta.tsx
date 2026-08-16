import type { ReactNode } from "react";
import { piorou, type Remedicao } from "@gerador/engine";

/**
 * SPEC-60 fatia A — a caixinha do "se você aceitar".
 *
 * ## Por que um componente e não três caixas parecidas
 *
 * O `delta-da-proposta` das necessidades foi aprovado em uso, e a fatia A leva
 * o mesmo mecanismo para a decisão e para o caminho. Três cópias divergiriam na
 * terceira mudança — e divergência aqui é pior que feiúra: o delta existe para
 * ser lido no meio de uma decisão, e um formato diferente por tela obriga a
 * reaprender no pior momento possível.
 *
 * ## O que ele não decide
 *
 * Não escolhe quais números mostrar, nem escreve o alerta: isso vem do motor
 * (`deltaDeDecisao`, `deltaDePercurso`), que é quem sabe medir. Aqui só se
 * decide **como** mostrar — inclusive que piorar tem cor e melhorar não tem.
 */
export interface DeltaProps {
  /** A manchete, no tempo do "ainda não aconteceu". */
  titulo: string;
  remedicao: Remedicao;
  /** O botão que executa o que o delta acabou de descrever. */
  children?: ReactNode;
  "data-testid"?: string;
}

export function Delta({ titulo, remedicao, children, "data-testid": testid = "delta" }: DeltaProps) {
  if (remedicao.linhas.length === 0) return null;


  return (
    <div data-testid={testid} style={caixaEstilo}>
      <strong style={{ fontSize: 12 }}>{titulo}</strong>
      <div style={{ marginTop: 4, color: "var(--texto-fraco)", display: "flex", flexDirection: "column", gap: 2 }}>
        {remedicao.linhas.map((l) => (
          <div key={l.rotulo} data-testid={`delta-linha-${l.rotulo.replace(/\s+/g, "-")}`}>
            {l.rotulo} {l.antes} →{" "}
            {/* A cor só no que piora: pintar os dois lados faria a pessoa
                procurar a diferença em vez de ver. */}
            <strong style={piorou(l) ? { color: "var(--amarelo)" } : undefined}>{l.depois}</strong>
          </div>
        ))}
      </div>
      {remedicao.alerta && (
        <div data-testid="delta-alerta" style={{ marginTop: 4, fontSize: 11, color: "var(--amarelo)" }}>
          {remedicao.alerta}
        </div>
      )}
      {children}
    </div>
  );
}

const caixaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda-forte)",
  borderRadius: 8,
  padding: "8px 10px",
  marginBottom: 10,
  fontSize: 12,
  background: "var(--fundo)",
};
