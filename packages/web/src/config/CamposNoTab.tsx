import { useState } from "react";
import type { DiagramaConfig } from "@gerador/engine";
import type { CampoNo, DadosCampoNo } from "../api/client";

export interface CamposNoTabProps {
  config: DiagramaConfig;
  camposNo: CampoNo[];
  timeAtivo: string;
  onCriar: (dados: DadosCampoNo) => Promise<void>;
  onAtualizar: (id: string, dados: Partial<DadosCampoNo>) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}

const TIPOS_CAMPO: CampoNo["type"][] = ["text", "textarea", "number", "boolean", "select"];

interface FormularioCampo {
  id?: string;
  escopo: "global" | "time";
  tipoNo: string;
  key: string;
  label: string;
  type: CampoNo["type"];
  required: boolean;
  valorPadrao: string;
  opcoes: string;
  ajuda: string;
}

function formularioVazio(tipoNo: string): FormularioCampo {
  return {
    escopo: "time",
    tipoNo,
    key: "",
    label: "",
    type: "text",
    required: false,
    valorPadrao: "",
    opcoes: "",
    ajuda: "",
  };
}

function formularioDeCampo(campo: CampoNo): FormularioCampo {
  return {
    id: campo.id,
    escopo: campo.timeId === "__global__" ? "global" : "time",
    tipoNo: campo.tipoNo,
    key: campo.key,
    label: campo.label,
    type: campo.type,
    required: campo.required,
    valorPadrao: campo.valorPadrao ?? "",
    opcoes: (campo.opcoes ?? []).join(", "),
    ajuda: campo.ajuda ?? "",
  };
}

/**
 * Editor de `campos_no` — adiciona/edita/exclui campos de formulário por tipo
 * de nó, global (visível pra todos) ou só do time ativo (SPEC-08 §3). Antes só
 * dava pra fazer isso editando `config/diagrama.json` na mão.
 */
export function CamposNoTab({ config, camposNo, timeAtivo, onCriar, onAtualizar, onExcluir }: CamposNoTabProps) {
  const tiposDeNo = Object.keys(config.nodeTypes);
  const [formulario, setFormulario] = useState<FormularioCampo | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setFormulario(formularioVazio(tiposDeNo[0] ?? ""));
  }

  function abrirEdicao(campo: CampoNo) {
    setFormulario(formularioDeCampo(campo));
  }

  async function salvar() {
    if (!formulario) return;
    if (!formulario.tipoNo || !formulario.key.trim() || !formulario.label.trim()) return;

    const dados: Partial<DadosCampoNo> = {
      tipoNo: formulario.tipoNo,
      key: formulario.key.trim(),
      label: formulario.label.trim(),
      type: formulario.type,
      required: formulario.required,
      valorPadrao: formulario.valorPadrao.trim() || undefined,
      opcoes: formulario.type === "select" ? formulario.opcoes.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      ajuda: formulario.ajuda.trim() || undefined,
    };

    setSalvando(true);
    try {
      if (formulario.id) {
        await onAtualizar(formulario.id, dados);
      } else {
        await onCriar({
          ...(dados as DadosCampoNo),
          timeId: formulario.escopo === "global" ? undefined : timeAtivo,
        });
      }
      setFormulario(null);
    } finally {
      setSalvando(false);
    }
  }

  const porTipo = new Map<string, CampoNo[]>();
  for (const campo of camposNo) {
    const lista = porTipo.get(campo.tipoNo) ?? [];
    lista.push(campo);
    porTipo.set(campo.tipoNo, lista);
  }

  return (
    <div>
      <p style={introTextoEstilo}>
        Cada tipo de nó (Serviço, Fila Rabbit...) tem um conjunto de campos de formulário. Um campo "global" aparece
        pra todo mundo; um campo do time <strong>{timeAtivo}</strong> aparece só quando esse time é o ativo, e
        sobrescreve um global de mesma chave.
      </p>

      {formulario ? (
        <FormularioCampoNo
          formulario={formulario}
          tiposDeNo={tiposDeNo}
          setFormulario={setFormulario}
          onSalvar={salvar}
          onCancelar={() => setFormulario(null)}
          salvando={salvando}
        />
      ) : (
        <button onClick={abrirNovo} style={botaoAdicionarEstilo}>
          + Adicionar campo
        </button>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        {[...porTipo.entries()].map(([tipoNo, campos]) => (
          <div key={tipoNo} style={cardEstilo}>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>{config.nodeTypes[tipoNo]?.label ?? tipoNo}</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none" }}>
              {campos.map((campo) => (
                <li
                  key={campo.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12.5 }}
                >
                  <span
                    style={{
                      ...tagOrigemEstilo,
                      ...(campo.timeId === "__global__" ? tagGlobalEstilo : tagTimeEstilo),
                    }}
                  >
                    {campo.timeId === "__global__" ? "global" : campo.timeId}
                  </span>
                  <span style={{ color: "#334155" }}>
                    {campo.label} <span style={{ color: "#94a3b8" }}>({campo.key}, {campo.type})</span>
                  </span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => abrirEdicao(campo)} style={linkBotaoEstilo}>
                    editar
                  </button>
                  <button onClick={() => void onExcluir(campo.id)} style={{ ...linkBotaoEstilo, color: "#b91c1c" }}>
                    excluir
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {camposNo.length === 0 && (
          <p style={{ fontSize: 12, color: "#94a3b8" }}>Nenhum campo customizado ainda — os tipos de nó usam só o spec padrão.</p>
        )}
      </div>
    </div>
  );
}

function FormularioCampoNo({
  formulario,
  tiposDeNo,
  setFormulario,
  onSalvar,
  onCancelar,
  salvando,
}: {
  formulario: FormularioCampo;
  tiposDeNo: string[];
  setFormulario: (f: FormularioCampo) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
}) {
  const podeSalvar = formulario.tipoNo !== "" && formulario.key.trim() !== "" && formulario.label.trim() !== "";

  return (
    <div style={formularioEstilo}>
      {!formulario.id && (
        <>
          <label style={labelFormEstilo}>Escopo</label>
          <select
            aria-label="Escopo"
            value={formulario.escopo}
            onChange={(e) => setFormulario({ ...formulario, escopo: e.target.value as "global" | "time" })}
            style={inputFormEstilo}
          >
            <option value="time">Só o time ativo</option>
            <option value="global">Global (todo mundo)</option>
          </select>
        </>
      )}

      <label style={labelFormEstilo}>Tipo de nó</label>
      <select
        aria-label="Tipo de nó"
        value={formulario.tipoNo}
        onChange={(e) => setFormulario({ ...formulario, tipoNo: e.target.value })}
        style={inputFormEstilo}
        disabled={!!formulario.id}
      >
        {tiposDeNo.map((tipo) => (
          <option key={tipo} value={tipo}>
            {tipo}
          </option>
        ))}
      </select>

      <label style={labelFormEstilo}>Chave (key)</label>
      <input
        aria-label="Chave"
        value={formulario.key}
        onChange={(e) => setFormulario({ ...formulario, key: e.target.value })}
        placeholder="ex.: motorPadrao"
        style={inputFormEstilo}
        disabled={!!formulario.id}
      />

      <label style={labelFormEstilo}>Rótulo</label>
      <input
        aria-label="Rótulo"
        value={formulario.label}
        onChange={(e) => setFormulario({ ...formulario, label: e.target.value })}
        placeholder="ex.: Motor padrão"
        style={inputFormEstilo}
      />

      <label style={labelFormEstilo}>Tipo de campo</label>
      <select
        aria-label="Tipo de campo"
        value={formulario.type}
        onChange={(e) => setFormulario({ ...formulario, type: e.target.value as CampoNo["type"] })}
        style={inputFormEstilo}
      >
        {TIPOS_CAMPO.map((tipo) => (
          <option key={tipo} value={tipo}>
            {tipo}
          </option>
        ))}
      </select>

      {formulario.type === "select" && (
        <>
          <label style={labelFormEstilo}>Opções (separadas por vírgula)</label>
          <input
            aria-label="Opções"
            value={formulario.opcoes}
            onChange={(e) => setFormulario({ ...formulario, opcoes: e.target.value })}
            placeholder="ex.: Java, Node, Python"
            style={inputFormEstilo}
          />
        </>
      )}

      <label style={labelFormEstilo}>Valor padrão (opcional)</label>
      <input
        aria-label="Valor padrão"
        value={formulario.valorPadrao}
        onChange={(e) => setFormulario({ ...formulario, valorPadrao: e.target.value })}
        style={inputFormEstilo}
      />

      <label style={labelFormEstilo}>Ajuda (opcional)</label>
      <input
        aria-label="Ajuda"
        value={formulario.ajuda}
        onChange={(e) => setFormulario({ ...formulario, ajuda: e.target.value })}
        style={inputFormEstilo}
      />

      <label style={{ ...labelFormEstilo, display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={formulario.required}
          onChange={(e) => setFormulario({ ...formulario, required: e.target.checked })}
        />
        Obrigatório
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={onSalvar}
          disabled={!podeSalvar || salvando}
          style={{ ...botaoSalvarEstilo, opacity: podeSalvar ? 1 : 0.5, cursor: podeSalvar ? "pointer" : "not-allowed" }}
        >
          Salvar
        </button>
        <button onClick={onCancelar} style={botaoCancelarEstilo}>
          cancelar
        </button>
      </div>
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.5,
  marginTop: 0,
  maxWidth: 680,
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
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

const botaoAdicionarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const formularioEstilo: React.CSSProperties = {
  marginTop: 4,
  padding: 14,
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  maxWidth: 420,
};

const labelFormEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#334155",
  marginTop: 8,
};

const inputFormEstilo: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  outline: "none",
  boxSizing: "border-box",
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
