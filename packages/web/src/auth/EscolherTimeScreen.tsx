export interface EscolherTimeScreenProps {
  timeIds: string[];
  onEscolher: (timeId: string) => void;
  onSair: () => Promise<void>;
}

/**
 * Só aparece quando a sessão tem mais de um time (SPEC-09 — um e-mail pode
 * pertencer a vários) — com um time só, `App.tsx` nem chega a mostrar isso,
 * segue direto. Escolher aqui é só o time ativo inicial; dá pra trocar depois
 * pelo seletor no header a qualquer momento.
 */
export function EscolherTimeScreen({ timeIds, onEscolher, onSair }: EscolherTimeScreenProps) {
  return (
    <div style={containerEstilo}>
      <div style={cardEstilo}>
        <strong style={{ fontSize: 15, color: "#0f172a" }}>Qual time?</strong>
        <p style={{ fontSize: 12.5, color: "#64748b", marginTop: 4, marginBottom: 16 }}>
          Você pertence a mais de um time — escolha qual fica ativo agora. Dá pra trocar depois, a qualquer momento.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {timeIds.map((timeId) => (
            <button key={timeId} onClick={() => onEscolher(timeId)} style={botaoTimeEstilo}>
              {timeId}
            </button>
          ))}
        </div>

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
  background: "#f8fafc",
  fontFamily: "system-ui, sans-serif",
};

const cardEstilo: React.CSSProperties = {
  width: 320,
  padding: 24,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const botaoTimeEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
  textAlign: "left",
};

const botaoSairEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  padding: "8px 12px",
  borderRadius: 7,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
  marginTop: 16,
};
