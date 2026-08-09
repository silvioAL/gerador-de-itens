import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MensagemConversa {
  autor: "voce" | "agente";
  texto: string;
  /** Cartão de proposta que acompanha a fala do agente (diagrama, alterações
   * campo a campo). Fica fora do texto de propósito: proposta se revisa e se
   * aceita, não se lê como conversa. */
  extra?: ReactNode;
}

export interface JanelaConversaProps {
  titulo: string;
  /** Mostrado ao lado do título — deixa explícito que cada fase é uma conversa
   * própria, com escopo próprio (SPEC-27 §3). */
  fase: string;
  mensagens: MensagemConversa[];
  pensando: boolean;
  erro?: string | null;
  exemplo: string;
  valorInicial?: string;
  /** Barra opcional acima da entrada — é onde vive "Revisar os demais (N)". */
  acoes?: ReactNode;
  onEnviar: (texto: string) => void;
  onFechar: () => void;
}

/**
 * A casca da conversa (SPEC-27): histórico, entrada, estado "pensando".
 * Presentacional de propósito — quem guarda as mensagens e sabe o que fazer
 * com o texto é cada fase, porque é o escopo da fase que define o que entra
 * na janela do modelo.
 */
export function JanelaConversa({
  titulo,
  fase,
  mensagens,
  pensando,
  erro,
  exemplo,
  valorInicial,
  acoes,
  onEnviar,
  onFechar,
}: JanelaConversaProps) {
  const [entrada, setEntrada] = useState(valorInicial?.trim() ?? "");
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [mensagens.length, pensando]);

  function enviar() {
    const texto = entrada.trim();
    if (!texto || pensando) return;
    onEnviar(texto);
    setEntrada("");
  }

  return (
    <aside style={painelEstilo} data-testid={`conversa-${fase}`} aria-label={titulo}>
      <header style={cabecalhoEstilo}>
        <strong style={{ fontSize: 13 }}>{titulo}</strong>
        <span style={{ fontSize: 11, color: "var(--texto-mudo)" }}>fase: {fase}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={botaoFecharEstilo} aria-label="Fechar conversa">
          ×
        </button>
      </header>

      <div style={listaEstilo}>
        {mensagens.map((m, i) => (
          <div key={i} style={m.autor === "voce" ? balaoVoceEstilo : balaoAgenteEstilo}>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.texto}</div>
            {m.extra}
          </div>
        ))}
        {pensando && (
          <div style={balaoAgenteEstilo} data-testid="conversa-pensando">
            pensando…
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {erro && <p style={{ margin: "0 12px", fontSize: 11.5, color: "var(--vermelho)" }}>{erro}</p>}
      {acoes && <div style={acoesEstilo}>{acoes}</div>}

      <div style={rodapeEstilo}>
        <textarea
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia, Shift+Enter quebra linha — convenção de chat.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={3}
          disabled={pensando}
          placeholder={exemplo}
          aria-label="Descreva o que você quer"
          style={entradaEstilo}
        />
        <button onClick={enviar} disabled={pensando || !entrada.trim()} style={botaoEnviarEstilo}>
          {pensando ? "pensando…" : "Enviar"}
        </button>
      </div>
    </aside>
  );
}

export const cartaoEstilo: React.CSSProperties = {
  marginTop: 8,
  padding: 8,
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
};

export const botaoAcaoEstilo: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
};

export const botaoNeutroEstilo: React.CSSProperties = {
  ...botaoAcaoEstilo,
  border: "1px solid var(--borda-forte)",
  color: "var(--texto-fraco)",
};

const painelEstilo: React.CSSProperties = {
  position: "fixed",
  right: 0,
  top: 0,
  bottom: 0,
  width: 440,
  maxWidth: "100vw",
  display: "flex",
  flexDirection: "column",
  background: "var(--painel)",
  borderLeft: "1px solid var(--borda-forte)",
  zIndex: 60,
};

const cabecalhoEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid var(--borda)",
  color: "var(--texto)",
};

const listaEstilo: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const balaoBase: React.CSSProperties = {
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12.5,
  lineHeight: 1.6,
  border: "1px solid var(--borda)",
};

const balaoAgenteEstilo: React.CSSProperties = {
  ...balaoBase,
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto-2)",
};

const balaoVoceEstilo: React.CSSProperties = {
  ...balaoBase,
  background: "transparent",
  borderColor: "var(--acento)",
  color: "var(--texto)",
  alignSelf: "flex-end",
  maxWidth: "90%",
};

const acoesEstilo: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "0 12px",
  flexWrap: "wrap",
};

const rodapeEstilo: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-end",
  padding: 12,
  borderTop: "1px solid var(--borda)",
};

const entradaEstilo: React.CSSProperties = {
  flex: 1,
  padding: "7px 9px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto)",
  fontSize: 12.5,
  resize: "vertical",
};

const botaoEnviarEstilo: React.CSSProperties = {
  ...botaoAcaoEstilo,
  padding: "8px 14px",
  whiteSpace: "nowrap",
};

const botaoFecharEstilo: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--texto-fraco)",
  fontSize: 18,
  cursor: "pointer",
  lineHeight: 1,
};
