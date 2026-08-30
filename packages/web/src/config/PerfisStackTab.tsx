import { useEffect, useState } from "react";
import type { DiagramaConfig } from "@gerador/engine";
import { apiStacks, type Stack } from "../api/client";

/**
 * SPEC-43 — Stacks conhecidas: catálogo global POR COMPONENTE, sem vínculo
 * por time. A SPEC-42 tinha matado os cards-por-time; aqui morre o próprio
 * vínculo (decisão do usuário, §190): "Java + Spring Boot" é uma stack DO
 * Serviço, "Camunda 7" é outra DO Processo — o nome para de mentir porque o
 * escopo é um componente só, e TODO valor do catálogo vira sugestão pra
 * todo mundo.
 */
export interface PerfisStackTabProps {
  config: DiagramaConfig;
  /** Criar/editar valores muda as sugestões — o App recarrega o agregado. */
  onPerfisMudaram: () => void;
}

/** Campos sugeríveis excluem o de identidade (`identificador: true`): valor
 * fixo pra nome de serviço/tópico/tabela não faz sentido (ver FieldSpec). */
function camposSugeriveis(config: DiagramaConfig, tipoNo: string) {
  return (config.nodeTypes[tipoNo]?.spec ?? []).filter((c) => !c.identificador);
}

interface FormularioValor {
  stackId: string;
  campo: string;
  valor: string;
}

export function PerfisStackTab({ config, onPerfisMudaram }: PerfisStackTabProps) {
  const [stacks, setStacks] = useState<Stack[] | null>(null);
  const [formulario, setFormulario] = useState<FormularioValor | null>(null);
  const [tipoNovaStack, setTipoNovaStack] = useState(Object.keys(config.nodeTypes)[0] ?? "");
  const [nomeNovaStack, setNomeNovaStack] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function recarregar() {
    try {
      setStacks((await apiStacks.catalogo()).stacks);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void recarregar();
  }, []);

  async function criarStack() {
    if (!nomeNovaStack.trim() || !tipoNovaStack) return;
    setErro(null);
    try {
      await apiStacks.criar(tipoNovaStack, nomeNovaStack.trim());
      setNomeNovaStack("");
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function salvarValor() {
    if (!formulario) return;
    const { stackId, campo, valor } = formulario;
    if (!stackId || !campo.trim() || !valor.trim()) return;
    setErro(null);
    try {
      await apiStacks.definirValores(stackId, { [campo.trim()]: valor.trim() });
      setFormulario(null);
      await recarregar();
      onPerfisMudaram();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  // Agrupado por componente: é o eixo que mantém os nomes honestos.
  const porTipo: Record<string, Stack[]> = {};
  for (const stack of stacks ?? []) {
    (porTipo[stack.tipoNo] ??= []).push(stack);
  }
  const stackDoForm = formulario ? (stacks ?? []).find((s) => s.id === formulario.stackId) : undefined;

  return (
    <div>
      <p style={introTextoEstilo}>
        As stacks conhecidas são o <strong>catálogo da organização</strong>, por componente: "Java + Spring Boot" é uma
        stack do <em>Serviço</em>, "Camunda 7" é outra, do <em>Processo</em>. Todo valor daqui vira{" "}
        <strong>sugestão pra todo mundo</strong> nos campos de componentes novos — sem vínculo por time. Dá pra
        capturar usando a ferramenta: preencha os campos de um nó e clique em "💾 salvar estes valores como stack
        conhecida" no painel.
      </p>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "4px 0 12px", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13, color: "var(--texto)" }}>Nova stack</strong>
        <select
          aria-label="Componente da nova stack"
          value={tipoNovaStack}
          onChange={(e) => setTipoNovaStack(e.target.value)}
          style={inputFormEstilo}
        >
          {Object.entries(config.nodeTypes).map(([tipo, cfg]) => (
            <option key={tipo} value={tipo}>
              {cfg.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Nome da nova stack"
          value={nomeNovaStack}
          onChange={(e) => setNomeNovaStack(e.target.value)}
          placeholder="ex.: Node 20 + Fastify"
          style={inputFormEstilo}
        />
        <button onClick={() => void criarStack()} style={botaoAdicionarEstilo} disabled={!nomeNovaStack.trim()}>
          + Criar stack
        </button>
      </div>
      {erro && <p style={{ fontSize: 12, color: "var(--vermelho)" }}>{erro}</p>}

      {formulario && stackDoForm && (
        <div style={formularioEstilo} data-testid="form-valor-de-stack">
          <strong style={{ fontSize: 12.5, color: "var(--texto)" }}>
            Valor em "{stackDoForm.nome}" ({config.nodeTypes[stackDoForm.tipoNo]?.label ?? stackDoForm.tipoNo})
          </strong>

          <label style={labelFormEstilo}>Campo</label>
          <select
            aria-label="Campo"
            value={formulario.campo}
            onChange={(e) => setFormulario({ ...formulario, campo: e.target.value })}
            style={inputFormEstilo}
          >
            {camposSugeriveis(config, stackDoForm.tipoNo).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          <label style={labelFormEstilo}>Valor</label>
          <input
            aria-label="Valor"
            value={formulario.valor}
            onChange={(e) => setFormulario({ ...formulario, valor: e.target.value })}
            style={inputFormEstilo}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => void salvarValor()} style={botaoAdicionarEstilo} data-testid="salvar-valor-de-stack">
              Salvar na stack
            </button>
            <button onClick={() => setFormulario(null)} style={botaoCancelarEstilo}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {stacks !== null && stacks.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--texto-mudo)" }}>
          Catálogo vazio — crie a primeira stack acima (ex.: "Java + Spring Boot" no Serviço), ou capture valores pelo
          painel de um nó.
        </p>
      )}

      {Object.entries(porTipo).map(([tipoNo, doTipo]) => (
        <div key={tipoNo} style={{ marginTop: 16 }}>
          <p style={tituloGrupoEstilo}>{config.nodeTypes[tipoNo]?.label ?? tipoNo}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {doTipo.map((stack) => (
              <div key={stack.id} style={cardEstilo} data-testid={`stack-${stack.nome}`}>
                <strong style={{ fontSize: 13, color: "var(--texto)" }}>{stack.nome}</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12.5, color: "var(--texto-2)", listStyle: "none" }}>
                  {Object.entries(stack.valores).map(([campo, valor]) => (
                    <li key={campo} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span>
                        {campo}: <strong>{valor}</strong>
                      </span>
                      <button
                        onClick={() => setFormulario({ stackId: stack.id, campo, valor })}
                        style={linkBotaoEstilo}
                        aria-label={`Editar ${campo} da stack ${stack.nome}`}
                      >
                        editar
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() =>
                    setFormulario({ stackId: stack.id, campo: camposSugeriveis(config, stack.tipoNo)[0]?.key ?? "", valor: "" })
                  }
                  style={{ ...linkBotaoEstilo, marginTop: 8 }}
                >
                  + adicionar valor
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  maxWidth: 760,
  marginTop: 0,
};

const cardEstilo: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel-alto)",
};

const formularioEstilo: React.CSSProperties = {
  ...cardEstilo,
  marginBottom: 12,
};

const tituloGrupoEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--texto-fraco)",
  margin: "0 0 6px",
};

const labelFormEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--texto-fraco)",
  margin: "8px 0 2px",
};

const inputFormEstilo: React.CSSProperties = {
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
  minWidth: 180,
};

const botaoAdicionarEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
};

const botaoCancelarEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto)",
  cursor: "pointer",
};

const linkBotaoEstilo: React.CSSProperties = {
  fontSize: 11.5,
  border: "none",
  background: "transparent",
  color: "var(--acento-claro)",
  cursor: "pointer",
  padding: 0,
};
