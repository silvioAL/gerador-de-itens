import { useEffect, useState } from "react";
import { apiTimes } from "../api/client";

export interface MembrosTabProps {
  timeAtivo: string;
}

/**
 * Administração de membros do time ativo (SPEC-09 §4) — sem papel de admin
 * separado, qualquer pessoa que já é do time pode adicionar/remover/convidar.
 */
export function MembrosTab({ timeAtivo }: MembrosTabProps) {
  const [membros, setMembros] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoEmail, setNovoEmail] = useState("");
  const [linkConvite, setLinkConvite] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setMembros(null);
    apiTimes
      .listarMembros(timeAtivo)
      .then(setMembros)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, [timeAtivo]);

  async function adicionar() {
    if (!novoEmail.trim()) return;
    setErro(null);
    try {
      await apiTimes.adicionarMembro(timeAtivo, novoEmail.trim());
      setMembros((atual) => [...(atual ?? []), novoEmail.trim()]);
      setNovoEmail("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function remover(email: string) {
    setErro(null);
    try {
      await apiTimes.removerMembro(timeAtivo, email);
      setMembros((atual) => (atual ?? []).filter((m) => m !== email));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function gerarConvite() {
    setErro(null);
    try {
      const convite = await apiTimes.criarConvite(timeAtivo);
      setLinkConvite(convite.url);
      setCopiado(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function copiarLink() {
    if (!linkConvite) return;
    await navigator.clipboard.writeText(linkConvite);
    setCopiado(true);
  }

  return (
    <div>
      <p style={introTextoEstilo}>
        Qualquer pessoa do time <strong>{timeAtivo}</strong> pode adicionar, remover ou convidar novos membros — não
        existe um papel de administrador separado.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          aria-label="E-mail do novo membro"
          value={novoEmail}
          onChange={(e) => setNovoEmail(e.target.value)}
          placeholder="pessoa@empresa.com"
          style={inputEstilo}
        />
        <button onClick={() => void adicionar()} style={botaoEstilo} disabled={!novoEmail.trim()}>
          + Adicionar por e-mail
        </button>
        <button onClick={() => void gerarConvite()} style={botaoSecundarioEstilo}>
          Gerar link de convite
        </button>
      </div>

      {linkConvite && (
        <div style={conviteBoxEstilo}>
          <code style={{ fontSize: 12, wordBreak: "break-all" }}>{linkConvite}</code>
          <button onClick={() => void copiarLink()} style={{ ...botaoSecundarioEstilo, flexShrink: 0 }}>
            {copiado ? "✓ copiado" : "copiar"}
          </button>
        </div>
      )}

      {erro && <p style={{ fontSize: 12, color: "var(--vermelho)" }}>{erro}</p>}

      {membros === null ? (
        <p style={{ fontSize: 12, color: "var(--texto-mudo)" }}>Carregando…</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {membros.map((email) => (
            <li key={email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
              <span style={{ color: "var(--texto-2)" }}>{email}</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => void remover(email)} style={linkBotaoEstilo}>
                excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--texto-2)",
  lineHeight: 1.5,
  marginTop: 0,
  maxWidth: 680,
};

const inputEstilo: React.CSSProperties = {
  fontSize: 13,
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  minWidth: 220,
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const botaoSecundarioEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid rgba(99, 102, 241, 0.45)",
  background: "var(--painel)",
  color: "#a5b4fc",
  cursor: "pointer",
};

const conviteBoxEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  marginBottom: 16,
};

const linkBotaoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "var(--vermelho)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
};
