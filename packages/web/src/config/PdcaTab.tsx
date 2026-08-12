import { useEffect, useState } from "react";
import { apiPdca } from "../api/client";

/**
 * SPEC-40 F1 — a cadência do PDCA (SPEC-39) ganha tela: antes só existia por
 * API. Gate real no servidor (permissão `acessos`); aqui, o formulário.
 */
export function PdcaTab() {
  const [cadencia, setCadencia] = useState<{ cadenciaUsos: number; cadenciaFeedback: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    apiPdca
      .config()
      .then(setCadencia)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  if (erro && !cadencia) return <p style={{ fontSize: 12.5, color: "var(--vermelho)" }}>{erro}</p>;
  if (!cadencia) return <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>Carregando…</p>;

  async function salvar() {
    setErro(null);
    setSalvo(false);
    try {
      await apiPdca.salvarConfig(cadencia!);
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.5, marginTop: 0 }}>
        O agente pergunta periodicamente se faltou (ou sobrou) item de checklist, regra ou campo — é o PDCA das
        configurações (SPEC-39). Aqui o admin define a cadência: a cada quantos usos vem a entrevista, e a cada
        quantas especificações geradas vem o pedido de feedback.
      </p>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={rotuloEstilo}>
          Entrevista a cada N derivações
          <input
            type="number"
            min={1}
            max={100}
            aria-label="Cadência da entrevista (usos)"
            value={cadencia.cadenciaUsos}
            onChange={(e) => setCadencia({ ...cadencia, cadenciaUsos: Number(e.target.value) })}
            style={campoEstilo}
          />
        </label>
        <label style={rotuloEstilo}>
          Feedback a cada N especificações
          <input
            type="number"
            min={1}
            max={100}
            aria-label="Cadência do feedback (especificações)"
            value={cadencia.cadenciaFeedback}
            onChange={(e) => setCadencia({ ...cadencia, cadenciaFeedback: Number(e.target.value) })}
            style={campoEstilo}
          />
        </label>
        <button onClick={() => void salvar()} style={botaoEstilo}>
          Salvar cadência
        </button>
        {salvo && <span style={{ fontSize: 12, color: "var(--verde, #4ade80)" }}>salvo ✓</span>}
      </div>
      {erro && <p style={{ fontSize: 12, color: "var(--vermelho)" }}>{erro}</p>}
    </div>
  );
}

const rotuloEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--texto-2)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const campoEstilo: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
  width: 120,
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};
