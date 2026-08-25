import type { ReactNode } from "react";
import { piorou, type LinhaDeDelta, type Remedicao } from "@gerador/engine";

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
 *
 * ## §284 — a seta que apontava para o mesmo lugar
 *
 * RELATO REAL, com print: *"o que me estranha aqui é 4 → 4, acho que ninguém
 * entende instintivamente o que é 4 → 4"*.
 *
 * Estava certo. Numa caixa intitulada **"Se confirmar este caminho"**, quem lê
 * espera uma consequência — e recebia uma equação para resolver antes de
 * concluir que não há nenhuma. "Não muda" é informação boa (é o preço sendo
 * zero, e é justamente o que o §263 quis mostrar antes do clique); o que estava
 * errado era escrevê-la como se fosse mudança.
 *
 * A casa já resolvia isso em português nas outras prévias — *"Nada muda — esse
 * campo já está exatamente assim"* (`previa-ficha-sem-efeito`) e *"Nenhuma
 * mudança neste item"* (`previa-sem-efeito`), ambas na `PdcaTab`. Aqui passa a
 * falar a mesma língua.
 */

/** A seta só existe quando há travessia. */
function mudou(l: LinhaDeDelta): boolean {
  return l.antes !== l.depois;
}
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

  const nadaMuda = remedicao.linhas.every((l) => !mudou(l));

  return (
    <div data-testid={testid} style={caixaEstilo}>
      <strong style={{ fontSize: 12 }}>{titulo}</strong>
      <div style={{ marginTop: 4, color: "var(--texto-fraco)", display: "flex", flexDirection: "column", gap: 2 }}>
        {nadaMuda ? (
          /* §284 — a resposta em uma frase, e não uma conta. O preço é zero, e
             dizer isso é o serviço que a caixa presta: quem lê decide sem ter
             de comparar dois números iguais. */
          <div data-testid="delta-sem-efeito">
            Nada muda —{" "}
            {remedicao.linhas.map((l, i) => (
              <span key={l.rotulo}>
                {i > 0 && "; "}
                {l.rotulo} continua em <strong>{l.antes}</strong>
              </span>
            ))}
            .
          </div>
        ) : (
          remedicao.linhas.map((l) =>
            mudou(l) ? (
              <div key={l.rotulo} data-testid={`delta-linha-${l.rotulo.replace(/\s+/g, "-")}`}>
                {l.rotulo} {l.antes} →{" "}
                {/* A cor só no que piora: pintar os dois lados faria a pessoa
                    procurar a diferença em vez de ver. */}
                <strong style={piorou(l) ? { color: "var(--amarelo)" } : undefined}>{l.depois}</strong>
              </div>
            ) : (
              /* Linha parada no meio de linhas que andaram: fica, porque sumir
                 esconderia a medida, mas sem a seta — ela é o que promete
                 travessia. */
              <div key={l.rotulo} data-testid={`delta-linha-${l.rotulo.replace(/\s+/g, "-")}`} style={{ opacity: 0.75 }}>
                {l.rotulo}: {l.antes} (não muda)
              </div>
            )
          )
        )}
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
