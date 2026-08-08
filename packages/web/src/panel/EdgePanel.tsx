import { camposVisiveisAresta } from "@gerador/engine";
import type { Aresta, DiagramaConfig } from "@gerador/engine";
import type { UseQuebra } from "../state/useQuebra";
import { FieldControl } from "./PropertiesPanel";

export interface EdgePanelProps {
  aresta: Aresta;
  config: DiagramaConfig;
  quebraState: UseQuebra;
}

export function EdgePanel({ aresta, config, quebraState }: EdgePanelProps) {
  const { quebra, definirTipoAresta, definirValorSpecAresta, removerAresta, setArestaSelecionadaId } = quebraState;
  const origem = quebra.diagrama.nodes.find((n) => n.id === aresta.source);
  const destino = quebra.diagrama.nodes.find((n) => n.id === aresta.target);
  const regra = destino ? (config.edgeRules[destino.type] ?? config.edgeRules._fallback) : undefined;
  const opcoesValidas = regra?.valid ?? [];
  const camposDoTipo = camposVisiveisAresta(config.edgeTypes[aresta.type]?.spec ?? []);

  return (
    <aside style={painelEstilo}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--texto-2)", margin: 0 }}>Aresta</h2>
      <p style={{ fontSize: 12, color: "var(--texto-fraco)", marginTop: 8 }}>
        {origem?.label ?? aresta.source} → {destino?.label ?? aresta.target}
      </p>

      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--texto-2)", display: "block", marginTop: 12 }}>
        Tipo
      </label>
      {opcoesValidas.length > 0 ? (
        <select
          value={aresta.type}
          onChange={(e) => definirTipoAresta(aresta.id, e.target.value)}
          style={inputEstilo}
        >
          {opcoesValidas.map((tipo) => (
            <option key={tipo} value={tipo}>
              {config.edgeTypes[tipo]?.label ?? tipo}
            </option>
          ))}
        </select>
      ) : (
        <p style={{ fontSize: 12, color: "var(--texto-mudo)" }}>
          {config.edgeTypes[aresta.type]?.label ?? aresta.type} (sem outras opções válidas para este destino)
        </p>
      )}

      {camposDoTipo.length > 0 && (
        <>
          <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid var(--borda)" }} />
          {camposDoTipo.map((campo) => (
            <div key={campo.key} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--texto-2)", display: "block", marginBottom: 4 }}>
                {campo.label}
                {campo.required && <span style={{ color: "#ef4444" }}> *</span>}
              </label>
              {campo.ajuda && <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "0 0 6px" }}>{campo.ajuda}</p>}
              <FieldControl
                campo={campo}
                valor={aresta.spec?.[campo.key]?.valor}
                sugestao={undefined}
                onChange={(v) => definirValorSpecAresta(aresta.id, campo.key, v)}
              />
            </div>
          ))}
        </>
      )}

      <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid var(--borda)" }} />
      <button
        onClick={() => {
          removerAresta(aresta.id);
          setArestaSelecionadaId(null);
        }}
        style={{ ...botaoEstilo, color: "var(--vermelho)", borderColor: "#fecaca" }}
      >
        Excluir aresta
      </button>
    </aside>
  );
}

const painelEstilo: React.CSSProperties = {
  width: 320,
  flexShrink: 0,
  borderLeft: "1px solid var(--borda)",
  padding: 16,
  overflowY: "auto",
  background: "var(--painel)",
  fontFamily: "system-ui, sans-serif",
};

const inputEstilo: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  outline: "none",
  boxSizing: "border-box",
  marginTop: 4,
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  cursor: "pointer",
};
