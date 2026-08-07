import { useState } from "react";
import type { DiagramaConfig, FieldSpec } from "@gerador/engine";
import type { CampoNo, DadosCampoNo, ItemSpecCampo } from "../api/client";

export interface CamposNoTabProps {
  config: DiagramaConfig;
  camposNo: CampoNo[];
  timeAtivo: string;
  onCriar: (dados: DadosCampoNo) => Promise<void>;
  onAtualizar: (id: string, dados: Partial<DadosCampoNo>) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}

const TIPOS_CAMPO: CampoNo["type"][] = ["text", "textarea", "number", "boolean", "select", "lista"];
/** Tipos válidos pra um sub-campo dentro de "lista" — sem "lista" aninhada
 * (lista-de-lista é complexidade que ninguém pediu, ver FieldSpec.itemSpec). */
const TIPOS_ITEM: ItemSpecCampo["type"][] = ["text", "textarea", "number", "boolean", "select"];

function subCampoVazio(): ItemSpecCampo {
  return { key: "", label: "", type: "text" };
}

interface FormularioCampo {
  id?: string;
  escopo: "global" | "time";
  tipoNo: string;
  key: string;
  /** true quando a key não pode mudar (editando um campo existente, ou
   * sobrescrevendo um campo padrão — nos dois casos a key É o que liga este
   * registro ao original). false só pra "+ Adicionar campo": aí a key é uma
   * variável técnica interna, gerada sozinha a partir do Rótulo — o usuário
   * só a edita entrando no modo avançado. */
  chaveFixa: boolean;
  /** true assim que o usuário edita a key manualmente no modo avançado —
   * a partir daí para de regenerar a key sozinha a cada letra do Rótulo. */
  keyEditadaManualmente: boolean;
  label: string;
  type: CampoNo["type"];
  required: boolean;
  valorPadrao: string;
  opcoes: string;
  ajuda: string;
  /** Só usado quando `type === "lista"` — a forma de cada item. */
  itemSpec: ItemSpecCampo[];
}

/** Gera uma key técnica (camelCase, sem acento/espaço) a partir do Rótulo
 * digitado — mesma convenção já usada nas keys existentes (ex.: "topic",
 * "motorPadrao"). O usuário comum nunca precisa pensar em "key"; só quem
 * abrir o modo avançado vê e pode ajustar. */
function gerarChaveDoRotulo(rotulo: string): string {
  const semAcento = rotulo
    .normalize("NFD")
    .split("")
    .filter((c) => c.codePointAt(0)! < 128)
    .join("");
  return semAcento
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((palavra, i) => (i === 0 ? palavra.toLowerCase() : palavra[0].toUpperCase() + palavra.slice(1).toLowerCase()))
    .join("");
}

function formularioVazio(tipoNo: string): FormularioCampo {
  return {
    escopo: "time",
    tipoNo,
    key: "",
    chaveFixa: false,
    keyEditadaManualmente: false,
    label: "",
    type: "text",
    required: false,
    valorPadrao: "",
    opcoes: "",
    ajuda: "",
    itemSpec: [],
  };
}

function formularioDeCampo(campo: CampoNo): FormularioCampo {
  return {
    id: campo.id,
    escopo: campo.timeId === "__global__" ? "global" : "time",
    tipoNo: campo.tipoNo,
    key: campo.key,
    chaveFixa: true,
    keyEditadaManualmente: true,
    label: campo.label,
    type: campo.type,
    required: campo.required,
    valorPadrao: campo.valorPadrao ?? "",
    opcoes: (campo.opcoes ?? []).join(", "),
    ajuda: campo.ajuda ?? "",
    itemSpec: campo.itemSpec ?? [],
  };
}

/** Pré-preenche a partir de um campo padrão (`config/diagrama.json`) — "sobrescrever"
 * cria/edita um campos_no com a mesma key, que o merge de loadConfig.ts já resolve por
 * cima do padrão (mesma regra de override que perfis-time usa). Nunca edita o arquivo
 * de config direto — isso continua sendo "diagrama.json é a fonte", só ganha uma camada
 * de override por cima, visível e editável aqui. */
function formularioDeFieldSpec(tipoNo: string, campo: FieldSpec): FormularioCampo {
  return {
    escopo: "time",
    tipoNo,
    key: campo.key,
    chaveFixa: true,
    keyEditadaManualmente: true,
    label: campo.label,
    type: campo.type,
    required: campo.required ?? false,
    valorPadrao: campo.default !== undefined ? String(campo.default) : "",
    opcoes: (campo.options ?? []).join(", "),
    ajuda: campo.ajuda ?? "",
    // "lista" aninhada nunca é esperada aqui (diagrama.json não deveria ter —
    // ver FieldSpec.itemSpec), mas o tipo do engine não impede; cai pra "text"
    // em vez de propagar um valor que ItemSpecCampo não aceita.
    itemSpec: (campo.itemSpec ?? []).map((s) => ({
      key: s.key,
      label: s.label,
      type: s.type === "lista" ? "text" : s.type,
      options: s.options,
    })),
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
  const [mostrarChave, setMostrarChave] = useState(false);

  function abrirNovo() {
    setFormulario(formularioVazio(tiposDeNo[0] ?? ""));
    setMostrarChave(false);
  }

  function abrirEdicao(campo: CampoNo) {
    setFormulario(formularioDeCampo(campo));
    setMostrarChave(false);
  }

  function abrirSobrescrita(tipoNo: string, campo: FieldSpec) {
    setFormulario(formularioDeFieldSpec(tipoNo, campo));
    setMostrarChave(false);
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
      itemSpec:
        formulario.type === "lista"
          ? formulario.itemSpec.filter((s) => s.key.trim() && s.label.trim())
          : undefined,
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
        Cada tipo de nó (Serviço, Fila Rabbit...) já vem com um conjunto de campos base — "sobrescrever" cria uma
        versão específica pro time <strong>{timeAtivo}</strong> (ex.: a convenção de nomenclatura da fila, um sufixo
        obrigatório) que passa a valer no lugar do original, só aqui. Um campo "global" muda o original pra todo
        mundo; "+ Adicionar campo" cria um campo novo, que não existia antes.
      </p>

      {formulario ? (
        <FormularioCampoNo
          formulario={formulario}
          tiposDeNo={tiposDeNo}
          setFormulario={setFormulario}
          onSalvar={salvar}
          onCancelar={() => setFormulario(null)}
          salvando={salvando}
          mostrarChave={mostrarChave}
          onAlternarChave={() => setMostrarChave((v) => !v)}
        />
      ) : (
        <button onClick={abrirNovo} style={botaoAdicionarEstilo}>
          + Adicionar campo
        </button>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        {tiposDeNo.map((tipoNo) => {
          const camposCustom = porTipo.get(tipoNo) ?? [];
          const chavesSobrescritas = new Set(camposCustom.map((c) => c.key));
          const camposPadrao = config.nodeTypes[tipoNo]?.spec ?? [];

          return (
            <div key={tipoNo} style={cardEstilo}>
              <strong style={{ fontSize: 13, color: "#0f172a" }}>{config.nodeTypes[tipoNo]?.label ?? tipoNo}</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none" }}>
                {camposPadrao.map((campo) => (
                  <li
                    key={`padrao-${campo.key}`}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12.5 }}
                  >
                    <span style={{ ...tagOrigemEstilo, ...tagPadraoEstilo }}>padrão</span>
                    <span style={{ color: "#334155" }}>
                      {campo.label} <span style={{ color: "#94a3b8" }}>({campo.key}, {campo.type})</span>
                    </span>
                    {chavesSobrescritas.has(campo.key) && (
                      <span style={{ fontSize: 10.5, color: "#15803d" }}>sobrescrito abaixo pro seu time</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => abrirSobrescrita(tipoNo, campo)} style={linkBotaoEstilo}>
                      sobrescrever
                    </button>
                  </li>
                ))}
                {camposCustom.map((campo) => (
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
          );
        })}
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
  mostrarChave,
  onAlternarChave,
}: {
  formulario: FormularioCampo;
  tiposDeNo: string[];
  setFormulario: (f: FormularioCampo) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
  mostrarChave: boolean;
  onAlternarChave: () => void;
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

      <label style={labelFormEstilo}>Rótulo</label>
      <input
        aria-label="Rótulo"
        value={formulario.label}
        onChange={(e) => {
          const label = e.target.value;
          const key =
            !formulario.chaveFixa && !formulario.keyEditadaManualmente ? gerarChaveDoRotulo(label) : formulario.key;
          setFormulario({ ...formulario, label, key });
        }}
        placeholder="ex.: Motor padrão"
        style={inputFormEstilo}
      />

      <button type="button" onClick={onAlternarChave} style={{ ...linkBotaoEstilo, marginTop: 8, alignSelf: "flex-start" }}>
        {mostrarChave ? "ocultar" : "avançado: ver/editar a chave técnica"}
      </button>

      {mostrarChave && (
        <>
          <label style={labelFormEstilo}>Chave (key)</label>
          <input
            aria-label="Chave"
            value={formulario.key}
            onChange={(e) => setFormulario({ ...formulario, key: e.target.value, keyEditadaManualmente: true })}
            placeholder="ex.: motorPadrao"
            style={inputFormEstilo}
            disabled={formulario.chaveFixa}
          />
          {formulario.chaveFixa && (
            <span style={{ fontSize: 10.5, color: "#94a3b8" }}>
              Fixa — é o que liga este campo ao original, não dá pra mudar.
            </span>
          )}
        </>
      )}

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

      {formulario.type === "lista" && (
        <ItemSpecEditor
          itemSpec={formulario.itemSpec}
          onMudar={(itemSpec) => setFormulario({ ...formulario, itemSpec })}
        />
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

/**
 * Desenha a forma de cada item de um campo "lista" (ex.: os sub-campos
 * method/path/request/response de um endpoint) — não o dado em si, o
 * schema. Quem usa a lista de verdade (`PropertiesPanel`) recebe isso pronto
 * e monta uma linha repetível por item a partir daqui.
 */
function ItemSpecEditor({
  itemSpec,
  onMudar,
}: {
  itemSpec: ItemSpecCampo[];
  onMudar: (itemSpec: ItemSpecCampo[]) => void;
}) {
  function atualizar(idx: number, patch: Partial<ItemSpecCampo>) {
    onMudar(itemSpec.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function remover(idx: number) {
    onMudar(itemSpec.filter((_, i) => i !== idx));
  }

  return (
    <div style={{ marginTop: 4 }}>
      <label style={labelFormEstilo}>Sub-campos de cada item</label>
      <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 6px" }}>
        Ex.: pra "Endpoints", um item por endpoint — sub-campos method, path, request, response.
      </p>
      {itemSpec.length === 0 && (
        <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 6px" }}>Nenhum sub-campo ainda.</p>
      )}
      {itemSpec.map((sub, idx) => (
        <div key={idx} style={subCampoLinhaEstilo}>
          <input
            aria-label={`Chave do sub-campo ${idx + 1}`}
            value={sub.key}
            onChange={(e) => atualizar(idx, { key: e.target.value })}
            placeholder="chave (ex.: method)"
            style={{ ...inputFormEstilo, flex: 1 }}
          />
          <input
            aria-label={`Rótulo do sub-campo ${idx + 1}`}
            value={sub.label}
            onChange={(e) => atualizar(idx, { label: e.target.value })}
            placeholder="rótulo (ex.: Method)"
            style={{ ...inputFormEstilo, flex: 1 }}
          />
          <select
            aria-label={`Tipo do sub-campo ${idx + 1}`}
            value={sub.type}
            onChange={(e) => atualizar(idx, { type: e.target.value as ItemSpecCampo["type"] })}
            style={{ ...inputFormEstilo, width: 100 }}
          >
            {TIPOS_ITEM.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
          {sub.type === "select" && (
            <input
              aria-label={`Opções do sub-campo ${idx + 1}`}
              value={(sub.options ?? []).join(", ")}
              onChange={(e) =>
                atualizar(idx, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })
              }
              placeholder="opções (vírgula)"
              style={{ ...inputFormEstilo, flex: 1 }}
            />
          )}
          <button
            type="button"
            onClick={() => remover(idx)}
            style={linkBotaoEstilo}
            aria-label={`Remover sub-campo ${idx + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" style={{ ...linkBotaoEstilo, marginTop: 4 }} onClick={() => onMudar([...itemSpec, subCampoVazio()])}>
        + sub-campo
      </button>
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
const tagPadraoEstilo: React.CSSProperties = { background: "#f1f5f9", color: "#64748b" };

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

const subCampoLinhaEstilo: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  marginBottom: 6,
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
