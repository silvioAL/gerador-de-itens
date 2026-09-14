import type { PapelConfigurado } from "../api/client";

export interface EsteiraAoVivoProps {
  /** Os papéis ATIVOS, na ordem em que a esteira roda — a mesma ordem que
   * `fluxoDaEsteira` usa para montar os nós de agente. */
  papeis: PapelConfigurado[];
  /** id do papel em execução; `null` quando a esteira não está rodando (a
   * faixa fica em repouso) ou já terminou (todos ficam "feito"). */
  papelAtual: string | null;
  /** Concluída — todos os papéis ficam marcados como feito, mesmo sem um
   * `papelAtual` no meio (a corrida pode ter menos nós que papéis, se algum
   * item não bateu com o contexto de ninguém). */
  concluida?: boolean;
  /** Trecho do texto que o papel ativo está escrevendo agora. */
  atividadeAtual?: string;
}

/**
 * §411 — **a experiência que existia antes de a esteira virar um fluxo
 * plugável.** Achado do usuário (revendo esta mesma rodada): *"gosto bastante
 * dessa forma com as animações, os conectores eram animados... precisamos
 * plugar aquela tela como experiência"*. O componente original
 * (`review/EsteiraAgentes.tsx`) morreu na SPEC-107 G5c-3 junto com a tela de
 * revisão inteira — mas o desenho dele (faixa de papéis, seta com handoff
 * animado, tick por etapa) não tinha nada de específico à tela morta.
 * Recriado aqui, plugado na execução AO VIVO de verdade (`executarAoVivo`,
 * SPEC-107 fatia D) em vez de um estado simulado — é a diferença entre "a
 * esteira virou plugável" (arquitetura, para trás) e "a experiência de vê-la
 * rodar" (visual, resgatada).
 */
export function EsteiraAoVivo({ papeis, papelAtual, concluida, atividadeAtual }: EsteiraAoVivoProps) {
  const indiceAtual = papelAtual ? papeis.findIndex((p) => p.id === papelAtual) : -1;

  if (papeis.length === 0) return null;

  return (
    <div style={faixaEstilo} role="status" aria-live="polite" aria-label="Esteira de agentes" data-testid="esteira-ao-vivo">
      {papeis.map((papel, i) => {
        const ativo = papel.id === papelAtual;
        // Sem papel ativo e sem conclusão, ninguém está "feito" — a faixa
        // fica inteira em repouso, sem fingir progresso que não houve.
        const feito = concluida || (indiceAtual >= 0 && i < indiceAtual);
        return (
          <div key={papel.id} style={celulaWrapEstilo}>
            {i > 0 && (
              <div style={hopEstilo}>
                <span style={hopSetaEstilo} />
                {/* `key={indiceAtual}` remonta o token a cada handoff,
                    retriggerando a animação CSS — só na seta recém-cruzada. */}
                {ativo && atividadeAtual && (
                  <span key={indiceAtual} className="handoff-hop-token" style={hopTokenEstilo}>
                    {papeis[i - 1].nome} → {papel.nome}
                  </span>
                )}
              </div>
            )}
            <div
              data-testid={`handoff-${papel.id}`}
              aria-current={ativo ? "step" : undefined}
              style={{ ...agenteEstilo, ...(ativo ? agenteAtivoEstilo : {}) }}
            >
              <span style={{ ...numeroEstilo, ...(ativo ? numeroAtivoEstilo : feito ? numeroFeitoEstilo : {}) }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={quemEstilo}>
                <b style={{ ...nomeEstilo, ...(ativo ? nomeAtivoEstilo : feito ? nomeFeitoEstilo : {}) }}>
                  {papel.nome}
                </b>
                <span style={{ ...subtituloEstilo, ...(ativo ? subtituloAtivoEstilo : {}) }}>
                  {ativo && atividadeAtual ? atividadeAtual : (papel.descricao ?? "")}
                </span>
              </span>
              <span
                className={ativo ? "handoff-tick-ativo" : undefined}
                style={feito ? tickFeitoEstilo : ativo ? tickAtivoEstilo : tickPendenteEstilo}
              >
                {feito ? "✓" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const faixaEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  height: 62,
  padding: "0 20px",
  background: "var(--painel)",
  border: "1px solid var(--borda)",
  borderRadius: 10,
  flexShrink: 0,
};

const celulaWrapEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  flex: 1,
  minWidth: 0,
};

const agenteEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "0 16px",
  flex: 1,
  minWidth: 0,
  // Longhand de propósito: `agenteAtivoEstilo` troca só a COR, e misturar
  // `borderBottom` (shorthand) com `borderBottomColor` no mesmo elemento faz
  // o React descartar a cor a cada re-render, com um warning por quadro no
  // console (achado real do componente original).
  borderBottomWidth: 2,
  borderBottomStyle: "solid",
  borderBottomColor: "transparent",
  transition: "background 300ms ease, border-color 300ms ease",
};

const agenteAtivoEstilo: React.CSSProperties = {
  borderBottomColor: "var(--acento)",
  background: "rgba(56, 189, 248, 0.08)",
};

const numeroEstilo: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  color: "var(--texto-mudo)",
  width: 20,
  flexShrink: 0,
  transition: "color 300ms ease",
};

const numeroAtivoEstilo: React.CSSProperties = { color: "var(--acento)" };
const numeroFeitoEstilo: React.CSSProperties = { color: "var(--texto-fraco)" };

const quemEstilo: React.CSSProperties = { minWidth: 0, flex: 1 };

const nomeEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--texto-mudo)",
  letterSpacing: "-0.01em",
  whiteSpace: "nowrap",
  transition: "color 300ms ease",
};

const nomeAtivoEstilo: React.CSSProperties = { color: "var(--texto)" };
const nomeFeitoEstilo: React.CSSProperties = { color: "var(--texto-fraco)" };

const subtituloEstilo: React.CSSProperties = {
  display: "block",
  fontFamily: "ui-monospace, monospace",
  fontSize: 10.5,
  color: "var(--borda-forte)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  transition: "color 300ms ease",
};

const subtituloAtivoEstilo: React.CSSProperties = { color: "var(--texto-fraco)" };

const tickBaseEstilo: React.CSSProperties = {
  width: 15,
  height: 15,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontSize: 9,
  fontWeight: 700,
  flexShrink: 0,
  marginLeft: "auto",
};

const tickPendenteEstilo: React.CSSProperties = {
  ...tickBaseEstilo,
  border: "1px solid var(--borda-forte)",
};

const tickAtivoEstilo: React.CSSProperties = {
  ...tickBaseEstilo,
  border: "1.5px solid var(--acento)",
  borderTopColor: "transparent",
};

const tickFeitoEstilo: React.CSSProperties = {
  ...tickBaseEstilo,
  border: "1px solid rgba(62, 207, 142, 0.45)",
  background: "rgba(62, 207, 142, 0.14)",
  color: "var(--verde)",
};

const hopEstilo: React.CSSProperties = {
  width: 34,
  flexShrink: 0,
  position: "relative",
  alignSelf: "center",
  height: 1,
  background: "var(--borda-forte)",
};

/** Ponta de seta do conector, em CSS puro — sem SVG só pra isso. */
const hopSetaEstilo: React.CSSProperties = {
  position: "absolute",
  right: -1,
  top: -3,
  width: 0,
  height: 0,
  borderLeft: "5px solid var(--borda-forte)",
  borderTop: "3.5px solid transparent",
  borderBottom: "3.5px solid transparent",
};

const hopTokenEstilo: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: -26,
  transform: "translateX(-50%)",
  whiteSpace: "nowrap",
  fontFamily: "ui-monospace, monospace",
  fontSize: 10,
  color: "var(--acento)",
  background: "var(--painel-alto)",
  border: "1px solid var(--borda-forte)",
  padding: "2px 7px",
  borderRadius: 20,
};
