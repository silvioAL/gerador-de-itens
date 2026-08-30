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

  /**
   * §281 — aqui a guarda não é higiene de teste, é a corrida de verdade.
   *
   * O efeito depende de `timeAtivo`. Trocar de time com a busca no ar deixava a
   * resposta ANTIGA chegar depois e sobrescrever a nova: a tela mostraria os
   * membros do time anterior, com o nome do time novo no cabeçalho. É o mesmo
   * defeito do §210 (itens da demanda anterior) e do §213 (canvas da demanda
   * anterior) — a terceira aparição da mesma corrida, agora fechada na origem.
   */
  useEffect(() => {
    let cancelado = false;
    setMembros(null);
    apiTimes
      .listarMembros(timeAtivo)
      .then((lista) => {
        if (!cancelado) setMembros(lista);
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
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
        <ul style={{ margin: 0, padding: 0, listStyle: "none", maxWidth: 680 }}>
          {membros.map((m) => (
            <li key={m.email} style={linhaDoMembroEstilo}>
              {/* `minWidth: 0` faz o e-mail ENCOLHER com reticências em vez de
                  empurrar o nível para longe — era um spacer `flex: 1` que
                  jogava o seletor no canto oposto da tela, a metros do nome de
                  quem ele descreve. */}
              <span
                title={m.email}
                style={{ minWidth: 0, fontSize: 14, color: "var(--texto)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {m.email}
              </span>
              <select
                aria-label={`Nível de ${m.email}`}
                value={m.nivel}
                onChange={(e) => void mudarNivel(m.email, e.target.value as NivelTime)}
                style={seletorDeNivelEstilo}
              >
                {NIVEIS_TIME.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button onClick={() => void remover(m.email)} style={{ ...linkBotaoEstilo, justifySelf: "start" }}>
                excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A linha vira CARTÃO: o contorno agrupa e-mail e nível como uma coisa só,
 * e a largura limitada (a mesma do texto de introdução) mantém os dois a um
 * palmo de distância em telas largas. */
const linhaDoMembroEstilo: React.CSSProperties = {
  // Grid, e não flex com espaçador: a coluna do e-mail tem TETO (320px), então
  // o nível fica logo ao lado do nome de quem ele descreve — e, com vários
  // membros, os seletores ficam alinhados entre si em vez de dançarem conforme
  // o tamanho de cada e-mail. A última coluna existe só para absorver a sobra.
  display: "grid",
  gridTemplateColumns: "minmax(0, 320px) auto 1fr",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  marginBottom: 6,
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
};

/** Maior que o resto do formulário de propósito: é um controle que MUDA
 * permissão, e estava em 12px, menor que o e-mail ao lado. */
const seletorDeNivelEstilo: React.CSSProperties = {
  fontSize: 14,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
  cursor: "pointer",
};

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
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
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
  color: "var(--acento-gente-texto)",
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
