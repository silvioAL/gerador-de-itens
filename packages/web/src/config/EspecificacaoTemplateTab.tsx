import { useState } from "react";
import { VARIAVEIS_ESPECIFICACAO, validarTemplate } from "@gerador/engine";
import type { EspecificacaoTemplate } from "../api/client";

export interface EspecificacaoTemplateTabProps {
  /** Efetivo pro time ativo — template do time se existir, senão o global. */
  template: EspecificacaoTemplate;
  timeAtivo: string;
  onSalvar: (dados: { timeId?: string; conteudo: string }) => Promise<void>;
}

/**
 * Editor do template da especificação de entrega (SPEC-14) — 1 documento por
 * quebra, então 1 template só, global ou específico do time ativo (mesmo
 * padrão de override de `CamposNoTab`/`PerfisTimeTab`). A validação de
 * `{{variavel}}` desconhecida roda no cliente (feedback imediato) e de novo
 * no server (nunca confia só no cliente).
 */
export function EspecificacaoTemplateTab({ template, timeAtivo, onSalvar }: EspecificacaoTemplateTabProps) {
  const [editando, setEditando] = useState(false);
  const [escopo, setEscopo] = useState<"global" | "time">(template.timeId === "__global__" ? "global" : "time");
  const [conteudo, setConteudo] = useState(template.conteudo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function abrirEdicao() {
    setEscopo(template.timeId === "__global__" ? "global" : "time");
    setConteudo(template.conteudo);
    setErro(null);
    setEditando(true);
  }

  const variaveisDesconhecidas = validarTemplate(conteudo);

  async function salvar() {
    if (variaveisDesconhecidas.length > 0) return;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({ conteudo, timeId: escopo === "global" ? undefined : timeAtivo });
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <p style={introTextoEstilo}>
        A especificação de solução da quebra (botão "Gerar especificação de solução" na revisão) é um documento só,
        montado a partir deste template. Placeholders válidos:{" "}
        {VARIAVEIS_ESPECIFICACAO.map((v) => (
          <code key={v} style={codigoEstilo}>{`{{${v}}}`}</code>
        ))}
        .
      </p>

      <div style={cardEstilo}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 13, color: "#0f172a" }}>Template</strong>
          <span
            style={{
              ...tagOrigemEstilo,
              ...(template.timeId === "__global__" ? tagGlobalEstilo : tagTimeEstilo),
            }}
          >
            {template.timeId === "__global__" ? "global" : template.timeId}
          </span>
          <div style={{ flex: 1 }} />
          {!editando && (
            <button onClick={abrirEdicao} style={linkBotaoEstilo}>
              editar
            </button>
          )}
        </div>

        {editando ? (
          <div style={{ marginTop: 10 }}>
            <label style={labelFormEstilo}>Escopo</label>
            <select
              aria-label="Escopo"
              value={escopo}
              onChange={(e) => setEscopo(e.target.value as "global" | "time")}
              style={inputFormEstilo}
            >
              <option value="time">Só o time ativo ({timeAtivo})</option>
              <option value="global">Global (todo mundo)</option>
            </select>

            <label style={labelFormEstilo}>Conteúdo</label>
            <textarea
              aria-label="Conteúdo do template"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              rows={16}
              style={textareaFormEstilo}
            />

            {variaveisDesconhecidas.length > 0 && (
              <p style={erroEstilo}>
                Variável(is) desconhecida(s): {variaveisDesconhecidas.map((v) => `{{${v}}}`).join(", ")}
              </p>
            )}
            {erro && <p style={erroEstilo}>{erro}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() => void salvar()}
                disabled={salvando || variaveisDesconhecidas.length > 0}
                style={{
                  ...botaoSalvarEstilo,
                  opacity: variaveisDesconhecidas.length > 0 ? 0.5 : 1,
                  cursor: variaveisDesconhecidas.length > 0 ? "not-allowed" : "pointer",
                }}
              >
                Salvar
              </button>
              <button onClick={() => setEditando(false)} style={botaoCancelarEstilo}>
                cancelar
              </button>
            </div>
          </div>
        ) : (
          <pre style={preEstilo}>{template.conteudo}</pre>
        )}
      </div>
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.6,
  marginTop: 0,
  maxWidth: 680,
};

const codigoEstilo: React.CSSProperties = {
  fontSize: 11.5,
  background: "#f1f5f9",
  padding: "1px 5px",
  borderRadius: 4,
  marginRight: 4,
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
  maxWidth: 680,
};

const preEstilo: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
  fontSize: 11.5,
  color: "#475569",
  background: "#f8fafc",
  borderRadius: 8,
  padding: 10,
  marginTop: 8,
  maxHeight: 320,
  overflow: "auto",
};

const tagOrigemEstilo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 7px",
  borderRadius: 999,
  flexShrink: 0,
};

const tagGlobalEstilo: React.CSSProperties = { background: "#e0e7ff", color: "#4338ca" };
const tagTimeEstilo: React.CSSProperties = { background: "#dcfce7", color: "#15803d" };

const labelFormEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#334155",
  marginTop: 8,
  display: "block",
};

const inputFormEstilo: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: 320,
};

const textareaFormEstilo: React.CSSProperties = {
  ...inputFormEstilo,
  maxWidth: "100%",
  fontFamily: "monospace",
  fontSize: 12,
  resize: "vertical",
};

const erroEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "#b91c1c",
  marginTop: 8,
  marginBottom: 0,
};

const botaoSalvarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
};

const botaoCancelarEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
};

const linkBotaoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "#4f46e5",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
};
