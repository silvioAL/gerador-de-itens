import { useEffect, useState } from "react";
import { apiTimes, NIVEIS_TIME, type MembroTime, type NivelTime } from "../api/client";

export interface MembrosTabProps {
  timeAtivo: string;
}

/** Rótulos que dizem o que o nível FAZ — "owner" sozinho não explica nada. */
const ROTULO_NIVEL: Record<NivelTime, string> = {
  visualizar: "visualizar — lê as quebras",
  operar: "operar — cria, deriva e refina",
  owner: "owner — tudo + configurações e membros",
};

/**
 * Administração de membros do time ativo (SPEC-09 §4, níveis na SPEC-38):
 * adicionar/remover/mudar nível é ato de owner; convidar é de qualquer
 * membro, com teto no próprio nível. A tela não esconde os controles de quem
 * não é owner — o servidor nega com o motivo, e o erro aparece aqui (mesma
 * régua de falha-aberta do usePermissoes).
 */
export function MembrosTab({ timeAtivo }: MembrosTabProps) {
  const [membros, setMembros] = useState<MembroTime[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoEmail, setNovoEmail] = useState("");
  const [novoNivel, setNovoNivel] = useState<NivelTime>("operar");
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
      await apiTimes.adicionarMembro(timeAtivo, novoEmail.trim(), novoNivel);
      setMembros((atual) => [...(atual ?? []), { email: novoEmail.trim(), nivel: novoNivel }]);
      setNovoEmail("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function remover(email: string) {
    setErro(null);
    try {
      await apiTimes.removerMembro(timeAtivo, email);
      setMembros((atual) => (atual ?? []).filter((m) => m.email !== email));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function mudarNivel(email: string, nivel: NivelTime) {
    setErro(null);
    try {
      await apiTimes.alterarNivel(timeAtivo, email, nivel);
      setMembros((atual) => (atual ?? []).map((m) => (m.email === email ? { ...m, nivel } : m)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function gerarConvite() {
    setErro(null);
    try {
      const convite = await apiTimes.criarConvite(timeAtivo, novoNivel);
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
        Cada membro de <strong>{timeAtivo}</strong> tem um nível: <em>visualizar</em> lê as quebras,{" "}
        <em>operar</em> faz o dia a dia, e <em>owner</em> cuida das configurações e dos membros. Qualquer membro pode
        convidar até o próprio nível; adicionar, remover e mudar nível é ação de owner.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          aria-label="E-mail do novo membro"
          value={novoEmail}
          onChange={(e) => setNovoEmail(e.target.value)}
          placeholder="pessoa@empresa.com"
          style={inputEstilo}
        />
        <select
          aria-label="Nível do novo membro"
          value={novoNivel}
          onChange={(e) => setNovoNivel(e.target.value as NivelTime)}
          style={inputEstilo}
        >
          {NIVEIS_TIME.map((n) => (
            <option key={n} value={n}>
              {ROTULO_NIVEL[n]}
            </option>
          ))}
        </select>
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
          {membros.map((m) => (
            <li key={m.email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
              <span style={{ color: "var(--texto-2)" }}>{m.email}</span>
              <div style={{ flex: 1 }} />
              <select
                aria-label={`Nível de ${m.email}`}
                value={m.nivel}
                onChange={(e) => void mudarNivel(m.email, e.target.value as NivelTime)}
                style={{ ...inputEstilo, minWidth: 0, fontSize: 12, padding: "4px 6px" }}
              >
                {NIVEIS_TIME.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button onClick={() => void remover(m.email)} style={linkBotaoEstilo}>
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
