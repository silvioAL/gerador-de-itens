import { useState } from "react";
import type { DiagramaConfig, PerfisConfig } from "@gerador/engine";

export interface PerfisTimeTabProps {
  perfisTime: PerfisConfig;
  config: DiagramaConfig;
  onEditarValor: (timeId: string, tipoNo: string, campo: string, valor: string) => void;
}

export function PerfisTimeTab({ perfisTime, config, onEditarValor }: PerfisTimeTabProps) {
  const times = Object.entries(perfisTime);
  const [formulario, setFormulario] = useState<FormularioValor | null>(null);

  function abrirNovoValor() {
    const primeiroTipo = Object.keys(config.nodeTypes)[0] ?? "";
    setFormulario({
      timeId: times[0]?.[0] ?? "",
      tipoNo: primeiroTipo,
      campo: config.nodeTypes[primeiroTipo]?.spec[0]?.key ?? "",
      valor: "",
    });
  }

  function abrirEdicao(timeId: string, tipoNo: string, campo: string, valor: unknown) {
    setFormulario({ timeId, tipoNo, campo, valor: String(valor) });
  }

  function salvar() {
    if (!formulario) return;
    const { timeId, tipoNo, campo, valor } = formulario;
    if (!timeId.trim() || !tipoNo || !campo.trim() || !valor.trim()) return;
    onEditarValor(timeId.trim(), tipoNo, campo.trim(), valor.trim());
    setFormulario(null);
  }

  return (
    <div>
      <p style={introTextoEstilo}>
        Times podem ter uma stack conhecida (linguagem, framework...) que pré-preenche sugestões em campos novos, sem
        reconfigurar a cada nó. O jeito natural de capturar isso é usando a ferramenta de verdade: informe o time no
        campo do topo da tela, preencha os campos manualmente num nó, e clique em "💾 salvar estes valores como padrão
        do time" no painel de propriedades. Pra corrigir um valor já existente ou declarar um direto (ex.: "o time
        trabalha com Java"), use o formulário abaixo. Os dois gravam direto no perfil do time compartilhado — visível
        pra todo mundo com acesso a esse time assim que salvo.
      </p>

      {formulario ? (
        <FormularioEditarValor
          formulario={formulario}
          setFormulario={setFormulario}
          config={config}
          timesConhecidos={times.map(([id]) => id)}
          onSalvar={salvar}
          onCancelar={() => setFormulario(null)}
        />
      ) : (
        <button onClick={abrirNovoValor} style={botaoAdicionarEstilo}>
          + Adicionar ou corrigir um valor de stack
        </button>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        {times.length === 0 && (
          <p style={{ fontSize: 12, color: "#94a3b8" }}>
            Nenhum time com perfil cadastrado ainda em config/perfis-time.json.
          </p>
        )}
        {times.map(([timeId, perfil]) => (
          <div key={timeId} style={cardEstilo}>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>{timeId}</strong>
            {Object.entries(perfil).map(([tipo, campos]) => (
              <div key={tipo} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                  {config.nodeTypes[tipo]?.label ?? tipo}
                </div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12.5, color: "#334155", listStyle: "none" }}>
                  {Object.entries(campos as Record<string, unknown>).map(([campo, valor]) => (
                    <li key={campo} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span>
                        {campo}: <strong>{String(valor)}</strong>
                      </span>
                      <button
                        onClick={() => abrirEdicao(timeId, tipo, campo, valor)}
                        style={linkBotaoEstilo}
                        aria-label={`Editar ${campo} de ${config.nodeTypes[tipo]?.label ?? tipo} para ${timeId}`}
                      >
                        editar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface FormularioValor {
  timeId: string;
  tipoNo: string;
  campo: string;
  valor: string;
}

function FormularioEditarValor({
  formulario,
  setFormulario,
  config,
  timesConhecidos,
  onSalvar,
  onCancelar,
}: {
  formulario: FormularioValor;
  setFormulario: (f: FormularioValor) => void;
  config: DiagramaConfig;
  timesConhecidos: string[];
  onSalvar: () => void;
  onCancelar: () => void;
}) {
  const camposDoTipo = config.nodeTypes[formulario.tipoNo]?.spec ?? [];
  const podeSalvar =
    formulario.timeId.trim() !== "" && formulario.tipoNo !== "" && formulario.campo.trim() !== "" && formulario.valor.trim() !== "";

  return (
    <div style={formularioEstilo}>
      <label style={labelFormEstilo}>Time</label>
      <input
        aria-label="Time"
        list="perfis-times-conhecidos"
        value={formulario.timeId}
        onChange={(e) => setFormulario({ ...formulario, timeId: e.target.value })}
        placeholder="ex.: time-pagamentos"
        style={inputFormEstilo}
      />
      <datalist id="perfis-times-conhecidos">
        {timesConhecidos.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>

      <label style={labelFormEstilo}>Tipo de nó</label>
      <select
        aria-label="Tipo de nó"
        value={formulario.tipoNo}
        onChange={(e) => {
          const novoTipo = e.target.value;
          setFormulario({ ...formulario, tipoNo: novoTipo, campo: config.nodeTypes[novoTipo]?.spec[0]?.key ?? "" });
        }}
        style={inputFormEstilo}
      >
        {Object.entries(config.nodeTypes).map(([tipo, cfg]) => (
          <option key={tipo} value={tipo}>
            {cfg.label}
          </option>
        ))}
      </select>

      <label style={labelFormEstilo}>Campo</label>
      <select
        aria-label="Campo"
        value={formulario.campo}
        onChange={(e) => setFormulario({ ...formulario, campo: e.target.value })}
        style={inputFormEstilo}
      >
        {camposDoTipo.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label} ({c.key})
          </option>
        ))}
      </select>

      <label style={labelFormEstilo}>Valor</label>
      <input
        autoFocus
        aria-label="Valor"
        value={formulario.valor}
        onChange={(e) => setFormulario({ ...formulario, valor: e.target.value })}
        placeholder="ex.: Java"
        style={inputFormEstilo}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={onSalvar}
          disabled={!podeSalvar}
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
