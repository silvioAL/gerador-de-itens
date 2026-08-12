import { useEffect, useState } from "react";
import type { DiagramaConfig, PerfisConfig } from "@gerador/engine";
import { apiPerfisStack, type PerfilStackCatalogo } from "../api/client";

export interface PerfisTimeTabProps {
  perfisTime: PerfisConfig;
  config: DiagramaConfig;
  timeAtivo: string;
  onEditarValor: (timeId: string, tipoNo: string, campo: string, valor: string) => void;
  /** Depois de apontar/trocar o perfil do time, o App recarrega a projeção. */
  onPerfisMudaram: () => void;
}

/** Campos sugeríveis por time excluem o campo de identidade (`identificador:
 * true` — nome do serviço, tópico, tabela...) de cada tipo: um valor fixo
 * sugerido pra esse campo em todo nó novo não faz sentido, já que cada
 * instância precisa do seu próprio nome único (achado real — ver FieldSpec). */
function camposSugeriveis(config: DiagramaConfig, tipoNo: string) {
  return (config.nodeTypes[tipoNo]?.spec ?? []).filter((c) => !c.identificador);
}

function primeiroCampoSugerivel(config: DiagramaConfig, tipoNo: string): string {
  return camposSugeriveis(config, tipoNo)[0]?.key ?? "";
}

export function PerfisTimeTab({ perfisTime, config, timeAtivo, onEditarValor, onPerfisMudaram }: PerfisTimeTabProps) {
  const times = Object.entries(perfisTime);
  const [formulario, setFormulario] = useState<FormularioValor | null>(null);
  // SPEC-38 F2 — o catálogo e os ponteiros vêm do servidor.
  const [catalogo, setCatalogo] = useState<{ perfis: PerfilStackCatalogo[]; ponteiros: Record<string, string> } | null>(null);
  const [nomeNovoPerfil, setNomeNovoPerfil] = useState("");
  const [erroCatalogo, setErroCatalogo] = useState<string | null>(null);

  async function recarregarCatalogo() {
    try {
      setCatalogo(await apiPerfisStack.catalogo());
    } catch (e) {
      setErroCatalogo(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void recarregarCatalogo();
  }, []);

  async function apontar(perfilId: string) {
    setErroCatalogo(null);
    try {
      await apiPerfisStack.apontar(timeAtivo, perfilId === "" ? null : perfilId);
      await recarregarCatalogo();
      onPerfisMudaram();
    } catch (e) {
      setErroCatalogo(e instanceof Error ? e.message : String(e));
    }
  }

  async function criarPerfil() {
    if (!nomeNovoPerfil.trim()) return;
    setErroCatalogo(null);
    try {
      await apiPerfisStack.criar(nomeNovoPerfil.trim());
      setNomeNovoPerfil("");
      await recarregarCatalogo();
    } catch (e) {
      setErroCatalogo(e instanceof Error ? e.message : String(e));
    }
  }

  function abrirNovoValor() {
    const primeiroTipo = Object.keys(config.nodeTypes)[0] ?? "";
    setFormulario({
      timeId: times[0]?.[0] ?? "",
      tipoNo: primeiroTipo,
      campo: primeiroCampoSugerivel(config, primeiroTipo),
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
        A stack é um <strong>perfil do catálogo</strong> ("Java + Spring Boot", "Node"...), não um atributo do time: o
        time <em>aponta</em> um perfil, e trocar de tecnologia é trocar o ponteiro. Os valores do perfil apontado
        pré-preenchem sugestões em campos novos. Pra capturar valores usando a ferramenta de verdade, preencha os
        campos num nó e clique em "💾 salvar estes valores como padrão do time" no painel — grava no perfil apontado
        (cria um se o time ainda não tiver). O formulário abaixo faz o mesmo, campo a campo.
      </p>

      <div style={cardEstilo}>
        <strong style={{ fontSize: 13, color: "var(--texto)" }}>Perfil de stack de {timeAtivo}</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <select
            aria-label="Perfil de stack do time ativo"
            value={catalogo?.ponteiros[timeAtivo] ?? ""}
            onChange={(e) => void apontar(e.target.value)}
            style={inputFormEstilo}
          >
            <option value="">— sem perfil —</option>
            {(catalogo?.perfis ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <input
            aria-label="Nome do novo perfil de stack"
            value={nomeNovoPerfil}
            onChange={(e) => setNomeNovoPerfil(e.target.value)}
            placeholder="ex.: Node 20 + Fastify"
            style={inputFormEstilo}
          />
          <button onClick={() => void criarPerfil()} style={botaoAdicionarEstilo} disabled={!nomeNovoPerfil.trim()}>
            + Criar perfil no catálogo
          </button>
        </div>
        {erroCatalogo && <p style={{ fontSize: 12, color: "var(--vermelho)", marginBottom: 0 }}>{erroCatalogo}</p>}
      </div>

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
          <p style={{ fontSize: 12, color: "var(--texto-mudo)" }}>
            Nenhum time apontando perfil de stack ainda — crie um perfil acima e aponte, ou capture pelo painel.
          </p>
        )}
        {times.map(([timeId, perfil]) => (
          <div key={timeId} style={cardEstilo}>
            <strong style={{ fontSize: 13, color: "var(--texto)" }}>{timeId}</strong>
            {Object.entries(perfil).map(([tipo, campos]) => (
              <div key={tipo} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--texto-fraco)", textTransform: "uppercase" }}>
                  {config.nodeTypes[tipo]?.label ?? tipo}
                </div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12.5, color: "var(--texto-2)", listStyle: "none" }}>
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
  const camposDoTipo = camposSugeriveis(config, formulario.tipoNo);
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
          setFormulario({ ...formulario, tipoNo: novoTipo, campo: primeiroCampoSugerivel(config, novoTipo) });
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
  color: "var(--texto-2)",
  lineHeight: 1.5,
  marginTop: 0,
  maxWidth: 680,
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: 14,
  background: "var(--painel)",
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
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  maxWidth: 420,
};

const labelFormEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--texto-2)",
  marginTop: 8,
};

const inputFormEstilo: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
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
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

const linkBotaoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "#a5b4fc",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
};
