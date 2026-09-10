import type { ReactNode } from "react";

/**
 * SPEC-110 fatia B (D17c) — **a moldura do stage.**
 *
 * O pedido do usuário foi explícito sobre o custo: *"isso precisa ficar
 * enlatado em componentes prontos… mínimo de impacto na mesa de projeto"*.
 * Então a barra Retornar/Avançar é uma MOLDURA que o shell monta AO REDOR da
 * tela existente — a bancada, o documento e a mesa não mudam por dentro, não
 * ganham prop nova, não sabem que estão num fluxo.
 *
 * É a mesma disciplina do gate da SPEC-107 C: quem decide vê o que a tela
 * mostra e responde com um dos dois verbos do catálogo (D17a: nada
 * programável). Screens declaradas podem substituir a barra pelo bloco `acao`
 * (fatia C); sem o bloco, esta barra fica (D17b) — **nunca existe tela sem
 * saída**.
 */

const barra: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
  borderBottom: "1px solid var(--borda)",
  background: "var(--painel-alto)",
  flexWrap: "wrap",
};

const botao: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  cursor: "pointer",
  fontSize: 12.5,
};

export function MolduraDoStage({
  nomeDoFluxo,
  dentroDe,
  nomeDaTela,
  descricao,
  ocupado,
  motivoParaNaoAvancar,
  rotuloAvancar,
  rotuloRetornar,
  erro,
  onAvancar,
  onRetornar,
  children,
}: {
  nomeDoFluxo: string;
  /**
   * SPEC-110 fatia J — **o caminho até a tela, quando ela mora num subfluxo.**
   *
   * A jornada da demanda pausa na bancada, que é um nó do ENSAIO, não do
   * mestre. Sem esta trilha a moldura diria "uma execução de Jornada da demanda
   * parou aqui" e a pessoa procuraria a bancada no desenho do mestre, onde ela
   * não está. Com ela: "Jornada da demanda › Ensaio de cenários".
   */
  dentroDe?: { fluxoId: string; nome: string }[];
  nomeDaTela: string;
  descricao?: string;
  ocupado?: boolean;
  /**
   * §2.4-6 — o Avançar travado DIZ por quê. Botão inerte sem motivo é o que
   * a casa recusa: quem não sabe o que falta preencher desiste da tela.
   */
  motivoParaNaoAvancar?: string | null;
  erro?: string | null;
  /** D17c — o rótulo que a tela DECLARA para cada acionador. Ausente, valem os
   * genéricos: uma tela sem bloco `acao` continua avançando e retornando. */
  rotuloAvancar?: string;
  rotuloRetornar?: string;
  onAvancar: () => void;
  onRetornar: () => void;
  children: ReactNode;
}) {
  return (
    <div data-testid="tela-do-stage" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={barra}>
        <div style={{ display: "grid", gap: 2, marginRight: "auto" }}>
          <strong style={{ fontSize: 13 }} data-testid="tela-do-stage-titulo">
            {nomeDaTela}
          </strong>
          <span style={{ fontSize: 11.5, color: "var(--texto-2)" }} data-testid="tela-do-stage-origem">
            uma execução de{" "}
            <strong>
              {nomeDoFluxo}
              {(dentroDe ?? []).map((nivel) => ` › ${nivel.nome}`).join("")}
            </strong>{" "}
            parou aqui — revise e decida
            {descricao ? ` · ${descricao}` : ""}
          </span>
        </div>
        {motivoParaNaoAvancar && (
          <span data-testid="tela-avancar-travado" style={{ fontSize: 11.5, color: "var(--texto-2)" }}>
            {motivoParaNaoAvancar}
          </span>
        )}
        {/**
         * SPEC-110 fatia G — o rótulo que a tela DECLARA vence o genérico.
         *
         * A D17c prometia "rótulo editável, comportamento fixo", e metade
         * disso não acontecia: o rótulo escrito virava uma linha de texto no
         * corpo ("botão de avançar: …") enquanto o botão de verdade dizia
         * "Avançar →". Quem escreveu "Aplicar o ajuste" via a própria frase
         * como legenda inerte e clicava noutra coisa — medido na validação
         * visual desta fatia.
         */}
        <button data-testid="tela-retornar" onClick={onRetornar} disabled={ocupado} style={botao}>
          {rotuloRetornar ?? "← Retornar"}
        </button>
        <button
          data-testid="tela-avancar"
          onClick={onAvancar}
          disabled={ocupado || Boolean(motivoParaNaoAvancar)}
          style={{ ...botao, background: "var(--acento)", color: "#fff", border: "1px solid var(--acento)" }}
        >
          {ocupado ? "…" : (rotuloAvancar ?? "Avançar →")}
        </button>
      </div>
      {erro && (
        <div data-testid="tela-do-stage-erro" style={{ padding: "8px 16px", color: "var(--vermelho)", fontSize: 12.5 }}>
          {erro}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
    </div>
  );
}
