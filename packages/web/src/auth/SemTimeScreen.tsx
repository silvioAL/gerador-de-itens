import { useState } from "react";

export interface SemTimeScreenProps {
  onAceitarToken: (token: string) => Promise<void>;
  /** Cria um time novo dentro da organização única deste deploy (SPEC-13) —
   * qualquer sessão pode, mesmo sem pertencer a time nenhum ainda. */
  onCriarTime: (timeId: string) => Promise<void>;
  onSair: () => Promise<void>;
  erro: string | null;
}

/** Aceita tanto o token puro quanto a URL inteira do convite (`.../?convite=TOKEN`). */
function extrairToken(valor: string): string {
  const bruto = valor.trim();
  try {
    return new URL(bruto).searchParams.get("convite") ?? bruto;
  } catch {
    return bruto;
  }
}

/**
 * Sem time nenhum ainda — acontece com quem chegou aqui por login direto (não
 * por um link de convite), ou cujo convite falhou em aceitar sozinho ao
 * carregar a página. Deixa colar o link (ou só o código) manualmente, em vez
 * de só dizer "peça um convite" sem dar um jeito de usá-lo aqui mesmo.
 */
export function SemTimeScreen({ onAceitarToken, onCriarTime, onSair, erro }: SemTimeScreenProps) {
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [nomeTime, setNomeTime] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);

  async function aceitar() {
    const token = extrairToken(entrada);
    if (!token) return;
    setEnviando(true);
    try {
      await onAceitarToken(token);
    } finally {
      setEnviando(false);
    }
  }

  async function criar() {
    if (!nomeTime.trim()) return;
    setErroCriar(null);
    setCriando(true);
    try {
      await onCriarTime(nomeTime.trim());
    } catch (e) {
      setErroCriar(e instanceof Error ? e.message : String(e));
      setCriando(false);
    }
  }

  return (
    <div style={containerEstilo}>
      <div style={cardEstilo}>
        <strong style={{ fontSize: 15, color: "var(--texto)" }}>Você ainda não pertence a nenhum time</strong>
        <p style={{ fontSize: 12.5, color: "var(--texto-fraco)", marginTop: 4, marginBottom: 16 }}>
          Cole aqui o link (ou só o código) do convite que alguém de um time já existente te mandou.
        </p>

        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder="link ou código do convite"
          style={inputEstilo}
        />

        {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 10, marginBottom: 0 }}>{erro}</p>}

        <button
          onClick={() => void aceitar()}
          disabled={!entrada.trim() || enviando}
          style={{ ...botaoEstilo, opacity: entrada.trim() ? 1 : 0.5, marginTop: 16 }}
        >
          {enviando ? "Entrando…" : "Aceitar convite"}
        </button>

        <div style={separadorEstilo}>
          <div style={linhaSeparadorEstilo} />
          <span style={{ fontSize: 11, color: "var(--texto-mudo)" }}>ou</span>
          <div style={linhaSeparadorEstilo} />
        </div>

        <p style={{ fontSize: 12.5, color: "var(--texto-fraco)", marginTop: 0, marginBottom: 8 }}>
          Ninguém te convidou ainda? Crie um time novo — você vira o primeiro membro dele.
        </p>
        <input
          value={nomeTime}
          onChange={(e) => setNomeTime(e.target.value)}
          placeholder="nome do time (ex.: time-pagamentos)"
          style={inputEstilo}
        />
        {erroCriar && <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 10, marginBottom: 0 }}>{erroCriar}</p>}
        <button
          onClick={() => void criar()}
          disabled={!nomeTime.trim() || criando}
          style={{ ...botaoSecundarioEstilo, opacity: nomeTime.trim() ? 1 : 0.5, marginTop: 12 }}
        >
          {criando ? "Criando…" : "Criar time"}
        </button>

        <button onClick={() => void onSair()} style={botaoSairEstilo}>
          Sair
        </button>
      </div>
    </div>
  );
}

const containerEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "var(--painel)",
  fontFamily: "system-ui, sans-serif",
};

const cardEstilo: React.CSSProperties = {
  width: 340,
  padding: 24,
  borderRadius: 12,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const inputEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  boxSizing: "border-box",
};

const botaoEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const separadorEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  margin: "16px 0 12px",
};

const linhaSeparadorEstilo: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "var(--borda)",
};

const botaoSecundarioEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid rgba(99, 102, 241, 0.45)",
  background: "var(--painel)",
  color: "#a5b4fc",
  cursor: "pointer",
};

const botaoSairEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  padding: "8px 12px",
  borderRadius: 7,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
  marginTop: 10,
};
