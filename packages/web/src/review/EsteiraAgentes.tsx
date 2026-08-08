import { PAPEIS_PADRAO, type PapelConfigurado } from "../api/client";

export interface EsteiraAgentesProps {
  /** SPEC-24 Fase F — papéis ATIVOS na ordem configurada. Default: os 4 de
   * fábrica (`PAPEIS_PADRAO`). */
  papeis?: PapelConfigurado[];
  /** ID do papel em execução; `null` quando a esteira não está rodando — a
   * faixa continua visível (papéis em repouso), só sem nenhum ativo. */
  papelAtual: string | null;
  /** Subtítulo do papel ativo: o que ele está fazendo agora (item N de M ·
   * rótulo). Vazio quando nada está rodando. */
  atividadeAtual?: string;
  pausado?: boolean;
}

/**
 * Faixa de agentes — o elemento de assinatura da tela (SPEC-24 Fase E):
 * os papéis configurados em ordem, cada um recebendo o artefato do anterior
 * (desde a Fase F a lista vem da config — reordenável, com papéis custom).
 * Fica numa banda própria abaixo do header (não espremida dentro dele —
 * achado real do usuário: "a barra dos agentes é menor, localização dos
 * textos" comparando com o protótipo), com número, nome, subtítulo de
 * estado e tick de conclusão por célula, e um token que atravessa a seta
 * a cada handoff.
 */
export function EsteiraAgentes({ papeis = PAPEIS_PADRAO, papelAtual, atividadeAtual, pausado }: EsteiraAgentesProps) {
  const indiceAtual = papelAtual ? papeis.findIndex((p) => p.id === papelAtual) : -1;

  return (
    <div style={faixaEstilo} role="status" aria-live="polite" aria-label="Esteira de agentes">
      {papeis.map((papel, i) => {
        const ativo = papel.id === papelAtual;
        // Sem papel ativo (esteira parada), ninguém está "feito" — a faixa
        // fica inteira em repouso, sem fingir progresso que não houve.
        const feito = indiceAtual >= 0 && i < indiceAtual;
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
                  {ativo && atividadeAtual
                    ? `${pausado ? "Pausado — " : ""}${atividadeAtual}`
                    : papel.descricao ?? ""}
                </span>
              </span>
              <span
                className={ativo && !pausado ? "handoff-tick-ativo" : undefined}
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
  background: "#101823",
  borderBottom: "1px solid #1B2533",
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
  borderBottom: "2px solid transparent",
  transition: "background 300ms ease, border-color 300ms ease",
};

const agenteAtivoEstilo: React.CSSProperties = {
  borderBottomColor: "#38bdf8",
  background: "rgba(56, 189, 248, 0.08)",
};

const numeroEstilo: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  color: "#5C6A7E",
  width: 20,
  flexShrink: 0,
  transition: "color 300ms ease",
};

const numeroAtivoEstilo: React.CSSProperties = { color: "#38bdf8" };
const numeroFeitoEstilo: React.CSSProperties = { color: "#8D9BB0" };

const quemEstilo: React.CSSProperties = { minWidth: 0, flex: 1 };

const nomeEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#5C6A7E",
  letterSpacing: "-0.01em",
  whiteSpace: "nowrap",
  transition: "color 300ms ease",
};

const nomeAtivoEstilo: React.CSSProperties = { color: "#E8EEF8" };
const nomeFeitoEstilo: React.CSSProperties = { color: "#8D9BB0" };

const subtituloEstilo: React.CSSProperties = {
  display: "block",
  fontFamily: "ui-monospace, monospace",
  fontSize: 10.5,
  color: "#263344",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  transition: "color 300ms ease",
};

const subtituloAtivoEstilo: React.CSSProperties = { color: "#8D9BB0" };

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
  border: "1px solid #263344",
};

const tickAtivoEstilo: React.CSSProperties = {
  ...tickBaseEstilo,
  border: "1.5px solid #38bdf8",
  borderTopColor: "transparent",
};

const tickFeitoEstilo: React.CSSProperties = {
  ...tickBaseEstilo,
  border: "1px solid rgba(62, 207, 142, 0.45)",
  background: "rgba(62, 207, 142, 0.14)",
  color: "#3ecf8e",
};

const hopEstilo: React.CSSProperties = {
  width: 34,
  flexShrink: 0,
  position: "relative",
  alignSelf: "center",
  height: 1,
  background: "#263344",
};

/** Ponta de seta do conector, em CSS puro (mesma técnica do `.hop::after`
 * do protótipo — borda triangular, sem SVG só pra isso). */
const hopSetaEstilo: React.CSSProperties = {
  position: "absolute",
  right: -1,
  top: -3,
  width: 0,
  height: 0,
  borderLeft: "5px solid #263344",
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
  color: "#38bdf8",
  background: "#15202D",
  border: "1px solid #263344",
  padding: "2px 7px",
  borderRadius: 20,
};
