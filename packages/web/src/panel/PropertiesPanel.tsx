import { useState } from "react";
import {
  calcularProntidao,
  camposVisiveis,
  resolverDefault,
  type FieldSpec,
  type No,
} from "@gerador/engine";
import type { UseQuebra } from "../state/useQuebra";
import type { DiagramaConfig, Aresta, PerfilTime } from "@gerador/engine";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ReadinessBadge } from "../summary/ReadinessBadge";

export interface PropertiesPanelProps {
  no: No | undefined;
  arestas: Aresta[];
  config: DiagramaConfig;
  quebraState: UseQuebra;
  /** Base de conhecimento de stack do time da quebra — preenche sugestões sem default estático. */
  perfilDoTime?: PerfilTime;
  /** Time da quebra atual — só pra decidir se mostra o botão de capturar perfil. */
  time?: string;
  /** Grava os campos manuais do nó atual como padrão do time — direto no servidor, visível pro resto do time. */
  onSalvarPerfilDoTime?: (tipoNo: string, valores: Record<string, unknown>) => void;
}

export function PropertiesPanel({
  no,
  arestas,
  config,
  quebraState,
  perfilDoTime,
  time,
  onSalvarPerfilDoTime,
}: PropertiesPanelProps) {
  if (!no) {
    return (
      <aside data-tour="properties-panel" style={painelEstilo}>
        <p style={{ color: "#64748b", fontSize: 13 }}>Selecione um nó para editar as propriedades.</p>
      </aside>
    );
  }

  const cfg = config.nodeTypes[no.type];
  if (!cfg) {
    return (
      <aside data-tour="properties-panel" style={painelEstilo}>
        <p style={{ color: "#b91c1c", fontSize: 13 }}>
          Tipo de nó "{no.type}" não existe na configuração carregada.
        </p>
      </aside>
    );
  }

  const visiveis = camposVisiveis(cfg.spec, no, arestas);
  const prontidao = calcularProntidao(cfg.spec, no, arestas);
  const { renomearNo, alternarStatus, definirTime, removerNo } = quebraState;

  const valoresManuais = Object.fromEntries(
    Object.entries(no.spec)
      .filter(([, v]) => v.origem === "manual")
      .map(([chave, v]) => [chave, v.valor])
  );
  const podeSalvarPerfil = Boolean(time) && Boolean(onSalvarPerfilDoTime) && Object.keys(valoresManuais).length > 0;

  return (
    <aside data-tour="properties-panel" style={painelEstilo}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "#334155", margin: 0 }}>{cfg.label}</h2>
        <ReadinessBadge nivel={prontidao.nivel} />
      </div>

      <input
        value={no.label}
        onChange={(e) => renomearNo(no.id, e.target.value)}
        style={{ ...inputEstilo, fontWeight: 600, fontSize: 15, marginTop: 10 }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <button style={statusBotaoEstilo} onClick={() => alternarStatus(no.id)}>
          {no.status === "novo" ? "novo" : "existente"} · trocar
        </button>
        {no.status === "existente" && (
          <input
            placeholder="time responsável"
            defaultValue={no.time ?? ""}
            onBlur={(e) => definirTime(no.id, e.target.value)}
            style={{ ...inputEstilo, fontSize: 12, padding: "4px 8px" }}
          />
        )}
      </div>

      {podeSalvarPerfil && (
        <button
          style={{ ...linkBotaoEstilo, marginTop: 8 }}
          onClick={() => onSalvarPerfilDoTime!(no.type, valoresManuais)}
          title={`Grava os campos preenchidos manualmente aqui como padrão de "${cfg.label}" para o time ${time} — direto no servidor, visível pro resto do time.`}
        >
          💾 salvar estes valores como padrão do time «{time}»
        </button>
      )}
      {!time && (
        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
          Sem time definido nesta quebra (campo no topo da tela) — por isso não há sugestão de stack nem como capturar
          uma.
        </p>
      )}

      <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />

      {visiveis.length === 0 && (
        <p style={{ color: "#94a3b8", fontSize: 12 }}>Nenhum campo aplicável (ainda).</p>
      )}

      {visiveis.map((campo) => (
        <FieldRow
          key={campo.key}
          no={no}
          campo={campo}
          prontidao={prontidao}
          quebraState={quebraState}
          perfilDoTime={perfilDoTime}
        />
      ))}

      <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />
      <button
        onClick={() => removerNo(no.id)}
        style={{ ...statusBotaoEstilo, color: "#b91c1c", borderColor: "#fecaca" }}
      >
        Excluir nó
      </button>
    </aside>
  );
}

interface FieldRowProps {
  no: No;
  campo: FieldSpec;
  prontidao: ReturnType<typeof calcularProntidao>;
  quebraState: UseQuebra;
  perfilDoTime?: PerfilTime;
}

function FieldRow({ no, campo, prontidao, quebraState, perfilDoTime }: FieldRowProps) {
  const { definirValorSpec, definirNA, removerNA, confirmarValor, descartarValor } = quebraState;
  const [motivoRascunho, setMotivoRascunho] = useState("");
  const [editandoNA, setEditandoNA] = useState(false);

  const valorSpec = no.spec[campo.key];
  const na = no.specNA[campo.key];
  const erro = prontidao.erros.find((e) => e.campo === campo.key);
  const pendente = prontidao.inferidosPendentes.includes(campo.key);
  const sugestao = resolverDefault(campo, no, perfilDoTime);
  const temSugestaoNaoUsada = valorSpec === undefined && sugestao !== undefined && sugestao !== "";

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
          {campo.label}
          {campo.required && <span style={{ color: "#ef4444" }}> *</span>}
        </label>
        {valorSpec && <ProvenanceBadge valorSpec={valorSpec} />}
      </div>
      {campo.ajuda && <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 6px" }}>{campo.ajuda}</p>}

      {na ? (
        <div style={naBoxEstilo}>
          <span style={{ fontSize: 12, color: "#78350f" }}>N/A — {na.motivo || "(sem motivo)"}</span>
          <button style={linkBotaoEstilo} onClick={() => removerNA(no.id, campo.key)}>
            remover
          </button>
        </div>
      ) : (
        <>
          <FieldControl campo={campo} valor={valorSpec?.valor} sugestao={sugestao} onChange={(v) => definirValorSpec(no.id, campo.key, v)} />
          {temSugestaoNaoUsada && (
            <button
              style={linkBotaoEstilo}
              onClick={() => definirValorSpec(no.id, campo.key, sugestao)}
            >
              usar sugestão: {String(sugestao)}
            </button>
          )}
        </>
      )}

      {pendente && valorSpec && (
        <div style={pendenteBoxEstilo}>
          <span>
            {valorSpec.origem === "inferido"
              ? `Inferido (confiança ${Math.round((valorSpec.confianca ?? 0) * 100)}%) — confirme.`
              : "Sugerido pelo copiloto — confirme ou descarte."}
          </span>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button style={linkBotaoEstilo} onClick={() => confirmarValor(no.id, campo.key)}>
              confirmar
            </button>
            {valorSpec.origem === "sugerido" && (
              <button style={linkBotaoEstilo} onClick={() => descartarValor(no.id, campo.key)}>
                descartar
              </button>
            )}
          </div>
        </div>
      )}

      {erro && (
        <p style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>
          {erro.codigo === "NA_SEM_MOTIVO" ? "N/A precisa de um motivo." : "Este campo não aceita N/A."}
        </p>
      )}

      <div style={{ marginTop: 4 }}>
        {campo.permiteNA !== false && !na && !editandoNA && (
          <button style={linkBotaoEstilo} onClick={() => setEditandoNA(true)}>
            marcar N/A
          </button>
        )}
        {editandoNA && (
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input
              autoFocus
              placeholder="motivo (obrigatório)"
              value={motivoRascunho}
              onChange={(e) => setMotivoRascunho(e.target.value)}
              style={{ ...inputEstilo, fontSize: 12, padding: "4px 8px" }}
            />
            <button
              style={linkBotaoEstilo}
              onClick={() => {
                definirNA(no.id, campo.key, motivoRascunho);
                setMotivoRascunho("");
                setEditandoNA(false);
              }}
            >
              salvar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldControl({
  campo,
  valor,
  sugestao,
  onChange,
}: {
  campo: FieldSpec;
  valor: unknown;
  sugestao: unknown;
  onChange: (v: unknown) => void;
}) {
  const placeholder = sugestao !== undefined && sugestao !== "" ? `sugestão: ${sugestao}` : undefined;

  if (campo.type === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input
          type="checkbox"
          aria-label={campo.label}
          checked={valor === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {valor === true ? "sim" : valor === false ? "não" : "(não definido)"}
      </label>
    );
  }
  if (campo.type === "select") {
    return (
      <select
        aria-label={campo.label}
        value={typeof valor === "string" ? valor : ""}
        onChange={(e) => onChange(e.target.value)}
        style={inputEstilo}
      >
        <option value="" disabled>
          {placeholder ?? "selecione…"}
        </option>
        {campo.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (campo.type === "number") {
    return (
      <input
        type="number"
        aria-label={campo.label}
        value={typeof valor === "number" ? valor : ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        style={inputEstilo}
      />
    );
  }
  if (campo.type === "textarea") {
    return <TextareaComExpandir campo={campo} valor={valor} placeholder={placeholder} onChange={onChange} />;
  }
  return (
    <input
      type="text"
      aria-label={campo.label}
      value={typeof valor === "string" ? valor : ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={inputEstilo}
    />
  );
}

/** Textarea de algumas linhas + botão pra expandir numa área maior — pra
 * conteúdo longo (contrato de payload, schema), onde uma linha só esconde o
 * que a pessoa escreveu (achado em uso real, não em revisão de código). */
function TextareaComExpandir({
  campo,
  valor,
  placeholder,
  onChange,
}: {
  campo: FieldSpec;
  valor: unknown;
  placeholder: string | undefined;
  onChange: (v: unknown) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const valorTexto = typeof valor === "string" ? valor : "";

  return (
    <>
      <div style={{ position: "relative" }}>
        <textarea
          aria-label={campo.label}
          value={valorTexto}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={textareaEstilo}
        />
        <button
          type="button"
          onClick={() => setExpandido(true)}
          style={botaoExpandirEstilo}
          aria-label={`Expandir ${campo.label}`}
          title="Expandir para editar numa área maior"
        >
          ⤢
        </button>
      </div>
      {expandido && (
        <div style={overlayExpandidoEstilo} onClick={() => setExpandido(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={campo.label}
            style={modalExpandidoEstilo}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ fontSize: 13, color: "#0f172a" }}>{campo.label}</strong>
              <button onClick={() => setExpandido(false)} style={fecharExpandidoEstilo} aria-label="Fechar">
                ×
              </button>
            </div>
            <textarea
              autoFocus
              aria-label={`${campo.label} (expandido)`}
              value={valorTexto}
              placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)}
              style={textareaExpandidoEstilo}
            />
          </div>
        </div>
      )}
    </>
  );
}

const painelEstilo: React.CSSProperties = {
  width: 320,
  flexShrink: 0,
  borderLeft: "1px solid #e2e8f0",
  padding: 16,
  overflowY: "auto",
  background: "#ffffff",
  fontFamily: "system-ui, sans-serif",
};

const inputEstilo: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  outline: "none",
  boxSizing: "border-box",
};

const statusBotaoEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  cursor: "pointer",
};

const linkBotaoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "#4f46e5",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  marginTop: 4,
};

const naBoxEstilo: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 6,
  padding: "6px 8px",
};

const pendenteBoxEstilo: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "#92400e",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 6,
  padding: "6px 8px",
};

const textareaEstilo: React.CSSProperties = {
  width: "100%",
  padding: "6px 30px 6px 10px",
  fontSize: 12.5,
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  resize: "vertical",
  minHeight: 64,
};

const botaoExpandirEstilo: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  fontSize: 12,
  lineHeight: 1,
  padding: "3px 5px",
  borderRadius: 4,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: "#64748b",
  cursor: "pointer",
};

const overlayExpandidoEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  zIndex: 70,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalExpandidoEstilo: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 12,
  width: "min(640px, 100%)",
  padding: 18,
  boxShadow: "0 20px 60px rgba(15, 23, 42, 0.35)",
};

const fecharExpandidoEstilo: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1,
  width: 26,
  height: 26,
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  background: "#fff",
  color: "#64748b",
  cursor: "pointer",
};

const textareaExpandidoEstilo: React.CSSProperties = {
  width: "100%",
  minHeight: 320,
  padding: 10,
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  resize: "vertical",
};
